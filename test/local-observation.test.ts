import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Life from "../contracts/Lifecycle.ts"
import * as Local from "../contracts/LocalObservation.ts"
import * as Slot from "../contracts/LocalSlot.ts"
import { parseJson } from "../src/internal/json.ts"
import { observeLocalSlots } from "../src/installer/local/observation.ts"
import { settle } from "../src/installer/lifecycle/model.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ request: Local.OracleRequest, expected: Local.OracleResponse })
const sameResponse = Schema.toEquivalence(Local.OracleResponse)
const sameRequest = Schema.toEquivalence(Local.OracleRequest)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
}

function query<S extends Schema.ConstraintDecoder<unknown>>(input: ReadonlyArray<string>, schema: S): ReadonlyArray<S["Type"]> {
  const run = spawnSync(oracle, [], { input: input.join("\n") + "\n", encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`Observation oracle exited ${String(run.status)}: ${run.stderr}`)
  const output = run.stdout.trimEnd().split("\n").map((line) => decode(schema, parseJson(line)))
  expect(output).toHaveLength(input.length)
  return output
}

function compare(requests: ReadonlyArray<Local.OracleRequest>): ReadonlyArray<Local.OracleResponse> {
  const responses = query(requests.map((request) => JSON.stringify(Schema.encodeSync(Local.OracleRequest)(request))), Local.OracleResponse)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual: Local.OracleResponse = { schema: 1, type: "observe_local_slots", output: observeLocalSlots(request.input) }
    expect(sameRequest(request, before), `mutated observation request ${index}`).toBe(true)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing observation response ${index}`)
    expect(sameResponse(actual, expected), `observation case ${index}: ${JSON.stringify(request)}`).toBe(true)
  }
  return responses
}

const owner = Slot.Owner.make("engineering/service")
const identity = { plan: "a".repeat(64), bundle: "b".repeat(64) }
const basis = "e".repeat(64)
const alternatives = [
  { type: "absent" }, { type: "unknown" }, { type: "foreign", basis },
  { type: "complete", owner, identity, basis },
  { type: "complete", owner: "another-owner", identity, basis: "d".repeat(64) },
  { type: "partial", owner, identity, basis },
  { type: "partial", owner: "another-owner", identity, basis: "0".repeat(64) },
  { type: "complete", owner, identity: { plan: "c".repeat(64), bundle: "d".repeat(64) }, basis: "f".repeat(64) }
].map((value) => decode(Slot.Observation, value))
const generated = [owner, Slot.Owner.make("another-owner")].flatMap((owner) => alternatives.flatMap((live) =>
  alternatives.flatMap((staged) => alternatives.map((retired): Local.OracleRequest => ({
    schema: 1, type: "observe_local_slots", input: { owner, slots: { live, staged, retired } }
  })))))

it("matches 29 reviewed terminal and interrupted-state observations", () => {
  const vectors = readFileSync(new URL("../spec/vectors/local-observation.ndjson", import.meta.url), "utf8")
    .trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))
  expect(vectors).toHaveLength(29)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing reviewed observation ${index}`)
    expect(sameResponse(response, vector.expected), `reviewed observation ${index}`).toBe(true)
  }
})

it("agrees with Lean on all 1024 owner and role combinations", () => {
  expect(generated).toHaveLength(1024)
  compare(generated)
})

it("keeps 3024 actual lifecycle settlements uncertain while auxiliary roles remain", () => {
  const receipt = { identity, fingerprint: basis }
  const pending = [
    { type: "pending", plan: "c".repeat(64), previous: { type: "empty", last: null },
      observed: { type: "absent" }, change: { type: "install", bundle: "d".repeat(64) } },
    { type: "pending", plan: "c".repeat(64), previous: { type: "installed", receipt },
      observed: { type: "present", ...receipt }, change: { type: "replace", bundle: "d".repeat(64) } },
    { type: "pending", plan: "c".repeat(64), previous: { type: "installed", receipt },
      observed: { type: "present", ...receipt }, change: { type: "remove" } }
  ].map((value) => decode(Life.Pending, value))
  const requests = generated.filter(({ input }) => input.slots.staged.type !== "absent" || input.slots.retired.type !== "absent")
    .flatMap(({ input }) => pending.map((journal) => decode(Life.OracleRequest, {
      schema: 1, type: "settle", input: { journal, observed: observeLocalSlots(input) }
    })))
  expect(requests).toHaveLength(3024)
  const responses = query(requests.map((request) => JSON.stringify(Schema.encodeSync(Life.OracleRequest)(request))), Life.OracleResponse)
  const sameSettlement = Schema.toEquivalence(Life.Settlement)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (request.type !== "settle" || response?.type !== "settle") throw new Error(`Missing lifecycle settlement ${index}`)
    const actual = settle(request.input)
    expect(sameSettlement(actual, response.output), `lifecycle oracle ${index}`).toBe(true)
    expect(sameSettlement(actual, { type: "uncertain", journal: request.input.journal, observed: { type: "unknown" } }),
      `preserved pending journal ${index}`).toBe(true)
  }
})

it("rejects 20 malformed requests at both strict wire boundaries", () => {
  const Invalid = Schema.Array(Schema.Struct({ name: Schema.NonEmptyString, text: Schema.NonEmptyString }))
  const values = decode(Invalid, parseJson(readFileSync(new URL("./fixtures/local-observation-invalid.json", import.meta.url), "utf8")))
  expect(values).toHaveLength(20)
  for (const value of values) {
    expect(() => decode(Local.OracleRequest, parseJson(value.text)), value.name).toThrow()
    const run = spawnSync(oracle, [], { input: value.text + "\n", encoding: "utf8", timeout: 10_000 })
    if (run.error !== undefined) throw run.error
    expect(run.status, value.name).toBe(1)
    expect(run.stdout, value.name).toBe("")
    expect(run.stderr.startsWith("oracle:"), value.name).toBe(true)
  }
})
