import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as PortableLauncher from "../contracts/PortableLauncher.ts"
import { compilePortableLauncher } from "../contracts/PortableLauncher.ts"

type PortableVector = {
  readonly name: string
  readonly request: PortableLauncher.OracleRequest
  readonly expected: PortableLauncher.OracleResponse
}

type Host = PortableLauncher.Input["host"]
type Word = PortableLauncher.Input["plan"]["command"]
type WordKind = Word["type"]
type Position = "command" | "cwd" | "argument" | "environment_value"

type RawPlan = {
  readonly command: unknown
  readonly cwd: unknown
  readonly args: ReadonlyArray<unknown>
  readonly environment: ReadonlyArray<{ readonly name: string; readonly value: unknown }>
}

type GeneratedValue = { readonly name: string; readonly value: string }
type WordCase = { readonly kind: WordKind; readonly values: ReadonlyArray<GeneratedValue> }
type GeneratedCase = { readonly name: string; readonly request: PortableLauncher.OracleRequest }

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/portable-launcher.ndjson", import.meta.url))
const equivalentResponse = Schema.toEquivalence(PortableLauncher.OracleResponse)

const VectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: PortableLauncher.OracleRequest,
  expected: PortableLauncher.OracleResponse
})

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<PortableVector> {
  const cases: Array<PortableVector> = []
  for (const line of readFileSync(vectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    const row = decodeStrict(VectorRow, raw)
    cases.push({ name: row.name, request: row.request, expected: row.expected })
  }
  return cases
}

function runOracle(requests: ReadonlyArray<PortableLauncher.OracleRequest>): ReadonlyArray<PortableLauncher.OracleResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(PortableLauncher.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("portable launcher oracle request could not be encoded as JSON")
    lines.push(line)
  }
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Lean portable launcher oracle exited with status ${String(result.status)}: ${result.stderr}`)
  }

  const responses: Array<PortableLauncher.OracleResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(PortableLauncher.OracleResponse, raw))
  }
  return responses
}

function evaluate(request: PortableLauncher.OracleRequest): PortableLauncher.OracleResponse {
  const wire: unknown = Match.type<PortableLauncher.OracleRequest>().pipe(
    Match.discriminatorsExhaustive("type")({
      compile_portable_launcher: (current) => ({
        schema: 1,
        type: "compile_portable_launcher",
        output: compilePortableLauncher(current.input)
      })
    })
  )(request)
  return decodeStrict(PortableLauncher.OracleResponse, wire)
}

function compareCases(cases: ReadonlyArray<PortableVector>): void {
  const roundTripped = cases.map(({ request }) => {
    const encoded: unknown = Schema.encodeSync(PortableLauncher.OracleRequest)(request)
    return decodeStrict(PortableLauncher.OracleRequest, encoded)
  })
  const oracle = runOracle(roundTripped)
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = oracle[index]
    if (response === undefined) throw new Error(`Lean portable launcher oracle response ${index} is missing`)
    expect(equivalentResponse(response, current.expected), `${current.name}: Lean matches the authored output`).toBe(true)
    const actual = evaluate(current.request)
    expect(equivalentResponse(actual, current.expected), `${current.name}: TypeScript matches the authored output`).toBe(true)
    expect(equivalentResponse(actual, response), `${current.name}: TypeScript matches Lean`).toBe(true)
  }
}

const basePlan: RawPlan = {
  command: { type: "literal", value: "node" },
  cwd: { type: "root" },
  args: [],
  environment: []
}

const positionSetters: Record<Position, (plan: RawPlan, word: unknown) => RawPlan> = {
  command: (plan, word) => ({ ...plan, command: word }),
  cwd: (plan, word) => ({ ...plan, cwd: word }),
  argument: (plan, word) => ({ ...plan, args: [word] }),
  environment_value: (plan, word) => ({ ...plan, environment: [{ name: "DEST", value: word }] })
}

const hosts: ReadonlyArray<Host> = ["claude_code", "codex"]
const positions: ReadonlyArray<Position> = ["command", "cwd", "argument", "environment_value"]

const textValues: ReadonlyArray<GeneratedValue> = [
  { name: "empty", value: "" },
  { name: "unicode", value: "雪λ" },
  { name: "newline", value: "line\nbreak" },
  { name: "metacharacters", value: "${HOME} %PATH% & ' \"" }
]

const fileValues: ReadonlyArray<GeneratedValue> = [
  { name: "unicode", value: "mcp/雪 server.mjs" },
  { name: "newline", value: "mcp/line\nbreak.mjs" },
  { name: "metacharacters", value: "mcp/%PATH% & ' \".mjs" },
  { name: "space", value: "mcp/空 白.mjs" }
]

const wordCases: ReadonlyArray<WordCase> = [
  { kind: "literal", values: textValues },
  { kind: "file", values: fileValues },
  { kind: "root", values: [{ name: "fixed", value: "" }] },
  { kind: "environment", values: [
    { name: "upper_source", value: "SRC" },
    { name: "lower_source", value: "src" }
  ] }
]

const wordBuilders: Record<WordKind, (value: GeneratedValue) => unknown> = {
  literal: ({ value }) => ({ type: "literal", value }),
  root: () => ({ type: "root" }),
  file: ({ value }) => ({ type: "file", path: value }),
  environment: ({ value }) => ({ type: "environment", name: value })
}

const launcherPaths: ReadonlyArray<string> = [
  ".psdk/mcp/portable.json",
  ".psdk/mcp/雪 server.json",
  ".psdk/mcp/line\nbreak.json",
  ".psdk/mcp/meta %PATH% &'x'.json"
]

function portableRequest(host: Host, plan: unknown, path: string): PortableLauncher.OracleRequest {
  return decodeStrict(PortableLauncher.OracleRequest, {
    schema: 1,
    type: "compile_portable_launcher",
    input: { host, path, plan }
  })
}

function generatedRequests(): ReadonlyArray<GeneratedCase> {
  const cases: Array<GeneratedCase> = []
  for (const host of hosts) {
    for (const position of positions) {
      for (const wordCase of wordCases) {
        for (const value of wordCase.values) {
          const path = launcherPaths[cases.length % launcherPaths.length]
          if (path === undefined) throw new Error("portable launcher path matrix is empty")
          const plan = positionSetters[position](basePlan, wordBuilders[wordCase.kind](value))
          cases.push({
            name: `${host}/${position}/${wordCase.kind}/${value.name}/${path}`,
            request: portableRequest(host, plan, path)
          })
        }
      }
    }
  }

  const sourceSequences: ReadonlyArray<{ readonly name: string; readonly names: ReadonlyArray<string> }> = [
    { name: "forward_repeated", names: ["SRC", "OTHER", "SRC"] },
    { name: "reverse_repeated", names: ["OTHER", "SRC", "OTHER"] },
    { name: "case_distinct", names: ["SRC", "src", "SRC"] }
  ]
  for (const host of hosts) {
    for (const sequence of sourceSequences) {
      const args = sequence.names.map((name) => ({ type: "environment", name }))
      cases.push({
        name: `${host}/sources/${sequence.name}`,
        request: portableRequest(host, { ...basePlan, args }, ".psdk/mcp/sources.json")
      })
    }
  }

  const destinations: ReadonlyArray<{ readonly name: string; readonly names: ReadonlyArray<string> }> = [
    { name: "alias", names: ["PATH", "Path"] },
    { name: "reverse_alias", names: ["Path", "PATH"] },
    { name: "duplicate", names: ["X", "X"] }
  ]
  for (const host of hosts) {
    for (const destination of destinations) {
      const environment = destination.names.map((name) => ({
        name,
        value: { type: "literal", value: "" }
      }))
      cases.push({
        name: `${host}/destinations/${destination.name}`,
        request: portableRequest(host, { ...basePlan, environment }, ".psdk/mcp/destinations.json")
      })
    }
  }
  return cases
}

function expectLeanReject(request: unknown, name: string): void {
  const line = JSON.stringify(request)
  if (line === undefined) throw new Error(`${name}: malformed request could not be encoded as JSON`)
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${line}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 1) {
    throw new Error(`${name}: Lean oracle returned ${String(result.status)} instead of rejecting: ${result.stdout}${result.stderr}`)
  }
  expect(result.stdout, `${name}: rejected request has no response`).toBe("")
  expect(result.stderr, `${name}: Lean reports the rejected request`).toContain("oracle:")
}

function malformedRequests(): ReadonlyArray<{ readonly name: string; readonly request: unknown }> {
  const request = {
    schema: 1,
    type: "compile_portable_launcher",
    input: {
      host: "claude_code",
      path: ".psdk/mcp/portable.json",
      plan: {
        command: { type: "literal", value: "node" },
        args: [],
        environment: [],
        cwd: { type: "root" }
      }
    }
  }
  return [
    {
      name: "nested excess field",
      request: {
        ...request,
        input: {
          ...request.input,
          plan: { ...request.input.plan, command: { ...request.input.plan.command, unexpected: true } }
        }
      }
    },
    { name: "unknown host", request: { ...request, input: { ...request.input, host: "unknown_host" } } },
    {
      name: "unknown word",
      request: { ...request, input: { ...request.input, plan: { ...request.input.plan, args: [{ type: "unknown_word" }] } } }
    },
    {
      name: "NUL process text",
      request: {
        ...request,
        input: { ...request.input, plan: { ...request.input.plan, args: [{ type: "literal", value: "before\0after" }] } }
      }
    },
    {
      name: "lone surrogate process text",
      request: {
        ...request,
        input: { ...request.input, plan: { ...request.input.plan, args: [{ type: "literal", value: "\ud800" }] } }
      }
    },
    { name: "dollar launcher path", request: { ...request, input: { ...request.input, path: ".psdk/mcp/${EXPANSION}.json" } } },
    { name: "unsupported schema version", request: { ...request, schema: 2 } },
    { name: "top-level excess field", request: { ...request, unexpected: true } }
  ]
}

const vectors = readVectors()

it("matches all ten independently authored portable launcher vectors against Lean and TypeScript", () => {
  expect(vectors).toHaveLength(10)
  compareCases(vectors)
})

it("matches Lean across 100 bounded host, source, word-position, path, and destination cases", () => {
  const cases = generatedRequests()
  expect(cases).toHaveLength(100)
  const oracle = runOracle(cases.map(({ request }) => request))
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const expected = oracle[index]
    if (expected === undefined) throw new Error(`${current.name}: Lean response is missing`)
    expect(equivalentResponse(evaluate(current.request), expected), current.name).toBe(true)
  }
})

it("strictly rejects malformed requests in Effect and Lean and malformed results in Effect", () => {
  const invalidRequests = malformedRequests()
  expect(invalidRequests).toHaveLength(8)
  for (const current of invalidRequests) {
    expect(() => decodeStrict(PortableLauncher.OracleRequest, current.request), `${current.name}: Effect rejects`).toThrow()
    expectLeanReject(current.request, current.name)
  }

  const baseline = vectors[0]
  if (baseline === undefined) throw new Error("The minimal portable launcher vector is missing")
  expect(() => decodeStrict(PortableLauncher.OracleResponse, {
    ...baseline.expected,
    output: { type: "rejected", issues: [] }
  }), "empty result issue arrays are rejected").toThrow()
  expect(() => decodeStrict(PortableLauncher.OracleResponse, {
    ...baseline.expected,
    output: { ...baseline.expected.output, unexpected: true }
  }), "excess result fields are rejected").toThrow()
})
