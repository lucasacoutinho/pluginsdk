import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Local from "../contracts/LocalSlot.ts"
import { parseJson } from "../src/internal/json.ts"
import { advanceLocalSlot, cleanupLocalSlots } from "../src/installer/local/slots.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ name: Schema.NonEmptyString, properties: Schema.Array(Schema.NonEmptyString),
  request: Local.OracleRequest, expected: Local.OracleResponse })
const sameResponse = Schema.toEquivalence(Local.OracleResponse)
const sameRequest = Schema.toEquivalence(Local.OracleRequest)
const CleanupVector = Schema.Struct({ name: Schema.NonEmptyString, properties: Schema.Array(Schema.NonEmptyString),
  request: Local.CleanupRequest, expected: Local.CleanupResponse })
const sameCleanupResponse = Schema.toEquivalence(Local.CleanupResponse)
const sameCleanupRequest = Schema.toEquivalence(Local.CleanupRequest)
const sameSlots = Schema.toEquivalence(Local.Slots)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
}

function request(input: unknown): Local.OracleRequest {
  return decode(Local.OracleRequest, { schema: 1, type: "advance_local_slot", input })
}

function compare(requests: ReadonlyArray<Local.OracleRequest>): ReadonlyArray<Local.OracleResponse> {
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(Local.OracleRequest)(value))).join("\n") + "\n"
  const run = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`Local package oracle exited ${String(run.status)}: ${run.stderr}`)
  const responses = run.stdout.trimEnd().split("\n").map((line) => decode(Local.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, value] of requests.entries()) {
    const before = structuredClone(value)
    const actual = decode(Local.OracleResponse, {
      schema: 1, type: "advance_local_slot", output: advanceLocalSlot(value.input)
    })
    expect(sameRequest(value, before), `mutated local package request ${index}`).toBe(true)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing local package response ${index}`)
    expect(sameResponse(actual, expected), `local package case ${index}: ${JSON.stringify(value)}`).toBe(true)
  }
  return responses
}

const owner = decode(Local.Owner, "installation-α")
const previous = { plan: "1".repeat(64), bundle: "a".repeat(64) }
const next = { plan: "2".repeat(64), bundle: "b".repeat(64) }
const unrelated = { plan: "3".repeat(64), bundle: "c".repeat(64) }
const absent = decode(Local.Observation, { type: "absent" })
const baseline = request({ owner, operation: { type: "install", next },
  slots: { live: absent, staged: absent, retired: absent } })

function generatedRequests(): ReadonlyArray<Local.OracleRequest> {
  const complete = (identity: unknown, claimedOwner = owner, basis = "0".repeat(64)) =>
    decode(Local.Observation, { type: "complete", owner: claimedOwner, identity, basis })
  const partial = (identity: unknown, claimedOwner = owner) =>
    decode(Local.Observation, { type: "partial", owner: claimedOwner, identity, basis: "f".repeat(64) })
  const other = decode(Local.Owner, "installation-β")
  const observations = [
    absent, decode(Local.Observation, { type: "unknown" }),
    decode(Local.Observation, { type: "foreign", basis: "8".repeat(64) }),
    complete(previous), complete(next, owner, "f".repeat(64)), partial(previous), partial(next),
    complete(next, other), partial(next, other), complete(unrelated),
    complete({ plan: next.plan, bundle: previous.bundle }),
    complete({ plan: previous.plan, bundle: next.bundle })
  ]
  const operations = decode(Schema.Array(Local.Operation), [
    { type: "install", next }, { type: "replace", previous, next }, { type: "remove", previous },
    { type: "replace", previous, next: previous },
    { type: "replace", previous, next: { plan: previous.plan, bundle: next.bundle } }
  ])
  return operations.flatMap((operation) => observations.flatMap((live) =>
    observations.flatMap((staged) => observations.map((retired) =>
      request({ owner, operation, slots: { live, staged, retired } })))))
}

it("matches the 41 reviewed install, replacement, removal and refusal vectors", () => {
  const path = new URL("../spec/vectors/local-slot.ndjson", import.meta.url)
  const vectors = readFileSync(path, "utf8").trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))
  expect(vectors).toHaveLength(41)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing reviewed vector ${vector.name}`)
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("agrees with Lean on 8640 combinations of role, ownership, integrity and operation identity", () => {
  const requests = generatedRequests()
  expect(requests).toHaveLength(8640)
  compare(requests)
}, 60_000)

