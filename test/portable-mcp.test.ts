import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { Format } from "../contracts/Compiler.ts"
import { ProcessPlan } from "../contracts/Process.ts"
import * as PortableMcp from "../contracts/PortableMcp.ts"
import { parseJson } from "../src/internal/json.ts"

type Vector = typeof VectorRow.Type
type Plan = ProcessPlan
type Remote = PortableMcp.Input["remote"][string]
type RemoteEntry = readonly [string, Remote]
type LocalEntry = readonly [string, Plan]
type MatrixVariant = "zero" | "single" | "valid-three" | "invalid-three"
type NamedRequest = { readonly name: string; readonly request: PortableMcp.OracleRequest }
type MatrixRequest = NamedRequest & { readonly variant: MatrixVariant }
type EnumerationPair = {
  readonly name: string
  readonly acceptance: "accepted" | "rejected"
  readonly cases: readonly [NamedRequest, NamedRequest]
}

const oraclePath = process.env["PLUGINSDK_ORACLE"] ??
  fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/portable-mcp.ndjson", import.meta.url))
const equivalent = Schema.toEquivalence(PortableMcp.OracleResponse)
const VectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: PortableMcp.OracleRequest,
  expected: PortableMcp.OracleResponse
})

function strict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
}

function readVectors(): ReadonlyArray<Vector> {
  return readFileSync(vectorPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).map(
    (line) => strict(VectorRow, parseJson(line))
  )
}

function makeRequest(input: PortableMcp.Input): PortableMcp.OracleRequest {
  return strict(PortableMcp.OracleRequest, { schema: 1, type: "render_portable_mcp", input })
}

function remoteEntries(reverse: boolean): ReadonlyArray<RemoteEntry> {
  const headerEntries: ReadonlyArray<readonly [string, string]> = reverse
    ? [["X-A", "first"], ["X-Z", "last"]]
    : [["X-Z", "last"], ["X-A", "first"]]
  const headers = Object.fromEntries(headerEntries)
  const entries: ReadonlyArray<RemoteEntry> = [
    ["crm", { url: "https://crm.example/mcp", headers }],
    ["telemetry", { url: "https://telemetry.example/mcp", headers: { Authorization: "Bearer fixed" } }]
  ]
  return reverse ? [...entries].reverse() : entries
}

function makeInput(
  format: PortableMcp.Input["format"],
  remotes: ReadonlyArray<RemoteEntry>,
  locals: ReadonlyArray<LocalEntry>
): PortableMcp.Input {
  return strict(PortableMcp.Input, {
    format,
    remote: Object.fromEntries(remotes),
    local: Object.fromEntries(locals)
  })
}

