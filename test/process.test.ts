import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Process from "../contracts/Process.ts"
import { lowerProcess, quoteProcessText } from "../src/compiler/process/model.ts"

type ProcessVector = {
  readonly name: string
  readonly request: Process.OracleRequest
  readonly expected: Process.OracleResponse
}

type QuotingVector = {
  readonly name: string
  readonly request: Process.QuotingOracleRequest
  readonly expected: Process.QuotingOracleResponse
}

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const processVectorPath = fileURLToPath(new URL("../spec/vectors/process.ndjson", import.meta.url))
const quotingVectorPath = fileURLToPath(new URL("../spec/vectors/process-quoting.ndjson", import.meta.url))

const ProcessVectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: Process.OracleRequest,
  expected: Process.OracleResponse
})

const QuotingVectorRow = Schema.Struct({
  name: Schema.String,
  request: Process.QuotingOracleRequest,
  expected: Process.QuotingOracleResponse
})

const equivalentProcessResponse = Schema.toEquivalence(Process.OracleResponse)
const equivalentQuotingResponse = Schema.toEquivalence(Process.QuotingOracleResponse)

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readProcessVectors(): ReadonlyArray<ProcessVector> {
  const cases: Array<ProcessVector> = []
  for (const line of readFileSync(processVectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const row = decodeStrict(ProcessVectorRow, JSON.parse(line))
    cases.push({ name: row.name, request: row.request, expected: row.expected })
  }
  return cases
}

function readQuotingVectors(): ReadonlyArray<QuotingVector> {
  const cases: Array<QuotingVector> = []
  for (const line of readFileSync(quotingVectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const row = decodeStrict(QuotingVectorRow, JSON.parse(line))
    cases.push({ name: row.name, request: row.request, expected: row.expected })
  }
  return cases
}

function runProcessOracle(requests: ReadonlyArray<Process.OracleRequest>): ReadonlyArray<Process.OracleResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(Process.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("process oracle request could not be encoded as JSON")
    lines.push(line)
  }
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean process oracle exited with status ${String(result.status)}: ${result.stderr}`)

  const responses: Array<Process.OracleResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(Process.OracleResponse, raw))
  }
  return responses
}

function runQuotingOracle(requests: ReadonlyArray<Process.QuotingOracleRequest>): ReadonlyArray<Process.QuotingOracleResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(Process.QuotingOracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("process quoting oracle request could not be encoded as JSON")
    lines.push(line)
  }
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean process quoting oracle exited with status ${String(result.status)}: ${result.stderr}`)

  const responses: Array<Process.QuotingOracleResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(Process.QuotingOracleResponse, raw))
  }
  return responses
}

function evaluateProcess(request: Process.OracleRequest): Process.OracleResponse {
  const decoded = decodeStrict(Process.OracleResponse, {
    schema: 1,
    type: "lower_process",
    output: lowerProcess(request.input)
  })
  const encoded: unknown = Schema.encodeSync(Process.OracleResponse)(decoded)
  return decodeStrict(Process.OracleResponse, encoded)
}

function evaluateQuoting(request: Process.QuotingOracleRequest): Process.QuotingOracleResponse {
  const decoded = decodeStrict(Process.QuotingOracleResponse, {
    schema: 1,
    type: "quote_process_text",
    output: { quoted: quoteProcessText(request.input.text) }
  })
  const encoded: unknown = Schema.encodeSync(Process.QuotingOracleResponse)(decoded)
  return decodeStrict(Process.QuotingOracleResponse, encoded)
}

function compareProcessCases(cases: ReadonlyArray<ProcessVector>): void {
  const roundTripped = cases.map(({ request }) => {
    const encoded: unknown = Schema.encodeSync(Process.OracleRequest)(request)
    return decodeStrict(Process.OracleRequest, encoded)
  })
  const oracle = runProcessOracle(roundTripped)
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = oracle[index]
    if (response === undefined) throw new Error(`Lean process oracle response ${index} is missing`)
    expect(equivalentProcessResponse(response, current.expected), `${current.name}: Lean matches the committed expected output`).toBe(true)
    expect(equivalentProcessResponse(evaluateProcess(current.request), current.expected), `${current.name}: TypeScript matches the committed expected output`).toBe(true)
    expect(equivalentProcessResponse(evaluateProcess(current.request), response), `${current.name}: TypeScript matches Lean`).toBe(true)
  }
}

