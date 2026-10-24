import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Writers from "../contracts/Writers.ts"
import { observeWriter, priorOwnerCompletion, writerCompletion, writerStep } from "../src/internal/process/model.ts"
import { parseJson } from "../src/internal/json.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Writers.OracleRequest,
  expected: Writers.OracleResponse
})
const sameResponse = Schema.toEquivalence(Writers.OracleResponse)
const decodeRequest = Schema.decodeUnknownSync(Writers.OracleRequest, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(Writers.OracleResponse, { onExcessProperty: "error" })

function compare(requests: ReadonlyArray<Writers.OracleRequest>): ReadonlyArray<Writers.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Writers.OracleRequest)(request))).join("\n")
  const result = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Writer oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
      writer_observation: ({ input }): Writers.OracleResponse => ({ schema: 1, type: "writer_observation", output: observeWriter(input) }),
      writer_step: ({ input }): Writers.OracleResponse => ({ schema: 1, type: "writer_step", output: writerStep(input) }),
      writer_completion: ({ input }): Writers.OracleResponse => ({ schema: 1, type: "writer_completion", output: writerCompletion(input) }),
      writer_prior_owners: ({ input }): Writers.OracleResponse => ({ schema: 1, type: "writer_prior_owners", output: priorOwnerCompletion(input) })
    }))
    expect(request).toEqual(before)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing writer oracle response ${index}`)
    expect(sameResponse(decodeResponse(actual), expected), `writer case ${index}`).toBe(true)
  }
  return responses
}

function identity(pid: number, creation: string): Writers.Writer {
  return Schema.decodeSync(Writers.Writer)({ pid, creation })
}

const first = identity(17, "0123456789abcdef")
const second = identity(18, "1111111111111111")
const reused = identity(17, "fedcba9876543210")
const minimum = identity(1, "0000000000000000")
const maximum = identity(0xffff_ffff, "ffffffffffffffff")
const identities = [first, second, reused, minimum, maximum]
const ledgers: ReadonlyArray<ReadonlyArray<Writers.Writer>> = [
  [], [first], [second], [first, second], [second, first], [first, first], [first, reused], [minimum, maximum]
]
const processStates: ReadonlyArray<Writers.ProcessState> = ["terminated", "active", "unknown"]
const observations = identities.flatMap((writer) => processStates.map((state): Writers.Observation => ({ writer, state })))
const terminations = ledgers.map((writers) => writers.map((writer): Writers.Observation => ({ writer, state: "terminated" })))

it("conforms to the independently authored creation, retention and completion cases", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/writers.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/).filter((line) => line.length > 0).map((line) => decodeVector(parseJson(line)))
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored writer case ${vector.name}`)
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms for missing, duplicate, conflicting, unrelated and reused process evidence", () => {
  const evidence: ReadonlyArray<ReadonlyArray<Writers.Observation>> = [
    [], ...observations.map((observation) => [observation]),
    ...observations.flatMap((left) => observations.map((right) => [left, right])),
    ...terminations, ...terminations.map((observed) => observed.toReversed())
  ]
  compare(ledgers.flatMap((writers) => evidence.map((observed): Writers.OracleRequest => ({
    schema: 1, type: "writer_completion", input: { writers, observed }
  }))))
})

it("conforms across all gate states and signals, including malformed retained ledgers", () => {
  const states = ledgers.flatMap((writers): ReadonlyArray<Writers.GateState> => [
    { type: "open", writers }, { type: "closed", writers }, { type: "stopped", writers },
    ...identities.map((writer): Writers.GateState => ({ type: "retaining", writers, writer }))
  ])
  const acknowledgements = [...ledgers, ...ledgers.flatMap((writers) => identities.map((writer) => [...writers, writer]))]
  const evidence: ReadonlyArray<ReadonlyArray<Writers.Observation>> = [
    [], ...observations.map((observation) => [observation]), ...terminations,
    [{ writer: first, state: "active" }, { writer: first, state: "terminated" }],
    [{ writer: first, state: "unknown" }, { writer: first, state: "terminated" }]
  ]
  const signals: ReadonlyArray<Writers.GateSignal> = [
    ...identities.map((writer): Writers.GateSignal => ({ type: "birth", writer })),
    ...acknowledgements.map((writers): Writers.GateSignal => ({ type: "retained", writers })),
    ...evidence.map((observed): Writers.GateSignal => ({ type: "close", observed })),
    { type: "failed" }, { type: "stop" }
  ]
  compare(states.flatMap((state) => signals.map((signal): Writers.OracleRequest => ({
    schema: 1, type: "writer_step", input: { state, signal }
  }))))
})