function runOracle(requests: ReadonlyArray<PortableMcp.OracleRequest>): ReadonlyArray<PortableMcp.OracleResponse> {
  const lines = requests.map((request) => {
    const encoded = Schema.encodeSync(PortableMcp.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("portable MCP oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Lean portable MCP oracle exited with status ${String(result.status)}: ${result.stderr}`)
  }
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map(
    (line) => strict(PortableMcp.OracleResponse, parseJson(line))
  )
}

function evaluate(request: PortableMcp.OracleRequest): PortableMcp.OracleResponse {
  return strict(PortableMcp.OracleResponse, {
    schema: 1,
    type: "render_portable_mcp",
    output: PortableMcp.renderPortableMcp(request.input)
  })
}

function compare(requests: ReadonlyArray<PortableMcp.OracleRequest>): ReadonlyArray<PortableMcp.OracleResponse> {
  const responses = runOracle(requests)
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean portable MCP response ${index}`)
    const actual = evaluate(request)
    expect(equivalent(actual, response), `portable MCP request ${index}: TypeScript matches Lean`).toBe(true)
  }
  return responses
}

const wordPlan: Plan = strict(ProcessPlan, {
  command: { type: "literal", value: "node" },
  args: [
    { type: "literal", value: "${HOME} %PATH% & 'quoted'" },
    { type: "file", path: "mcp/server.mjs" },
    { type: "root" },
    { type: "environment", name: "SRC" }
  ],
  environment: [{ name: "TOKEN", value: { type: "environment", name: "SRC" } }],
  cwd: { type: "file", path: "work dir" }
})

const capturePlan: Plan = strict(ProcessPlan, {
  command: { type: "file", path: "mcp/worker.mjs" },
  args: [
    { type: "environment", name: "SRC" },
    { type: "environment", name: "src" },
    { type: "environment", name: "SRC" }
  ],
  environment: [{ name: "TOKEN", value: { type: "environment", name: "src" } }],
  cwd: { type: "root" }
})

const diagnosticPlan: Plan = strict(ProcessPlan, {
  command: { type: "literal", value: "node" },
  args: [
    { type: "environment", name: "Z" },
    { type: "environment", name: "A" },
    { type: "environment", name: "Z" }
  ],
  environment: [
    { name: "PATH", value: { type: "literal", value: "one" } },
    { name: "Path", value: { type: "literal", value: "two" } },
    { name: "X", value: { type: "literal", value: "three" } },
    { name: "X", value: { type: "literal", value: "four" } }
  ],
  cwd: { type: "root" }
})

const literalPlan: Plan = strict(ProcessPlan, {
  command: { type: "literal", value: "node" },
  args: [
    { type: "literal", value: "" },
    { type: "literal", value: "${HOME} %PATH% & 'quoted'" },
    { type: "file", path: "mcp/server.mjs" },
    { type: "root" }
  ],
  environment: [{ name: "TOKEN", value: { type: "literal", value: "literal ${TOKEN} &" } }],
  cwd: { type: "file", path: "work dir" }
})

function generatedMatrix(): ReadonlyArray<MatrixRequest> {
  const formats: ReadonlyArray<PortableMcp.Input["format"]> = Format.literals
  const cases: Array<MatrixRequest> = []
  for (const format of formats) {
    for (const withRemote of [false, true]) {
      const variants: ReadonlyArray<{ readonly name: MatrixVariant; readonly locals: ReadonlyArray<LocalEntry> }> = [
        { name: "zero", locals: [] },
        { name: "single", locals: [["alpha", literalPlan]] },
        { name: "valid-three", locals: [["zeta", literalPlan], ["alpha", literalPlan], ["βeta", literalPlan]] },
        { name: "invalid-three", locals: [["zeta", diagnosticPlan], ["alpha", wordPlan], ["βeta", capturePlan]] }
      ]
      for (const variant of variants) {
        const remotes = withRemote ? remoteEntries(false) : []
        const input = makeInput(format, remotes, variant.locals)
        cases.push({
          name: `${format}/remote-${withRemote}/${variant.name}`,
          variant: variant.name,
          request: makeRequest(input)
        })
      }
    }
  }
  return cases
}

function enumerationPairs(): ReadonlyArray<EnumerationPair> {
  const formats: ReadonlyArray<PortableMcp.Input["format"]> = Format.literals
  const pairs: Array<EnumerationPair> = []
  for (const format of formats) {
    const acceptedLocals: ReadonlyArray<LocalEntry> = [
      ["zeta", literalPlan],
      ["alpha", literalPlan]
    ]
    const acceptedOriginal = makeRequest(makeInput(format, remoteEntries(false), acceptedLocals))
    const acceptedPermuted = makeRequest(makeInput(format, remoteEntries(true), [...acceptedLocals].reverse()))
    pairs.push({
      name: `${format}/accepted enumeration`,
      acceptance: "accepted",
      cases: [
        { name: `${format}/accepted original`, request: acceptedOriginal },
        { name: `${format}/accepted permuted`, request: acceptedPermuted }
      ]
    })

    const rejectedLocals: ReadonlyArray<LocalEntry> = [
      ["zeta", diagnosticPlan],
      ["alpha", capturePlan]
    ]
    const rejectedOriginal = makeRequest(makeInput(format, remoteEntries(false), rejectedLocals))
    const rejectedPermuted = makeRequest(makeInput(format, remoteEntries(true), [...rejectedLocals].reverse()))
    pairs.push({
      name: `${format}/rejected enumeration`,
      acceptance: "rejected",
      cases: [
        { name: `${format}/rejected original`, request: rejectedOriginal },
        { name: `${format}/rejected permuted`, request: rejectedPermuted }
      ]
    })
  }
  return pairs
}

function expectRenderedFiles(response: PortableMcp.OracleResponse, count: number, name: string): void {
  const files = Match.value(response.output).pipe(
    Match.discriminatorsExhaustive("type")({
      rendered: ({ document, files: renderedFiles }) => {
        expect(document, `${name}: rendered document exists`).not.toBeNull()
        return renderedFiles
      },
      rejected: ({ issues }) => {
        throw new Error(`${name}: expected rendering, received ${JSON.stringify(issues)}`)
      }
    })
  )
  expect(files, `${name}: generated file count`).toHaveLength(count)
}

function expectRejectedWithMultipleIssues(response: PortableMcp.OracleResponse, name: string): void {
  Match.value(response.output).pipe(
    Match.discriminatorsExhaustive("type")({
      rendered: () => { throw new Error(`${name}: expected a rejected result`) },
      rejected: ({ issues }) => expect(issues.length, `${name}: repeated diagnostics`).toBeGreaterThan(1)
    })
  )
}

function expectLeanReject(request: unknown, name: string): void {
  const line = JSON.stringify(request)
  if (line === undefined) throw new Error(`${name}: malformed request could not be encoded as JSON`)
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${line}\n`,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 1) {
    throw new Error(`${name}: Lean oracle returned ${String(result.status)} instead of rejecting: ${result.stdout}${result.stderr}`)
  }
  expect(result.stdout, `${name}: rejected request has no response`).toBe("")
  expect(result.stderr, `${name}: Lean reports the rejected request`).toContain("oracle:")
}

const vectors = readVectors()

it("matches committed portable MCP expectations against strict Lean and TypeScript", () => {
  expect(new Set(vectors.map(({ request }) => request.input.format))).toEqual(new Set(Format.literals))
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing response for authored vector ${vector.name}`)
    expect(equivalent(response, vector.expected), `${vector.name}: Lean matches the committed expectation`).toBe(true)
  }
})

it("matches a bounded format, remote, canonical-local, process-word, capture, and diagnostic matrix", () => {
  const cases = generatedMatrix()
  expect(new Set(cases.map(({ request }) => request.input.format))).toEqual(new Set(Format.literals))
  expect(new Set(cases.map(({ variant }) => variant))).toEqual(
    new Set<MatrixVariant>(["zero", "single", "valid-three", "invalid-three"])
  )
  const responses = compare(cases.map(({ request }) => request))
  for (const [index, current] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing matrix response for ${current.name}`)
    if (current.variant === "valid-three") expectRenderedFiles(response, 7, current.name)
    if (current.variant === "invalid-three") expectRejectedWithMultipleIssues(response, current.name)
  }
})

