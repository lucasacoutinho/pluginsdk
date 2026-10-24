import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { Script } from "../contracts/Launcher.ts"
import * as ProcessRuntime from "../contracts/ProcessRuntime.ts"

type Vector = typeof VectorRow.Type
type NamedRequest = { readonly name: string; readonly request: ProcessRuntime.OracleRequest }
type ExpectedCase = NamedRequest & { readonly expected: ProcessRuntime.OracleResponse }
type ExecutionRequest = Extract<ProcessRuntime.OracleRequest, { readonly type: "execute_process" }>

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/process-runtime.ndjson", import.meta.url))
const equivalentResponse = Schema.toEquivalence(ProcessRuntime.OracleResponse)
const VectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: ProcessRuntime.OracleRequest,
  expected: ProcessRuntime.OracleResponse
})

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<Vector> {
  const vectors: Array<Vector> = []
  for (const line of readFileSync(vectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    vectors.push(decodeStrict(VectorRow, raw))
  }
  return vectors
}

function runOracle(requests: ReadonlyArray<ProcessRuntime.OracleRequest>): ReadonlyArray<ProcessRuntime.OracleResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(ProcessRuntime.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("process runtime oracle request could not be encoded as JSON")
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
    throw new Error(`Lean process runtime oracle exited with status ${String(result.status)}: ${result.stderr}`)
  }

  const responses: Array<ProcessRuntime.OracleResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(ProcessRuntime.OracleResponse, raw))
  }
  return responses
}

function evaluate(request: ProcessRuntime.OracleRequest): ProcessRuntime.OracleResponse {
  const response: unknown = Match.type<ProcessRuntime.OracleRequest>().pipe(
    Match.discriminatorsExhaustive("type")({
      read_process_capture: ({ input }) => ({
        schema: 1,
        type: "read_process_capture",
        output: ProcessRuntime.readProcessCapture(input)
      }),
      execute_process: ({ input }) => ({
        schema: 1,
        type: "execute_process",
        output: ProcessRuntime.executeProcess(input)
      })
    })
  )(request)
  return decodeStrict(ProcessRuntime.OracleResponse, response)
}

function captureRequest(input: unknown): ProcessRuntime.OracleRequest {
  return decodeStrict(ProcessRuntime.OracleRequest, {
    schema: 1,
    type: "read_process_capture",
    input
  })
}

function executionRequest(input: unknown): ExecutionRequest {
  const request = decodeStrict(ProcessRuntime.OracleRequest, {
    schema: 1,
    type: "execute_process",
    input
  })
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    read_process_capture: () => { throw new Error("expected an execute_process request") },
    execute_process: (current) => current
  }))
}

function captureCase(name: string, input: unknown, output: unknown): ExpectedCase {
  return {
    name,
    request: captureRequest(input),
    expected: decodeStrict(ProcessRuntime.OracleResponse, {
      schema: 1,
      type: "read_process_capture",
      output
    })
  }
}

function generatedCaptureCases(): ReadonlyArray<ExpectedCase> {
  const cases: Array<ExpectedCase> = []
  const sources: ReadonlyArray<string> = ["TOKEN", "SOURCE_2", "_Local"]
  const metacharacters = "${OTHER} %PATH% & '\"\n雪λ"
  for (const source of sources) {
    const placeholder = "${" + source + "}"
    cases.push(
      captureCase(`${source}/missing-raw`, { source, raw: null, check: "present" }, null),
      captureCase(`${source}/missing-check`, { source, raw: "present", check: null }, null),
      captureCase(`${source}/empty-value`, { source, raw: "", check: "" }, ""),
      captureCase(`${source}/literal-placeholder`, { source, raw: placeholder, check: placeholder }, placeholder),
      captureCase(`${source}/absent-source-protocol`, { source, raw: placeholder, check: "PSDK_ABSENT" }, null),
      captureCase(`${source}/literal-fallback`, { source, raw: "PSDK_ABSENT", check: "PSDK_ABSENT" }, "PSDK_ABSENT"),
      captureCase(`${source}/other-placeholder`, { source, raw: "${OTHER}", check: "resolved" }, "${OTHER}"),
      captureCase(`${source}/metacharacters-unicode`, { source, raw: metacharacters, check: metacharacters }, metacharacters)
    )
  }
  return cases
}