it("conforms to independently authored prior-owner cases", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/writer-prior-owners.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/).filter((line) => line.length > 0).map((line) => decodeVector(parseJson(line)))
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored prior-owner case ${vector.name}`)
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms when only the exact current owner is exempt from completion evidence", () => {
  const evidence: ReadonlyArray<ReadonlyArray<Writers.Observation>> = [
    [], ...observations.map((observation) => [observation]),
    ...observations.flatMap((left) => observations.map((right) => [left, right])),
    ...terminations, ...terminations.map((observed) => observed.toReversed())
  ]
  const owners = [...ledgers, [first, first, second], [first, second, reused], [first, reused, first]]
  compare(identities.flatMap((current) => owners.flatMap((owners) => evidence.map((observed): Writers.OracleRequest => ({
    schema: 1, type: "writer_prior_owners", input: { current, owners, observed }
  })))))
})

it("rejects malformed identities in every nested request position", () => {
  const nestedRequests = (writer: unknown): ReadonlyArray<unknown> => [
    { schema: 1, type: "writer_step", input: { state: { type: "open", writers: [writer] }, signal: { type: "stop" } } },
    { schema: 1, type: "writer_step", input: { state: { type: "retaining", writers: [writer], writer: first }, signal: { type: "stop" } } },
    { schema: 1, type: "writer_step", input: { state: { type: "retaining", writers: [], writer }, signal: { type: "stop" } } },
    { schema: 1, type: "writer_step", input: { state: { type: "open", writers: [] }, signal: { type: "birth", writer } } },
    { schema: 1, type: "writer_step", input: { state: { type: "open", writers: [] }, signal: { type: "retained", writers: [writer] } } },
    { schema: 1, type: "writer_step", input: { state: { type: "open", writers: [] }, signal: { type: "close", observed: [{ writer, state: "terminated" }] } } },
    { schema: 1, type: "writer_completion", input: { writers: [writer], observed: [] } },
    { schema: 1, type: "writer_completion", input: { writers: [], observed: [{ writer, state: "terminated" }] } },
    { schema: 1, type: "writer_prior_owners", input: { current: writer, owners: [], observed: [] } },
    { schema: 1, type: "writer_prior_owners", input: { current: first, owners: [writer], observed: [] } },
    { schema: 1, type: "writer_prior_owners", input: { current: first, owners: [], observed: [{ writer, state: "active" }] } }
  ]
  const malformed = [
    ...[0, -1, 1.5, 0x1_0000_0000, true, null, "17"].map((pid) => ({ ...first, pid })),
    ...["", "0".repeat(15), "0".repeat(17), "A".repeat(16), "g".repeat(16),
      `${first.creation}\n`, `${first.creation}\r\n`, `${first.creation}\u2028`, `${first.creation}\u2029`,
      "\0".repeat(16), "😀".repeat(8), "\ud800", true, null, 1
    ].map((creation) => ({ ...first, creation })),
    { pid: first.pid }, { creation: first.creation }, { ...first, extra: true }, null, [], [first]
  ]
  for (const writer of malformed) {
    for (const request of nestedRequests(writer)) expect(() => decodeRequest(request)).toThrow()
  }
})

it("rejects unknown variants, excess fields and duplicate JSON members", () => {
  const gate = (state: unknown, signal: unknown) => ({ schema: 1, type: "writer_step", input: { state, signal } })
  for (const state of [
    { type: "other", writers: [] }, { type: "open" }, { type: "open", writers: [], writer: first },
    { type: "retaining", writers: [] }, { type: "closed", writers: [], extra: true }
  ]) expect(() => decodeRequest(gate(state, { type: "stop" }))).toThrow()
  for (const signal of [
    { type: "other" }, { type: "birth" }, { type: "retained", writers: null },
    { type: "close", observed: [{ writer: first, state: "complete" }] },
    { type: "close", observed: [{ writer: first, state: "terminated", extra: true }] },
    { type: "stop", writer: first }
  ]) expect(() => decodeRequest(gate({ type: "open", writers: [] }, signal))).toThrow()
  for (const output of [
    { state: { type: "open", writers: [] }, action: { type: "wait", reason: "complete" } },
    { state: { type: "closed", writers: [] }, action: { type: "complete", writer: first } },
    { state: { type: "open", writers: [] }, action: { type: "resume", writer: { ...first, pid: 0 } } }
  ]) expect(() => decodeResponse({ schema: 1, type: "writer_step", output })).toThrow()
  for (const wire of [
    '{"schema":1,"sch\\u0065ma":1,"type":"writer_completion","input":{"writers":[],"observed":[]}}',
    '{"pid":17,"pi\\u0064":17,"creation":"0123456789abcdef"}',
    '{"creation":"0123456789abcdef","crea\\u0074ion":"0123456789abcdef"}',
    '{"current":{},"curr\\u0065nt":{},"owners":[],"observed":[]}',
    '{"current":{},"owners":[],"own\\u0065rs":[],"observed":[]}'
  ]) expect(() => parseJson(wire)).toThrow()
})
