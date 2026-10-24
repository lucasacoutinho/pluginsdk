import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ProcessId } from "../contracts/Execution.ts"
import * as Writers from "../contracts/Writers.ts"
import { parseJson } from "../src/internal/json.ts"
import { observeWriter } from "../src/internal/process/model.ts"

const Request = Writers.OracleRequest.cases.writer_observation
const Response = Writers.OracleResponse.cases.writer_observation
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Request,
  expected: Response
})
const same = Schema.toEquivalence(Writers.Observation)
const decodeResponse = Schema.decodeUnknownSync(Response, { onExcessProperty: "error" })

function compare(inputs: ReadonlyArray<Writers.ObservationInput>): ReadonlyArray<Writers.Observation> {
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const input = inputs.map((input) => JSON.stringify(Schema.encodeSync(Request)({ schema: 1, type: "writer_observation", input }))).join("\n")
  const result = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 10_000, maxBuffer: 2 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const expected = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)).output)
  expect(expected).toHaveLength(inputs.length)
  for (const [index, input] of inputs.entries()) {
    const before = structuredClone(input)
    const actual = observeWriter(input)
    expect(input).toEqual(before)
    const observation = expected[index]
    if (observation === undefined) throw new Error("Missing writer observation oracle response")
    expect(same(actual, observation), `observation ${index}`).toBe(true)
  }
  return expected
}

it("conforms to independently authored writer lookup cases", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/writer-observation.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeVector(parseJson(line)))
  const observed = compare(vectors.map(({ request }) => request.input))
  for (const [index, vector] of vectors.entries()) {
    const actual = observed[index]
    if (actual === undefined) throw new Error("Missing authored observation result")
    expect(same(actual, vector.expected.output), vector.name).toBe(true)
  }
})

it("conforms across PID binding, process generations and lookup states without mutating inputs", () => {
  const pids = [1, 17, 0xffff_ffff].map((pid) => ProcessId.make(pid))
  const creations = ["0000000000000000", "0123456789abcdef", "ffffffffffffffff"].map((creation) => Writers.CreationTime.make(creation))
  const writers = pids.flatMap((pid) => creations.map((creation): Writers.Writer => ({ pid, creation })))
  const states: ReadonlyArray<Writers.ProcessState> = ["active", "terminated", "unknown"]
  const lookups: ReadonlyArray<Writers.Lookup> = [
    { type: "unavailable" },
    ...pids.map((pid): Writers.Lookup => ({ type: "missing", pid })),
    ...writers.flatMap((writer) => states.map((state): Writers.Lookup => ({ type: "opened", writer, state })))
  ]
  compare(writers.flatMap((writer) => lookups.map((lookup) => ({ writer, lookup }))))
})

it("rejects malformed lookup and nested writer data", () => {
  const decode = Schema.decodeUnknownSync(Writers.ObservationInput, { onExcessProperty: "error" })
  const writer = { pid: 17, creation: "0123456789abcdef" }
  const lookup = { type: "opened", writer, state: "active" }
  for (const pid of [0, -1, 1.5, 0x1_0000_0000, "17", null, true]) {
    expect(() => decode({ writer: { ...writer, pid }, lookup })).toThrow()
    expect(() => decode({ writer, lookup: { ...lookup, writer: { ...writer, pid } } })).toThrow()
    expect(() => decode({ writer, lookup: { type: "missing", pid } })).toThrow()
  }
  for (const creation of ["", "0".repeat(15), "0".repeat(17), "A".repeat(16), `${writer.creation}\n`, `${writer.creation}\u2028`, "\ud800", null, true]) {
    expect(() => decode({ writer: { ...writer, creation }, lookup })).toThrow()
    expect(() => decode({ writer, lookup: { ...lookup, writer: { ...writer, creation } } })).toThrow()
  }
  for (const invalid of [
    null, {}, { type: "other" }, { type: "opened", writer }, { type: "opened", state: "active" },
    { ...lookup, state: "missing" }, { ...lookup, extra: true }, { type: "missing" },
    { type: "missing", pid: 17, extra: true }, { type: "unavailable", pid: 17 }
  ]) expect(() => decode({ writer, lookup: invalid })).toThrow()
})
