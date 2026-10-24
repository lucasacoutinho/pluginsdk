import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Local from "../contracts/LocalApproval.ts"
import { parseJson } from "../src/internal/json.ts"
import { bindLocalApproval } from "../src/installer/local/approval.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ request: Local.OracleRequest, expected: Local.OracleResponse })
const sameResponse = Schema.toEquivalence(Local.OracleResponse)
const sameRequest = Schema.toEquivalence(Local.OracleRequest)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
}

const vectors = readFileSync(new URL("../spec/vectors/local-approval.ndjson", import.meta.url), "utf8")
  .trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))
const baseline = vectors[0]
if (baseline === undefined) throw new Error("Missing approval binding baseline")
const input = baseline.request.input

function compare(requests: ReadonlyArray<Local.OracleRequest>): ReadonlyArray<Local.OracleResponse> {
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(Local.OracleRequest)(value))).join("\n") + "\n"
  const run = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`Approval oracle exited ${String(run.status)}: ${run.stderr}`)
  const responses = run.stdout.trimEnd().split("\n").map((line) => decode(Local.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = decode(Local.OracleResponse, {
      schema: 1, type: "bind_local_approval", output: bindLocalApproval(request.input)
    })
    expect(sameRequest(request, before), `mutated approval request ${index}`).toBe(true)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing approval response ${index}`)
    expect(sameResponse(actual, expected), `approval case ${index}: ${JSON.stringify(request)}`).toBe(true)
  }
  return responses
}

it("matches the 19 reviewed physical approval vectors", () => {
  expect(vectors).toHaveLength(19)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing reviewed approval vector ${index}`)
    expect(sameResponse(response, vector.expected), `reviewed approval vector ${index}`).toBe(true)
  }
})

it("agrees with Lean on 2916 owner, plan, bundle, root and descriptor combinations", () => {
  const owners = [input.owner, "engineering/another", "engenharia/🧩"]
  const identities = [input.record.identity,
    { ...input.record.identity, plan: "c".repeat(64) },
    { ...input.record.identity, bundle: "d".repeat(64) }]
  const roots = [input.root, { ...input.root, volume: "f".repeat(16) }, { ...input.root, file: "e".repeat(32) }]
  const lists = [input.retained.files, input.retained.files.toReversed()]
  const requests = owners.slice(0, 2).flatMap((owner) => owners.flatMap((recordOwner) => owners.flatMap((retainedOwner) =>
    identities.flatMap((recordIdentity) => identities.flatMap((retainedIdentity) => roots.flatMap((root) =>
      roots.flatMap((recordRoot) => lists.map((files) => decode(Local.OracleRequest, {
        schema: 1, type: "bind_local_approval", input: {
          owner, root, record: { ...input.record, owner: recordOwner, identity: recordIdentity, root: recordRoot },
          retained: { owner: retainedOwner, identity: retainedIdentity, files }
        }
      })))))))))
  expect(requests).toHaveLength(2916)
  compare(requests)
})

it("rejects 23 malformed requests at both strict wire boundaries", () => {
  const Invalid = Schema.Array(Schema.Struct({ name: Schema.NonEmptyString, text: Schema.NonEmptyString }))
  const cases = decode(Invalid, parseJson(readFileSync(new URL("./fixtures/local-approval-invalid.json", import.meta.url), "utf8")))
  expect(cases).toHaveLength(23)
  for (const value of cases) {
    expect(() => decode(Local.OracleRequest, parseJson(value.text)), value.name).toThrow()
    const run = spawnSync(oracle, [], { input: value.text + "\n", encoding: "utf8", timeout: 10_000 })
    if (run.error !== undefined) throw run.error
    expect(run.status, value.name).toBe(1)
    expect(run.stdout, value.name).toBe("")
    expect(run.stderr.startsWith("oracle:"), value.name).toBe(true)
  }
})
