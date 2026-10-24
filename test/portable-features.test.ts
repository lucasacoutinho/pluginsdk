import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as PortableFeatures from "../contracts/PortableFeatures.ts"
import { ProcessPlan } from "../contracts/Process.ts"
import { parseJson } from "../src/internal/json.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: PortableFeatures.OracleRequest,
  expected: PortableFeatures.OracleResponse
})
const equivalent = Schema.toEquivalence(PortableFeatures.OracleResponse)
const formats: ReadonlyArray<PortableFeatures.Input["mcp"]["format"]> = [
  "claude_code_v1", "codex_plugin_v1", "agent_plugins_v1"
]

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const vectors = readFileSync(new URL("../spec/vectors/portable-features.ndjson", import.meta.url), "utf8")
  .trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))

function request(input: unknown): PortableFeatures.OracleRequest {
  return decode(PortableFeatures.OracleRequest, { schema: 1, type: "render_portable_features", input })
}

function compare(requests: ReadonlyArray<PortableFeatures.OracleRequest>): ReadonlyArray<PortableFeatures.OracleResponse> {
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(PortableFeatures.OracleRequest)(value))).join("\n") + "\n"
  const result = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Portable composition oracle failed: ${result.stderr}`)
  const responses = result.stdout.trimEnd().split("\n").map((line) => decode(PortableFeatures.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, value] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing portable composition response ${index}`)
    const actual = decode(PortableFeatures.OracleResponse, {
      schema: 1, type: "render_portable_features", output: PortableFeatures.renderPortableFeatures(value.input)
    })
    expect(equivalent(actual, response), `portable composition request ${index}`).toBe(true)
  }
  return responses
}

const literal = decode(ProcessPlan, {
  command: { type: "literal", value: "node" },
  args: [{ type: "literal", value: "${HOME} %PATH% & 'quoted'\nλ" }, { type: "file", path: "tools/worker.mjs" }],
  environment: [{ name: "TOKEN", value: { type: "literal", value: "literal ${TOKEN} &" } }],
  cwd: { type: "file", path: "work dir" }
})
const captured = decode(ProcessPlan, {
  ...literal,
  args: [{ type: "environment", name: "SRC" }, { type: "environment", name: "SRC" }],
  environment: [{ name: "TOKEN", value: { type: "environment", name: "SRC" } }]
})
const collision = decode(ProcessPlan, {
  ...literal,
  environment: [{ name: "PATH", value: { type: "literal", value: "first" } },
    { name: "Path", value: { type: "literal", value: "second" } }]
})
const hook = { event: "SessionStart", plan: literal, timeout: 60 }
const locals: ReadonlyArray<ReadonlyArray<readonly [string, ProcessPlan]>> = [
  [], [["app", literal]], [["z", literal], ["2", literal], ["𐀀", literal]],
  [["app", captured]], [["z", collision], ["app", collision]]
]
const hooks: ReadonlyArray<ReadonlyArray<readonly [string, unknown]>> = [
  [], [["app", hook], ["prompt", { ...hook, event: "UserPromptSubmit" }]],
  [["app", { ...hook, plan: captured }]],
  [["z", { ...hook, plan: collision }], ["app", { ...hook, plan: captured }], ["ok", hook]]
]