it("rejects malformed requests at both wire boundaries", () => {
  const encoded = Schema.encodeSync(Local.OracleRequest)(baseline)
  const raw = JSON.stringify(encoded)
  const invalid = [
    JSON.stringify({ ...encoded, schema: 2 }),
    JSON.stringify({ ...encoded, type: "unknown_local_action" }),
    JSON.stringify({ ...encoded, allowForeign: true }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, owner: "" } }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, owner: "\ud800" } }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, operation: { type: "install", next: { ...next, plan: "A".repeat(64) } } } }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, slots: { ...encoded.input.slots, live: { type: "directory" } } } }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, slots: { ...encoded.input.slots, live: { type: "complete", owner, identity: next } } } }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, slots: { ...encoded.input.slots, staged: { type: "partial", owner, identity: next, basis: "not-a-fingerprint" } } } }),
    JSON.stringify({ ...encoded, input: { ...encoded.input, slots: { ...encoded.input.slots, retired: { type: "unknown", basis: "0".repeat(64) } } } }),
    raw.replace('"schema":1', '"schema":1,"schema":1')
  ]
  for (const input of invalid) {
    expect(() => decode(Local.OracleRequest, parseJson(input))).toThrow()
    const run = spawnSync(oracle, [], { input: input + "\n", encoding: "utf8", timeout: 10_000 })
    if (run.error !== undefined) throw run.error
    expect(run.status).toBe(1)
    expect(run.stdout).toBe("")
    expect(run.stderr).toContain("oracle:")
  }
})

function compareCleanup(requests: ReadonlyArray<Local.CleanupRequest>): ReadonlyArray<Local.CleanupResponse> {
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(Local.CleanupRequest)(value))).join("\n") + "\n"
  const run = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`Cleanup oracle exited ${String(run.status)}: ${run.stderr}`)
  const responses = run.stdout.trimEnd().split("\n").map((line) => decode(Local.CleanupResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, value] of requests.entries()) {
    const before = structuredClone(value)
    const actual = decode(Local.CleanupResponse, {
      schema: 1, type: "cleanup_local_slots", output: cleanupLocalSlots(value.input)
    })
    expect(sameCleanupRequest(value, before), `mutated cleanup request ${index}`).toBe(true)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing cleanup response ${index}`)
    expect(sameCleanupResponse(actual, expected), `cleanup case ${index}: ${JSON.stringify(value)}`).toBe(true)
  }
  return responses
}

it("matches 34 reviewed cleanup decisions without widening slot ownership", () => {
  const path = new URL("../spec/vectors/local-cleanup.ndjson", import.meta.url)
  const vectors = readFileSync(path, "utf8").trimEnd().split("\n").map((line) => decode(CleanupVector, parseJson(line)))
  expect(vectors).toHaveLength(34)
  const responses = compareCleanup(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing reviewed cleanup vector ${vector.name}`)
    expect(sameCleanupResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("agrees with Lean on cleanup for all 8640 slot and operation combinations", () => {
  const requests = generatedRequests().map(({ input }) => decode(Local.CleanupRequest, {
    schema: 1, type: "cleanup_local_slots", input
  }))
  expect(requests).toHaveLength(8640)
  compareCleanup(requests)
}, 60_000)

it("empties every admitted combination in at most three successful archival steps", () => {
  for (const request of generatedRequests()) {
    let input = request.input
    const initial = cleanupLocalSlots(input)
    if (initial.type === "blocked") continue
    for (let step = 0; step < 3; step += 1) {
      input = Match.value(cleanupLocalSlots(input)).pipe(Match.discriminatorsExhaustive("type")({
        complete: () => input,
        blocked: (decision) => { throw new Error(`Admitted cleanup became ${decision.reason}`) },
        step: ({ role }) => {
          expect(input.slots[role].type).not.toBe("absent")
          return { ...input, slots: { ...input.slots, [role]: absent } }
        }
      }))
    }
    expect(cleanupLocalSlots(input)).toEqual({ type: "complete" })
    expect(sameSlots(input.slots, { live: absent, staged: absent, retired: absent })).toBe(true)
  }
})

it("rejects thirteen malformed cleanup requests at both wire boundaries", () => {
  const path = new URL("./fixtures/local-cleanup-invalid.json", import.meta.url)
  const fixtures = decode(Schema.Array(Schema.Struct({ name: Schema.NonEmptyString, raw: Schema.String })), parseJson(readFileSync(path, "utf8")))
  expect(fixtures).toHaveLength(13)
  for (const fixture of fixtures) {
    expect(() => decode(Local.CleanupRequest, parseJson(fixture.raw)), fixture.name).toThrow()
    const run = spawnSync(oracle, [], { input: fixture.raw + "\n", encoding: "utf8", timeout: 10_000 })
    if (run.error !== undefined) throw run.error
    expect(run.status, fixture.name).toBe(1)
    expect(run.stdout, fixture.name).toBe("")
    expect(run.stderr, fixture.name).toContain("oracle:")
  }
})