function compareQuotingCases(cases: ReadonlyArray<QuotingVector>): void {
  const roundTripped = cases.map(({ request }) => {
    const encoded: unknown = Schema.encodeSync(Process.QuotingOracleRequest)(request)
    return decodeStrict(Process.QuotingOracleRequest, encoded)
  })
  const oracle = runQuotingOracle(roundTripped)
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = oracle[index]
    if (response === undefined) throw new Error(`Lean process quoting oracle response ${index} is missing`)
    expect(equivalentQuotingResponse(response, current.expected), `${current.name}: Lean matches the committed expected output`).toBe(true)
    expect(equivalentQuotingResponse(evaluateQuoting(current.request), current.expected), `${current.name}: TypeScript matches the committed expected output`).toBe(true)
    expect(equivalentQuotingResponse(evaluateQuoting(current.request), response), `${current.name}: TypeScript matches Lean`).toBe(true)
  }
}

function permutations<A>(values: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> {
  if (values.length === 0) return [[]]
  const result: Array<ReadonlyArray<A>> = []
  for (const [index, head] of values.entries()) {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)]
    for (const tail of permutations(rest)) result.push([head, ...tail])
  }
  return result
}

const processVectors = readProcessVectors()
const quotingVectors = readQuotingVectors()

it("matches every committed process vector against its authored result and the Lean oracle", () => {
  expect(processVectors).toHaveLength(22)
  compareProcessCases(processVectors)
})

it("preserves the authored result across bounded file and environment enumeration", () => {
  const valid = processVectors.find((row) => row.name === "enumeration_forward")
  const rejected = processVectors.find((row) => row.name === "all_environment_problems_are_preserved")
  if (valid === undefined || rejected === undefined) throw new Error("Process enumeration vectors are missing")

  const generated: Array<ProcessVector> = []
  for (const files of permutations(valid.request.input.files)) {
    for (const environment of permutations(valid.request.input.definition.environment)) {
      generated.push({
        name: `valid permutation ${generated.length}`,
        request: decodeStrict(Process.OracleRequest, {
          ...valid.request,
          input: {
            ...valid.request.input,
            files,
            definition: { ...valid.request.input.definition, environment }
          }
        }),
        expected: valid.expected
      })
    }
  }
  for (const environment of permutations(rejected.request.input.definition.environment)) {
    generated.push({
      name: `rejected permutation ${generated.length}`,
      request: decodeStrict(Process.OracleRequest, {
        ...rejected.request,
        input: {
          ...rejected.request.input,
          definition: { ...rejected.request.input.definition, environment }
        }
      }),
      expected: rejected.expected
    })
  }
  expect(generated).toHaveLength(6)
  compareProcessCases(generated)
})

it("matches the process text quoting vectors, including empty text, apostrophes, placeholders, newlines and Unicode", () => {
  expect(quotingVectors).toHaveLength(9)
  compareQuotingCases(quotingVectors)
})

it("strictly rejects excess fields and invalid process text at nested schema boundaries", () => {
  const request = processVectors[0]?.request
  if (request === undefined) throw new Error("The empty process vector is missing")

  expect(() => decodeStrict(Process.OracleRequest, {
    ...request,
    input: {
      ...request.input,
      definition: {
        ...request.input.definition,
        command: { ...request.input.definition.command, extra: true }
      }
    }
  })).toThrow()
  expect(() => decodeStrict(Process.OracleResponse, {
    schema: 1,
    type: "lower_process",
    output: {
      type: "planned",
      plan: {
        command: { type: "literal", value: "node", extra: true },
        args: [],
        environment: [],
        cwd: { type: "root" }
      }
    }
  })).toThrow()
  expect(() => decodeStrict(Process.Program, { type: "external", name: "../node" })).toThrow()
  expect(() => decodeStrict(Process.Argument, { type: "literal", value: "before\0after" })).toThrow()
  expect(() => decodeStrict(Process.Argument, { type: "literal", value: "\ud800" })).toThrow()
  expect(() => decodeStrict(Process.Argument, { type: "file", path: "mcp/\ud800" })).toThrow()
  expect(() => decodeStrict(Process.Argument, { type: "file", path: "mcp/雪😀.mjs" })).not.toThrow()
})