it("preserves twenty-seven frozen complete-component expectations", () => {
  expect(vectors).toHaveLength(27)
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`${vector.name}: missing authored response`)
    expect(equivalent(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms for empty, remote, local, captured, colliding and mixed hook inputs in all formats", () => {
  const requests = formats.flatMap((format) => [false, true].flatMap((withRemote) =>
    locals.flatMap((local) => hooks.map((hookEntries) => request({
      mcp: { format, remote: withRemote ? { crm: { url: "https://crm.example/mcp", headers: {} } } : {},
        local: Object.fromEntries(local) },
      hooks: Object.fromEntries(hookEntries)
    })))
  ))
  expect(requests).toHaveLength(120)
  compare(requests)
})

it("preserves composition across MCP, header and hook enumeration changes", () => {
  const requests = formats.flatMap((format) => [literal, collision].flatMap((plan) => [false, true].map((reverse) => {
    const headers = [["X-Z", "last"], ["X-A", "first"]]
    const remote = [["crm", { url: "https://crm.example/mcp", headers: Object.fromEntries(reverse ? [...headers].reverse() : headers) }],
      ["telemetry", { url: "https://telemetry.example/mcp", headers: {} }]]
    const local: ReadonlyArray<readonly [string, ProcessPlan]> = [["z", plan], ["2", plan], ["𐀀", plan]]
    const hookEntries = [["𐀀", { ...hook, plan }], ["\uE000", { ...hook, plan }], ["01", { ...hook, plan }]]
    return request({
      mcp: { format, remote: Object.fromEntries(reverse ? [...remote].reverse() : remote),
        local: Object.fromEntries(reverse ? [...local].reverse() : local) },
      hooks: Object.fromEntries(reverse ? [...hookEntries].reverse() : hookEntries)
    })
  })))
  expect(requests).toHaveLength(12)
  const responses = compare(requests)
  for (let index = 0; index < responses.length; index += 2) {
    const original = responses[index]
    const reversed = responses[index + 1]
    if (original === undefined || reversed === undefined) throw new Error(`Missing composition pair ${index}`)
    expect(equivalent(original, reversed), `composition enumeration pair ${index}`).toBe(true)
  }
})

it("rejects malformed frames, nested schemas and contradictory host input in both decoders", () => {
  const frame = request({ mcp: { format: "codex_plugin_v1", remote: {}, local: { app: literal } }, hooks: { app: hook } })
  const input = frame.input
  const malformed: ReadonlyArray<unknown> = [
    ...[0, 2, "1", true, null].map((schema) => ({ ...frame, schema })),
    { ...frame, type: "render_portable_feature" }, { ...frame, extra: true },
    { schema: 1, type: "render_portable_features" }, { type: "render_portable_features", input },
    ...["claude_code", "codex", null].map((host) => ({ ...frame, input: { ...input, host } })),
    { ...frame, input: { ...input, mcp: { ...input.mcp, host: "claude_code" } } },
    { ...frame, input: { hooks: input.hooks } }, { ...frame, input: { mcp: input.mcp } },
    { ...frame, input: { ...input, extra: true } },
    { ...frame, input: { ...input, mcp: { ...input.mcp, format: "future" } } },
    { ...frame, input: { ...input, mcp: { ...input.mcp, extra: true } } },
    { ...frame, input: { ...input, mcp: { ...input.mcp, remote: { app: { url: "https://app.example/mcp", headers: {} } } } } },
    { ...frame, input: { ...input, mcp: { ...input.mcp, local: { app: { ...literal, extra: true } } } } },
    { ...frame, input: { ...input, mcp: { ...input.mcp, local: { app: { ...literal, args: [{ type: "file", path: "../escape" }] } } } } },
    ...[null, [], 0].map((hooks) => ({ ...frame, input: { ...input, hooks } })),
    { ...frame, input: { ...input, hooks: { "": hook } } },
    { ...frame, input: { ...input, hooks: { app: { ...hook, host: "claude_code" } } } },
    { ...frame, input: { ...input, hooks: { app: { ...hook, event: "Setup" } } } },
    ...[0, 601, 1.5, null].map((timeout) => ({ ...frame, input: { ...input, hooks: { app: { ...hook, timeout } } } })),
    { ...frame, input: { ...input, hooks: { app: { ...hook, plan: { ...literal, extra: true } } } } }
  ]
  expect(malformed).toHaveLength(32)
  for (const value of malformed) {
    expect(() => decode(PortableFeatures.OracleRequest, value)).toThrow()
    const result = spawnSync(oracle, [], { input: JSON.stringify(value) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr.startsWith("oracle:")).toBe(true)
  }
})

it("rejects mismatched diagnostic subjects and partial results at the response boundary", () => {
  const reason = { type: "environment_collision", name: "path" }
  const outputs: ReadonlyArray<unknown> = [
    { type: "rejected", issues: [] },
    { type: "rejected", issues: [{ type: "mcp", issue: { hook: "app", reason } }] },
    { type: "rejected", issues: [{ type: "hook", issue: { server: "app", reason } }] },
    { type: "rejected", issues: [{ type: "mcp", issue: { server: "app", reason } }], files: [] },
    { type: "rendered", mcpDocument: null, files: [] }
  ]
  for (const output of outputs) {
    expect(() => decode(PortableFeatures.OracleResponse, { schema: 1, type: "render_portable_features", output })).toThrow()
  }
})
