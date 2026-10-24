import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as PortableHooks from "../contracts/PortableHooks.ts"
import { ProcessPlan } from "../contracts/Process.ts"
import { parseJson } from "../src/internal/json.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: PortableHooks.OracleRequest,
  expected: PortableHooks.OracleResponse
})
const equivalent = Schema.toEquivalence(PortableHooks.OracleResponse)
const hosts: ReadonlyArray<PortableHooks.Input["host"]> = ["claude_code", "codex"]

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const vectors = readFileSync(new URL("../spec/vectors/portable-hooks.ndjson", import.meta.url), "utf8")
  .trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))

function request(input: unknown): PortableHooks.OracleRequest {
  return decode(PortableHooks.OracleRequest, { schema: 1, type: "render_portable_hooks", input })
}

function compare(requests: ReadonlyArray<PortableHooks.OracleRequest>): ReadonlyArray<PortableHooks.OracleResponse> {
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(PortableHooks.OracleRequest)(value))).join("\n") + "\n"
  const result = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Portable hook oracle failed: ${result.stderr}`)
  const responses = result.stdout.trimEnd().split("\n").map((line) => decode(PortableHooks.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, value] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing portable hook response ${index}`)
    const actual = decode(PortableHooks.OracleResponse, {
      schema: 1, type: "render_portable_hooks", output: PortableHooks.renderPortableHooks(value.input)
    })
    expect(equivalent(actual, response), `portable hook request ${index}`).toBe(true)
  }
  return responses
}

const plain = decode(ProcessPlan, {
  command: { type: "literal", value: "node" }, args: [], environment: [], cwd: { type: "root" }
})
const plans: ReadonlyArray<ProcessPlan> = [
  plain,
  decode(ProcessPlan, {
    command: { type: "file", path: "tools/worker.mjs" },
    args: [{ type: "literal", value: "" }, { type: "literal", value: "${HOME} %PATH% & 'quoted'\nλ" },
      { type: "file", path: "assets/work file.txt" }, { type: "root" }],
    environment: [{ name: "TOKEN", value: { type: "literal", value: "literal ${TOKEN} &" } }],
    cwd: { type: "file", path: "work dir" }
  }),
  decode(ProcessPlan, { ...plain, command: { type: "environment", name: "COMMAND" } }),
  decode(ProcessPlan, { ...plain, args: [{ type: "environment", name: "ARG" }] }),
  decode(ProcessPlan, { ...plain, environment: [{ name: "OUT", value: { type: "environment", name: "ENV" } }] }),
  decode(ProcessPlan, { ...plain, cwd: { type: "environment", name: "CWD" } }),
  decode(ProcessPlan, {
    ...plain,
    environment: [{ name: "PATH", value: { type: "literal", value: "a" } },
      { name: "Path", value: { type: "literal", value: "b" } }]
  }),
  decode(ProcessPlan, {
    command: { type: "environment", name: "Z" },
    args: [{ type: "environment", name: "A" }, { type: "environment", name: "Z" }],
    environment: [{ name: "X", value: { type: "environment", name: "A" } },
      { name: "x", value: { type: "environment", name: "Z" } }],
    cwd: { type: "environment", name: "CWD" }
  })
]

it("matches twenty frozen expectations against Lean and TypeScript", () => {
  expect(vectors).toHaveLength(20)
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`${vector.name}: missing authored response`)
    expect(equivalent(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across both events, timeout boundaries, process words, references and collisions", () => {
  const requests = hosts.flatMap((host) => ["SessionStart", "UserPromptSubmit"].flatMap((event) =>
    [1, 60, 600].flatMap((timeout) => plans.map((plan) => request({ host, hooks: { alpha: { event, plan, timeout } } })))
  ))
  expect(requests).toHaveLength(96)
  compare(requests)
})

it("preserves accepted and rejected results across hook-map enumeration", () => {
  const rejected = plans[7]
  if (rejected === undefined) throw new Error("Missing diagnostic plan")
  const hook = { event: "SessionStart", plan: plain, timeout: 60 }
  const maps = [
    [],
    [["𐀀", hook], ["é", hook], ["\uE000", hook], ["2", hook], ["01", hook], ["z", hook]],
    [["z", { ...hook, plan: rejected }], ["a", { ...hook, plan: rejected }]]
  ] satisfies ReadonlyArray<ReadonlyArray<readonly [string, unknown]>>
  const requests = hosts.flatMap((host) => maps.flatMap((entries) => [
    request({ host, hooks: Object.fromEntries(entries) }),
    request({ host, hooks: Object.fromEntries([...entries].reverse()) })
  ]))
  expect(requests).toHaveLength(12)
  const responses = compare(requests)
  for (let index = 0; index < responses.length; index += 2) {
    const original = responses[index]
    const reversed = responses[index + 1]
    if (original === undefined || reversed === undefined) throw new Error(`Missing enumeration pair ${index}`)
    expect(equivalent(original, reversed), `enumeration pair ${index}`).toBe(true)
  }
})

it("rejects malformed frames, hooks and process plans in both strict decoders", () => {
  const hook = { event: "SessionStart", plan: plain, timeout: 60 }
  const frame = request({ host: "claude_code", hooks: { alpha: hook } })
  const hookRequest = (value: unknown) => ({ ...frame, input: { ...frame.input, hooks: { alpha: value } } })
  const malformed: ReadonlyArray<unknown> = [
    ...[0, 2, "1", null, true].map((schema) => ({ ...frame, schema })),
    { ...frame, type: "render_portable_hook" }, { ...frame, extra: true },
    { schema: 1, type: "render_portable_hooks" }, { type: "render_portable_hooks", input: frame.input },
    ...["unknown", null, 0, true, {}, []].map((host) => ({ ...frame, input: { ...frame.input, host } })),
    { ...frame, input: { ...frame.input, extra: true } },
    { ...frame, input: { host: "claude_code" } },
    { ...frame, input: { ...frame.input, hooks: { "": hook } } },
    ...[null, [], true, 0].map((hooks) => ({ ...frame, input: { ...frame.input, hooks } })),
    ...["Setup", "Stop", null, 0].map((event) => hookRequest({ ...hook, event })),
    ...[0, 601, 1.5, "60", null, true].map((timeout) => hookRequest({ ...hook, timeout })),
    hookRequest({ ...hook, extra: true }), hookRequest({ event: "SessionStart", timeout: 60 }),
    hookRequest({ ...hook, plan: { ...plain, extra: true } }),
    hookRequest({ ...hook, plan: { ...plain, command: { type: "external", name: "node" } } }),
    hookRequest({ ...hook, plan: { ...plain, command: { type: "literal", value: "node", extra: true } } }),
    hookRequest({ ...hook, plan: { ...plain, args: [{ type: "file", path: "a/../escape" }] } }),
    hookRequest({ ...hook, plan: { ...plain, args: [{ type: "literal", value: "before\0after" }] } }),
    hookRequest({ ...hook, plan: { ...plain, environment: [{ name: "bad-name", value: { type: "root" } }] } })
  ]
  expect(malformed).toHaveLength(40)
  for (const value of malformed) {
    expect(() => decode(PortableHooks.OracleRequest, value)).toThrow()
    const result = spawnSync(oracle, [], {
      input: JSON.stringify(value) + "\n", encoding: "utf8", timeout: 10_000
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr.startsWith("oracle:")).toBe(true)
  }
})
