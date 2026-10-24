import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as HookBinding from "../contracts/HookBinding.ts"
import { parseJson } from "../src/internal/json.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: HookBinding.OracleRequest,
  expected: HookBinding.OracleResponse
})
const equivalent = Schema.toEquivalence(HookBinding.OracleResponse)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const vectors = readFileSync(new URL("../spec/vectors/hook-binding.ndjson", import.meta.url), "utf8")
  .trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))

function compare(requests: ReadonlyArray<HookBinding.OracleRequest>): ReadonlyArray<HookBinding.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(HookBinding.OracleRequest)(request))).join("\n") + "\n"
  const result = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Hook binding oracle failed: ${result.stderr}`)
  const responses = result.stdout.trimEnd().split("\n").map((line) => decode(HookBinding.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing hook binding response ${index}`)
    const actual = decode(HookBinding.OracleResponse, { schema: 1, type: "bind_hook", output: HookBinding.bindHook(request.input) })
    expect(equivalent(actual, response), `hook binding case ${index}`).toBe(true)
  }
  return responses
}

it("matches all fourteen native-fixture vectors against Lean and TypeScript", () => {
  expect(vectors).toHaveLength(14)
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`${vector.name}: missing authored response`)
    expect(equivalent(response, vector.expected), vector.name).toBe(true)
  }
})

it("matches Lean across decimal and safe-integer ordinal boundaries for both hosts", () => {
  const ordinals = [...Array.from({ length: 21 }, (_, ordinal) => ordinal), 99, 100, 999, 1000,
    Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]
  const hosts: ReadonlyArray<HookBinding.Input["host"]> = ["claude_code", "codex"]
  const requests = hosts.flatMap((host) => ordinals.map((ordinal) => decode(HookBinding.OracleRequest, {
    schema: 1, type: "bind_hook", input: { host, ordinal }
  })))
  expect(requests).toHaveLength(54)
  compare(requests)
})

it("rejects malformed hosts, ordinals and request frames in both decoders", () => {
  const input = { host: "claude_code", ordinal: 0 }
  const frame = { schema: 1, type: "bind_hook", input }
  const inputs: ReadonlyArray<unknown> = [
    ...["unknown_host", null, 0, true, {}, []].map((host) => ({ ...input, host })),
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null, true, {}, []].map((ordinal) => ({ ...input, ordinal })),
    { host: "claude_code" }, { ordinal: 0 },
    { ...input, root: "/package" }, { ...input, args: [] }, { ...input, path: ".psdk/hooks/0.json" }
  ]
  const requests: ReadonlyArray<unknown> = [
    ...inputs.map((input) => ({ ...frame, input })),
    { ...frame, root: "/package" }, { ...frame, args: [] }, { ...frame, path: ".psdk/hooks/0.json" },
    ...[0, 2, true, null, "1"].map((schema) => ({ ...frame, schema })),
    { type: "bind_hook", input }, { schema: 1, input }, { schema: 1, type: "bind_hook" },
    { ...frame, type: "bind_hooks" }
  ]
  expect(requests).toHaveLength(31)
  for (const request of requests) {
    expect(() => decode(HookBinding.OracleRequest, request)).toThrow()
    const result = spawnSync(oracle, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr.startsWith("oracle:")).toBe(true)
  }
})