it("preserves results when remote maps, local maps, and remote header maps are enumerated differently", () => {
  const pairs = enumerationPairs()
  expect(new Set(pairs.flatMap(({ cases: pairCases }) => pairCases.map(({ request }) => request.input.format))))
    .toEqual(new Set(Format.literals))
  expect(new Set(pairs.map(({ acceptance }) => acceptance))).toEqual(new Set(["accepted", "rejected"]))
  const cases = pairs.flatMap(({ cases: pairCases }) => pairCases)
  const responses = compare(cases.map(({ request }) => request))
  for (const [pairIndex, pair] of pairs.entries()) {
    const firstIndex = pairIndex * 2
    const first = responses[firstIndex]
    const second = responses[firstIndex + 1]
    const [original, permuted] = pair.cases
    if (first === undefined || second === undefined) throw new Error(`Missing enumeration pair ${pairIndex}`)
    if (pair.acceptance === "accepted") {
      expectRenderedFiles(first, 5, original.name)
      expectRenderedFiles(second, 5, permuted.name)
    } else {
      expectRejectedWithMultipleIssues(first, original.name)
      expectRejectedWithMultipleIssues(second, permuted.name)
    }
    expect(equivalent(first, second), `${original.name} and ${permuted.name}: Lean is enumeration invariant`).toBe(true)
    expect(equivalent(evaluate(original.request), evaluate(permuted.request)), `${original.name} and ${permuted.name}: TypeScript is enumeration invariant`).toBe(true)
  }
})

