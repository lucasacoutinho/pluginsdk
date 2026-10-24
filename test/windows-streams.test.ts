import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Command from "../contracts/WindowsCommand.ts"
import { parseJson } from "../src/internal/json.ts"
import { windowsIoStep, windowsStreamStep } from "../src/installer/windows/protocol.ts"

const Request = Schema.Union([Command.StreamOracleRequest, Command.IoOracleRequest]).pipe(Schema.toTaggedUnion("type"))
type Request = typeof Request.Type
const Response = Schema.Union([Command.StreamOracleResponse, Command.IoOracleResponse]).pipe(Schema.toTaggedUnion("type"))
const Vector = Schema.Struct({ name: Schema.NonEmptyString, request: Request, expected: Response })
const decodeResponse = Schema.decodeUnknownSync(Response, { onExcessProperty: "error" })
const sameStream = Schema.toEquivalence(Command.StreamStep)
const sameIo = Schema.toEquivalence(Command.IoStep)
const sameResponse = Schema.toEquivalence(Response)
const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))

const evaluate = (requests: ReadonlyArray<Request>) => {
  const result = spawnSync(oracle, [], {
    input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n",
    encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  return responses
}

const compare = (requests: ReadonlyArray<Request>) => {
  const expected = evaluate(requests)
  for (const [index, request] of requests.entries()) {
    const response = expected[index]
    if (response === undefined) throw new Error("Missing Windows stream oracle response")
    Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
      windows_stream_step: ({ input }) => {
        if (response.type !== "windows_stream_step") throw new Error("Wrong stream oracle response tag")
        const before = structuredClone(input)
        const actual = windowsStreamStep(input)
        expect(input).toEqual(before)
        expect(sameStream(actual, response.output), `stream step ${index}`).toBe(true)
      },
      windows_io_step: ({ input }) => {
        if (response.type !== "windows_io_step") throw new Error("Wrong I/O oracle response tag")
        const before = structuredClone(input)
        const actual = windowsIoStep(input)
        expect(input).toEqual(before)
        expect(sameIo(actual, response.output), `I/O step ${index}`).toBe(true)
      }
    }))
  }
  return expected
}

const sequences = <A>(alphabet: ReadonlyArray<A>, maximum: number): ReadonlyArray<ReadonlyArray<A>> => {
  const result: Array<ReadonlyArray<A>> = [[]]
  let level: ReadonlyArray<ReadonlyArray<A>> = [[]]
  for (let length = 1; length <= maximum; length += 1) {
    level = level.flatMap((prefix) => alphabet.map((value) => [...prefix, value]))
    result.push(...level)
  }
  return result
}

it("matches independent stream and request-lifetime vectors", () => {
  const decode = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/windows-streams.ndjson", import.meta.url), "utf8")
    .trim().split(/\r?\n/).map((line) => decode(parseJson(line)))
  expect(vectors).toHaveLength(30)
  expect(new Set(vectors.map(({ name }) => name)).size).toBe(vectors.length)
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing vector response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conserves byte budgets across 11204 generated mixed input/output traces", () => {
  const bytes = Command.ByteCount.make
  const initial: ReadonlyArray<Command.StreamState> = [
    { input: { type: "open", remaining: bytes(0) }, outputRemaining: bytes(0) },
    { input: { type: "open", remaining: bytes(3) }, outputRemaining: bytes(4) },
    { input: { type: "closed", remaining: bytes(3) }, outputRemaining: bytes(4) },
    { input: { type: "open", remaining: bytes(Number.MAX_SAFE_INTEGER) }, outputRemaining: bytes(Number.MAX_SAFE_INTEGER) }
  ]
  const alphabet: ReadonlyArray<Command.StreamSignal> = [
    { type: "input", bytes: bytes(0) }, { type: "input", bytes: bytes(1) }, { type: "input", bytes: bytes(4) },
    { type: "output", bytes: bytes(0) }, { type: "output", bytes: bytes(1) }, { type: "output", bytes: bytes(5) },
    { type: "end_input" }
  ]
  const traces = initial.flatMap((state) => sequences(alphabet, 4).map((signals) => ({ state, signals })))
  expect(traces).toHaveLength(11_204)
  const requests: Array<Command.StreamOracleRequest> = []
  for (const { state: start, signals } of traces) {
    let state = start
    let inputBytes = 0
    let outputBytes = 0
    let closures = 0
    for (const signal of signals) {
      const input = { state, signal }
      const next = windowsStreamStep(input)
      requests.push({ schema: 1, type: "windows_stream_step", input })
      if (next.action.type === "accepted") {
        if (signal.type === "input") inputBytes += signal.bytes
        if (signal.type === "output") outputBytes += signal.bytes
      }
      if (next.action.type === "close_input") closures += 1
      expect(next.state.input.remaining + inputBytes).toBe(start.input.remaining)
      expect(next.state.outputRemaining + outputBytes).toBe(start.outputRemaining)
      expect(closures).toBeLessThanOrEqual(1)
      if (state.input.type === "closed") expect(next.state.input.type).toBe("closed")
      state = next.state
    }
  }
  expect(requests).toHaveLength(42_952)
  compare(requests)
})

it("holds request ownership across 4372 cancellation and completion traces", () => {
  const requests: Array<Command.IoOracleRequest> = []
  let traces = 0
  for (const start of Command.IoPhase.literals) {
    for (const signals of sequences(Command.IoSignal.literals, 6)) {
      traces += 1
      let phase: Command.IoPhase = start
      let releases = 0
      let cancellations = 0
      for (const signal of signals) {
        const input = { phase, signal }
        const next = windowsIoStep(input)
        requests.push({ schema: 1, type: "windows_io_step", input })
        if (next.action === "release") {
          expect(phase).toBe("terminal")
          expect(signal).toBe("release")
          releases += 1
        }
        if (next.action === "cancel") {
          expect(phase).toBe("pending")
          expect(signal).toBe("cancel")
          cancellations += 1
        }
        if (phase === "released") expect(next).toEqual({ phase: "released", action: "ignore" })
        phase = next.phase
      }
      expect(releases).toBeLessThanOrEqual(1)
      expect(cancellations).toBeLessThanOrEqual(1)
      if ((start === "pending" || start === "cancelling") && !signals.includes("completed")) {
        expect(phase === "pending" || phase === "cancelling").toBe(true)
        expect(releases).toBe(0)
      }
    }
  }
  expect(traces).toBe(4_372)
  expect(requests).toHaveLength(24_060)
  compare(requests)
})

it("matches strict wire boundaries and numeric forms", () => {
  const script = fileURLToPath(new URL("../spec/scripts/check_windows_streams.py", import.meta.url))
  const result = spawnSync("python3", [script, "--cases"], { encoding: "utf8", timeout: 10_000 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const Cases = Schema.Struct({ rejected: Schema.Array(Schema.String), accepted: Schema.Array(Schema.String) })
  const cases = Schema.decodeUnknownSync(Cases, { onExcessProperty: "error" })(parseJson(result.stdout))
  const decode = Schema.decodeUnknownSync(Request, { onExcessProperty: "error" })
  for (const text of cases.rejected) expect(() => decode(parseJson(text)), text).toThrow()
  for (const text of cases.accepted) expect(() => decode(parseJson(text)), text).not.toThrow()
})
