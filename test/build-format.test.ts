import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as BuildFormat from "../contracts/BuildFormat.ts"
import { selectBuildFormat } from "../src/project/build-format.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectors = fileURLToPath(new URL("../spec/vectors/build-format.ndjson", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: BuildFormat.OracleRequest,
  expected: BuildFormat.OracleResponse
})

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

it("matches the complete sixteen-case feature matrix against Lean and TypeScript", () => {
  const cases = readFileSync(vectors, "utf8").trimEnd().split("\n").map((line) => decode(Vector, JSON.parse(line)))
  expect(cases).toHaveLength(16)
  const expectedInputs = new Set<string>()
  for (const client of ["claude_code", "codex"]) {
    for (const hasAgents of [false, true]) {
      for (const hasHooks of [false, true]) {
        for (const hasStdio of [false, true]) expectedInputs.add(JSON.stringify({ client, hasAgents, hasHooks, hasStdio }))
      }
    }
  }
  expect(new Set(cases.map(({ request }) => JSON.stringify(request.input)))).toEqual(expectedInputs)
  const input = cases.map(({ request }) => JSON.stringify(Schema.encodeSync(BuildFormat.OracleRequest)(request))).join("\n") + "\n"
  const result = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Build format oracle failed: ${result.stderr}`)
  const replies = result.stdout.trimEnd().split("\n").map((line) => decode(BuildFormat.OracleResponse, JSON.parse(line)))
  expect(replies).toHaveLength(cases.length)
  cases.forEach(({ name, request, expected }, index) => {
    expect(replies[index], `${name}: Lean`).toEqual(expected)
    expect(selectBuildFormat(request.input), `${name}: TypeScript`).toBe(expected.output)
  })
})

it("refuses malformed clients, feature facts and request frames in both decoders", () => {
  const base = { client: "claude_code", hasAgents: false, hasHooks: false, hasStdio: true }
  const inputs: unknown[] = [
    ...["cursor", "grok_bot", "muse", "darwin", null, 0, true].map((client) => ({ ...base, client })),
    ...["hasAgents", "hasHooks", "hasStdio"].flatMap((field) =>
      [0, 1, "true", null, {}, []].map((value) => ({ ...base, [field]: value }))),
    { ...base, scope: "user" }, { ...base, format: "claude_code_portable_v1" },
    { client: "claude_code", hasHooks: false, hasStdio: true },
    { client: "claude_code", hasAgents: false, hasStdio: true },
    { client: "claude_code", hasAgents: false, hasHooks: false }
  ]
  const requests: unknown[] = inputs.map((input) => ({ schema: 1, type: "select_build_format", input }))
  requests.push(...[0, 2, true, null].map((schema) => ({ schema, type: "select_build_format", input: base })))
  expect(requests).toHaveLength(34)
  for (const request of requests) {
    expect(() => decode(BuildFormat.OracleRequest, request)).toThrow()
    const result = spawnSync(oracle, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
  }
})