it("strictly rejects malformed requests in Effect and Lean", () => {
  const baseline = makeRequest(makeInput("claude_code", [], [["alpha", wordPlan]]))
  const overlapRemote: Remote = { url: "https://alpha.example/mcp", headers: {} }
  const invalidRequests: ReadonlyArray<{ readonly name: string; readonly request: unknown }> = [
    {
      name: "remote and local name overlap",
      request: { ...baseline, input: { ...baseline.input, remote: { alpha: overlapRemote } } }
    },
    {
      name: "nested excess process field",
      request: {
        ...baseline,
        input: {
          ...baseline.input,
          local: { alpha: { ...wordPlan, command: { type: "literal", value: "node", unexpected: true } } }
        }
      }
    },
    {
      name: "invalid process plan word",
      request: {
        ...baseline,
        input: { ...baseline.input, local: { alpha: { ...wordPlan, command: { type: "external", name: "node" } } } }
      }
    },
    {
      name: "invalid process path",
      request: {
        ...baseline,
        input: {
          ...baseline.input,
          local: { alpha: { ...wordPlan, args: [{ type: "file", path: "mcp/../outside.mjs" }] } }
        }
      }
    },
    {
      name: "invalid process text",
      request: {
        ...baseline,
        input: {
          ...baseline.input,
          local: { alpha: { ...wordPlan, args: [{ type: "literal", value: "before\0after" }] } }
        }
      }
    },
    { name: "unsupported schema version", request: { ...baseline, schema: 2 } },
    {
      name: "unsupported base format",
      request: { ...baseline, input: { ...baseline.input, format: "future_format" } }
    }
  ]
  expect(invalidRequests).toHaveLength(7)
  for (const current of invalidRequests) {
    expect(() => strict(PortableMcp.OracleRequest, current.request), `${current.name}: Effect rejects`).toThrow()
    expectLeanReject(current.request, current.name)
  }
})

it("strictly rejects malformed portable process data, file plans, and results in Effect", () => {
  const singleLocal = vectors.find((vector) => vector.name === "claude_code_single_local")
  if (singleLocal === undefined) throw new Error("The single-local authored vector is missing")
  const processFile = Match.value(singleLocal.expected.output).pipe(
    Match.discriminatorsExhaustive("type")({
      rendered: ({ files }) => files.find((file) => file.type === "process"),
      rejected: () => undefined
    })
  )
  if (processFile === undefined) throw new Error("The single-local authored vector has no process data")

  const malformedProcessData: ReadonlyArray<unknown> = [
    { ...processFile.data, schema: 2 },
    { ...processFile.data, script: { ...processFile.data.script, unexpected: true } }
  ]
  expect(malformedProcessData).toHaveLength(2)
  for (const value of malformedProcessData) expect(() => strict(PortableMcp.ProcessData, value)).toThrow()

  const malformedFilePlans: ReadonlyArray<unknown> = [
    { type: "posix", path: ".psdk/mcp/../outside.sh", content: "#!/bin/sh\n" },
    { type: "posix", path: processFile.data.posix, content: "before\0after" }
  ]
  expect(malformedFilePlans).toHaveLength(2)
  for (const value of malformedFilePlans) expect(() => strict(PortableMcp.FilePlan, value)).toThrow()

  const malformedResults: ReadonlyArray<unknown> = [
    { type: "rejected", issues: [] },
    { type: "rendered", document: null, files: malformedFilePlans.slice(0, 1) },
    { type: "rendered", document: null, files: [], unexpected: true }
  ]
  expect(malformedResults).toHaveLength(3)
  for (const value of malformedResults) expect(() => strict(PortableMcp.Result, value)).toThrow()
})