function executionCase(name: string, script: unknown, captures: unknown, output: unknown): ExpectedCase {
  const input = decodeStrict(ProcessRuntime.ExecutionInput, {
    script: decodeStrict(Script, script),
    root: "C:\\Plugin Root",
    captures
  })
  return {
    name,
    request: executionRequest(input),
    expected: decodeStrict(ProcessRuntime.OracleResponse, {
      schema: 1,
      type: "execute_process",
      output
    })
  }
}

function captureRecord(source: string, value: unknown): Readonly<Record<string, unknown>> {
  const entries: ReadonlyArray<readonly [string, unknown]> = [[source, value]]
  return Object.fromEntries(entries)
}

function generatedExecutionCases(): ReadonlyArray<ExpectedCase> {
  const root = "C:\\Plugin Root"
  const tokenCapture = { source: "TOKEN", raw: "PSDK_TOKEN_0", check: "PSDK_CHECK_0" }
  const baseScript: Record<string, unknown> = {
    names: [],
    captures: [],
    snapshot: [{ type: "literal", value: "node" }],
    command: 1,
    args: [],
    environment: [],
    cwd: 0
  }
  const script = (fields: Record<string, unknown>): Record<string, unknown> => ({ ...baseScript, ...fields })
  const cases: Array<ExpectedCase> = [
    executionCase("root-file-literal-and-ordered-outputs", script({
      names: ["UNUSED"],
      snapshot: [
        { type: "literal", value: "node" },
        { type: "root" },
        { type: "file", path: "mcp/runner.mjs" },
        { type: "literal", value: "${HOME} %PATH% &" },
        { type: "literal", value: "" },
        { type: "literal", value: "λ\n雪" }
      ],
      args: [4, 5, 3, 6, 0],
      environment: [
        { name: "ZED", index: 6 },
        { name: "ALPHA", index: 4 },
        { name: "ROOT_VALUE", index: 0 }
      ],
      cwd: 3
    }), {}, {
      command: "node",
      args: ["${HOME} %PATH% &", "", `${root}/mcp/runner.mjs`, "λ\n雪", root],
      environment: [
        { name: "ZED", value: "λ\n雪" },
        { name: "ALPHA", value: "${HOME} %PATH% &" },
        { name: "ROOT_VALUE", value: root }
      ],
      cwd: `${root}/mcp/runner.mjs`
    }),
    executionCase("capture-snapshot-is-stable-before-environment-values", script({
      names: ["UNRELATED", "TOKEN", "TOKEN"],
      captures: [tokenCapture],
      snapshot: [
        { type: "literal", value: "node" },
        { type: "captured", capture: tokenCapture },
        { type: "literal", value: "replacement" },
        { type: "captured", capture: tokenCapture }
      ],
      args: [4, 2],
      environment: [
        { name: "ZED", index: 3 },
        { name: "TOKEN", index: 2 },
        { name: "ROOT_VALUE", index: 0 }
      ],
      cwd: 2
    }), { TOKEN: "before" }, {
      command: "node",
      args: ["before", "before"],
      environment: [
        { name: "ZED", value: "replacement" },
        { name: "TOKEN", value: "before" },
        { name: "ROOT_VALUE", value: root }
      ],
      cwd: "before"
    }),
    executionCase("empty-script-shape-resolves-root", script({ snapshot: [], command: 0 }), {}, {
      command: root, args: [], environment: [], cwd: root
    }),
    executionCase("declared-source-guard-without-captured-word", script({ captures: [tokenCapture] }), {}, null),
    executionCase("declared-null-source-guard", script({ names: ["TOKEN"], captures: [tokenCapture] }), { TOKEN: null }, null),
    executionCase("missing-captured-snapshot-word", script({
      snapshot: [
        { type: "literal", value: "node" },
        { type: "captured", capture: tokenCapture }
      ],
    }), {}, null),
    executionCase("out-of-range-command-index", script({ command: 2 }), {}, null),
    executionCase("out-of-range-cwd-index", script({ cwd: 2 }), {}, null),
    executionCase("out-of-range-argument-index", script({ args: [2] }), {}, null),
    executionCase("out-of-range-environment-index", script({ environment: [{ name: "DEST", index: 2 }] }), {}, null)
  ]

  const prototypeKeys: ReadonlyArray<string> = ["toString", "constructor", "__proto__"]
  const accessModes: ReadonlyArray<{ readonly name: string; readonly declared: boolean }> = [
    { name: "declared", declared: true },
    { name: "snapshot-only", declared: false }
  ]
  for (const source of prototypeKeys) {
    const capture = { source, raw: `PSDK_${source}_0`, check: `PSDK_CHECK_${source}_0` }
    const ownValue = `captured:${source}`
    for (const mode of accessModes) {
      const capturedScript = script({
        names: [source],
        captures: mode.declared ? [capture] : [],
        snapshot: [
          { type: "literal", value: "node" },
          { type: "captured", capture }
        ],
        args: [2]
      })
      const output = { command: "node", args: [ownValue], environment: [], cwd: root }
      cases.push(
        executionCase(`${source}/${mode.name}/absent`, capturedScript, {}, null),
        executionCase(`${source}/${mode.name}/own-value`, capturedScript, captureRecord(source, ownValue), output),
        executionCase(`${source}/${mode.name}/own-null`, capturedScript, captureRecord(source, null), null)
      )
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

function malformedRequests(): ReadonlyArray<{ readonly name: string; readonly request: unknown }> {
  const baseline = {
    schema: 1,
    type: "execute_process",
    input: {
      script: {
        names: [],
        captures: [],
        snapshot: [{ type: "literal", value: "node" }],
        command: 1,
        args: [],
        environment: [],
        cwd: 0
      },
      root: "/plugin",
      captures: {}
    }
  }
  const script = baseline.input.script
  return [
    { name: "negative command index", request: { ...baseline, input: { ...baseline.input, script: { ...script, command: -1 } } } },
    { name: "fractional argument index", request: { ...baseline, input: { ...baseline.input, script: { ...script, args: [1.5] } } } },
    { name: "unsafe cwd index", request: { ...baseline, input: { ...baseline.input, script: { ...script, cwd: Number.MAX_SAFE_INTEGER + 1 } } } },
    {
      name: "nested excess snapshot field",
      request: { ...baseline, input: { ...baseline.input, script: { ...script, snapshot: [{ type: "literal", value: "node", unexpected: true }] } } }
    },
    {
      name: "invalid environment name",
      request: { ...baseline, input: { ...baseline.input, captures: { "BAD-NAME": "value" } } }
    },
    {
      name: "invalid package path",
      request: { ...baseline, input: { ...baseline.input, script: { ...script, snapshot: [{ type: "file", path: "mcp/../outside.mjs" }] } } }
    },
    {
      name: "NUL process text",
      request: { ...baseline, input: { ...baseline.input, script: { ...script, snapshot: [{ type: "literal", value: "before\0after" }] } } }
    },
    {
      name: "lone surrogate process text",
      request: { ...baseline, input: { ...baseline.input, script: { ...script, snapshot: [{ type: "literal", value: "\ud800" }] } } }
    },
    {
      name: "invalid capture source name",
      request: { schema: 1, type: "read_process_capture", input: { source: "BAD-NAME", raw: "value", check: "value" } }
    },
    { name: "unknown request variant", request: { ...baseline, type: "read_process_capture_future" } },
    { name: "unsupported schema version", request: { ...baseline, schema: 2 } }
  ]
}

function malformedResponses(): ReadonlyArray<{ readonly name: string; readonly response: unknown }> {
  return [
    {
      name: "unknown response variant",
      response: { schema: 1, type: "future_process_response", output: null }
    },
    {
      name: "top-level excess result field",
      response: { schema: 1, type: "read_process_capture", output: "value", unexpected: true }
    },
    {
      name: "invalid capture result shape",
      response: { schema: 1, type: "read_process_capture", output: { value: "not process text" } }
    },
    {
      name: "nested excess invocation field",
      response: {
        schema: 1,
        type: "execute_process",
        output: { command: "node", args: [], environment: [], cwd: "/plugin", unexpected: true }
      }
    },
    {
      name: "missing invocation environment field",
      response: { schema: 1, type: "execute_process", output: { command: "node", args: [], cwd: "/plugin" } }
    }
  ]
}

const vectors = readVectors()

it("matches all 21 strict authored process runtime vectors against Lean and TypeScript", () => {
  expect(vectors).toHaveLength(21)
  const requests = vectors.map(({ request }) => {
    const encoded: unknown = Schema.encodeSync(ProcessRuntime.OracleRequest)(request)
    return decodeStrict(ProcessRuntime.OracleRequest, encoded)
  })
  const oracle = runOracle(requests)
  expect(oracle).toHaveLength(vectors.length)
  for (const [index, vector] of vectors.entries()) {
    const lean = oracle[index]
    if (lean === undefined) throw new Error(`${vector.name}: Lean response is missing`)
    const actual = evaluate(vector.request)
    expect(equivalentResponse(lean, vector.expected), `${vector.name}: Lean matches the authored output`).toBe(true)
    expect(equivalentResponse(actual, vector.expected), `${vector.name}: TypeScript matches the authored output`).toBe(true)
    expect(equivalentResponse(actual, lean), `${vector.name}: TypeScript matches Lean`).toBe(true)
  }
})

it("matches 24 bounded capture protocol cases against Lean and explicit outputs", () => {
  const cases = generatedCaptureCases()
  expect(cases).toHaveLength(24)
  const oracle = runOracle(cases.map(({ request }) => request))
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const lean = oracle[index]
    if (lean === undefined) throw new Error(`${current.name}: Lean response is missing`)
    const actual = evaluate(current.request)
    expect(equivalentResponse(lean, current.expected), `${current.name}: Lean matches the protocol case`).toBe(true)
    expect(equivalentResponse(actual, current.expected), `${current.name}: TypeScript matches the protocol case`).toBe(true)
  }
})

it("evaluates 28 independently authored valid Script shapes against Lean and explicit outputs", () => {
  const cases = generatedExecutionCases()
  expect(cases).toHaveLength(28)
  const oracle = runOracle(cases.map(({ request }) => request))
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const lean = oracle[index]
    if (lean === undefined) throw new Error(`${current.name}: Lean response is missing`)
    const actual = evaluate(current.request)
    expect(equivalentResponse(lean, current.expected), `${current.name}: Lean matches the authored output`).toBe(true)
    expect(equivalentResponse(actual, current.expected), `${current.name}: TypeScript matches the authored output`).toBe(true)
  }
})

it("strictly rejects malformed requests in Effect and Lean and malformed results in Effect", () => {
  const invalidRequests = malformedRequests()
  expect(invalidRequests).toHaveLength(11)
  for (const current of invalidRequests) {
    expect(() => decodeStrict(ProcessRuntime.OracleRequest, current.request), `${current.name}: Effect rejects`).toThrow()
    expectLeanReject(current.request, current.name)
  }

  const invalidResponses = malformedResponses()
  expect(invalidResponses).toHaveLength(5)
  for (const current of invalidResponses) {
    expect(() => decodeStrict(ProcessRuntime.OracleResponse, current.response), `${current.name}: Effect rejects`).toThrow()
  }
})
