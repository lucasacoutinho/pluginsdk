import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Fingerprint, PlanId, type RepairPlanBody } from "../contracts/Installer.ts"
import * as Writers from "../contracts/Writers.ts"
import { parseJson } from "../src/internal/json.ts"
import { planId } from "../src/internal/identity.ts"
import { writerCompletion } from "../src/internal/process/model.ts"
import { Execution, StoredState } from "../src/installer/lifecycle/records.ts"
import { executionPlan } from "./fixtures/execution-plan.ts"

const decodeExecution = Schema.decodeUnknownSync(Execution, { onExcessProperty: "error" })
const decodeState = Schema.decodeUnknownSync(StoredState, { onExcessProperty: "error" })
const sameWriters = Schema.toEquivalence(Schema.Array(Writers.Writer))
const first = { pid: 17, creation: "0123456789abcdef" }
const reused = { pid: 17, creation: "fedcba9876543210" }

it("preserves exact writer identities in operation and repair records", () => {
  const plan = executionPlan("/fixture")
  const body: RepairPlanBody = {
    type: "repair_ready", schema: 1, target: plan.target,
    before: {
      interrupted: plan.id, pending: PlanId.make("d".repeat(64)),
      observed: { fingerprint: Fingerprint.make("c".repeat(64)), residual: "absent" }
    }
  }
  const repair = { ...body, id: planId(body) }
  const execution = { type: "windows_writers", writers: [first, reused] }
  const journal = {
    type: "pending", plan: plan.id, previous: { type: "installed", receipt: plan.before.receipt },
    observed: plan.before.observed, change: { type: "remove" }
  }
  for (const record of [
    { schema: 1, type: "pending", plan, journal, execution },
    { schema: 1, type: "repair_pending", original: plan, plan: repair, execution }
  ]) {
    const decoded = decodeState(record)
    expect(decoded.type).toBe(record.type)
    if (decoded.type === "idle") throw new Error("Expected the complete pending record")
    expect(decoded.execution).toEqual(execution)
    expect(Schema.encodeSync(StoredState)(decoded)).toEqual(record)
  }
})

it("preserves the proved completion behavior when the ledger crosses the record boundary", () => {
  const requests = readFileSync(new URL("../spec/vectors/writers.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/).filter((line) => line.length > 0)
    .map((line) => Schema.decodeUnknownSync(Schema.Struct({ request: Writers.OracleRequest }))(parseJson(line)))
    .flatMap(({ request }) => request.type === "writer_completion" ? [request] : [])
  expect(requests.length).toBeGreaterThan(0)
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const result = spawnSync(oracle, [], {
    input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
    encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const responses = result.stdout.trim().split(/\r?\n/)
    .map((line) => Schema.decodeUnknownSync(Writers.OracleResponse, { onExcessProperty: "error" })(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const stored = decodeExecution(parseJson(JSON.stringify({ type: "windows_writers", writers: request.input.writers })))
    if (stored.type !== "windows_writers") throw new Error("Expected a retained writer ledger")
    expect(sameWriters(stored.writers, request.input.writers)).toBe(true)
    expect(writerCompletion({ writers: stored.writers, observed: request.input.observed })).toBe(responses[index]?.output)
  }
})

it("rejects malformed or mixed witnesses while retaining incomplete evidence for recovery", () => {
  for (const witness of [
    { type: "windows_writers" }, { type: "windows_writers", writers: null },
    { type: "windows_writers", writers: [first], name: `Global\\pluginsdk-${"a".repeat(64)}` },
    ...[0, -1, 1.5, 0x1_0000_0000].map((pid) => ({ type: "windows_writers", writers: [{ ...first, pid }] })),
    ...["", "A".repeat(16), `${first.creation}\n`].map((creation) => ({ type: "windows_writers", writers: [{ ...first, creation }] }))
  ]) expect(() => decodeExecution(witness)).toThrow()
  const duplicate = decodeExecution({ type: "windows_writers", writers: [first, first] })
  if (duplicate.type !== "windows_writers") throw new Error("Expected the recorded duplicate identities")
  expect(writerCompletion({
    writers: duplicate.writers,
    observed: [{ writer: Schema.decodeSync(Writers.Writer)(first), state: "terminated" }]
  })).toBe("unknown")
})
