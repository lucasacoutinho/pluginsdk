import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Writers from "../contracts/Writers.ts"
import { parseJson } from "../src/internal/json.ts"
import { writerStep } from "../src/internal/process/model.ts"

const TraceInput = Schema.Struct({ initial: Writers.GateState, signals: Schema.Array(Writers.GateSignal) })
type TraceInput = typeof TraceInput.Type
const TraceVector = Schema.Struct({
  ...TraceInput.fields,
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.Literal("Z17")),
  actions: Schema.Array(Writers.GateAction),
  final: Writers.GateState
})
const sameStep = Schema.toEquivalence(Writers.GateStep)
const sameWriter = Schema.toEquivalence(Writers.Writer)
const sameState = Schema.toEquivalence(Writers.GateState)
const sameActions = Schema.toEquivalence(Schema.Array(Writers.GateAction))

function compare(traces: ReadonlyArray<TraceInput>) {
  const requests: Array<Writers.GateInput> = []
  const actual: Array<Writers.GateStep> = []
  const results = traces.map(({ initial, signals }) => {
    let state = initial
    const actions: Array<Writers.GateAction> = []
    for (const signal of signals) {
      const input = { state, signal }
      const before = structuredClone(input)
      const step = writerStep(input)
      expect(input).toEqual(before)
      requests.push(input)
      actual.push(step)
      actions.push(step.action)
      state = step.state
    }
    const resumed = actions.flatMap((action) => Match.value(action).pipe(Match.discriminatorsExhaustive("type")({
      resume: ({ writer }) => [writer],
      retain: () => [],
      wait: () => [],
      complete: () => [],
      stop: () => []
    })))
    for (const writer of resumed) expect(state.writers.some((retained) => sameWriter(retained, writer))).toBe(true)
    return { actions, final: state }
  })

  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const requestSchema = Writers.OracleRequest.cases.writer_step
  const input = requests.map((input) => JSON.stringify(Schema.encodeSync(requestSchema)({ schema: 1, type: "writer_step", input }))).join("\n")
  const oracleResult = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 * 1024 })
  if (oracleResult.error !== undefined) throw oracleResult.error
  expect(oracleResult.status, oracleResult.stderr).toBe(0)
  const decode = Schema.decodeUnknownSync(Writers.OracleResponse.cases.writer_step, { onExcessProperty: "error" })
  const expected = oracleResult.stdout.trim().split("\n").map((line) => decode(parseJson(line)).output)
  expect(expected).toHaveLength(actual.length)
  for (const [index, step] of actual.entries()) {
    const fromOracle = expected[index]
    if (fromOracle === undefined) throw new Error("Missing writer trace oracle response")
    expect(sameStep(step, fromOracle), `trace step ${index}`).toBe(true)
  }
  return results
}

it("conforms to independent crash-prefix traces and retains every resumed identity", () => {
  const decode = Schema.decodeUnknownSync(TraceVector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/writer-traces.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decode(parseJson(line)))
  const results = compare(vectors)
  for (const [index, vector] of vectors.entries()) {
    const actual = results[index]
    if (actual === undefined) throw new Error("Missing authored trace result")
    expect(sameActions(actual.actions, vector.actions), vector.name).toBe(true)
    expect(sameState(actual.final, vector.final), vector.name).toBe(true)
  }
})

it("conforms across 1755 traces with valid and rejected acknowledgements", () => {
  const decode = Schema.decodeUnknownSync(Writers.Writer)
  const first = decode({ pid: 17, creation: "0123456789abcdef" })
  const second = decode({ pid: 18, creation: "1111111111111111" })
  const initial: ReadonlyArray<Writers.GateState> = [
    { type: "open", writers: [] },
    { type: "retaining", writers: [first], writer: second },
    { type: "open", writers: [first, second] }
  ]
  const signals: ReadonlyArray<Writers.GateSignal> = [
    { type: "birth", writer: first }, { type: "birth", writer: second },
    { type: "retained", writers: [first] }, { type: "retained", writers: [first, second] },
    { type: "retained", writers: [second, first] },
    { type: "close", observed: [{ writer: first, state: "terminated" }] },
    { type: "failed" }, { type: "stop" }
  ]
  const sequences: Array<ReadonlyArray<Writers.GateSignal>> = [[]]
  let level: ReadonlyArray<ReadonlyArray<Writers.GateSignal>> = [[]]
  for (let length = 1; length <= 3; length++) {
    level = level.flatMap((prefix) => signals.map((signal) => [...prefix, signal]))
    sequences.push(...level)
  }
  const traces = initial.flatMap((initial) => sequences.map((signals) => ({ initial, signals })))
  expect(traces).toHaveLength(1755)
  expect(traces.reduce((count, trace) => count + trace.signals.length, 0)).toBe(5016)
  compare(traces)
})
