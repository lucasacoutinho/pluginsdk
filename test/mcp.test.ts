import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Mcp from "../contracts/Mcp.ts"
import { parseJson } from "../src/internal/json.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ name: Schema.String, properties: Schema.Array(Schema.String), request: Mcp.OracleRequest, expected: Mcp.OracleResponse })
const equivalent = Schema.toEquivalence(Mcp.OracleResponse)
const strict = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
const vectors = readFileSync(new URL("../spec/vectors/mcp.ndjson", import.meta.url), "utf8").split("\n").filter(Boolean).map(
  (line) => strict(Vector, parseJson(line))
)

function compare(requests: ReadonlyArray<Mcp.OracleRequest>): ReadonlyArray<Mcp.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Mcp.OracleRequest)(request))).join("\n") + "\n"
  const result = spawnSync(oraclePath, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean MCP oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split("\n").filter(Boolean).map((line) => strict(Mcp.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing MCP response ${index}`)
    const actual: Mcp.OracleResponse = { schema: 1, type: "render_mcp", output: Mcp.renderMcp(request.input) }
    expect(equivalent(strict(Mcp.OracleResponse, actual), response), `MCP case ${index}`).toBe(true)
  }
  return responses
}

it("K1-K7: matches authored complete MCP documents, launcher files and atomic failures", () => {
  const responses = compare(vectors.map((row) => row.request))
  for (const [index, row] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored MCP response ${index}`)
    expect(equivalent(response, row.expected), row.name).toBe(true)
  }
})

it("matches Lean for remote/local combinations, references, record orders and 11 canonical ordinals", () => {
  const requests: Mcp.OracleRequest[] = []
  const names = ["😀", "\ue000", "Zulu", "alpha", "five", "six", "seven", "eight", "nine", "ten", "eleven"]
  for (const format of ["claude_code_v1", "agent_plugins_v1", "codex_plugin_v1"]) {
    for (const count of [0, 1, 2, 11]) {
      for (const withRemote of [false, true]) {
        for (const withReference of [false, true]) {
          for (const reverse of [false, true]) {
            const locals = names.slice(0, count).map((name) => [name, {
              command: { type: "file", path: "mcp/server'\n雪" },
              args: [{ type: "literal", value: "" }, { type: "literal", value: "literal ${SOURCE}\u2028" }],
              environment: [{ name: "TOKEN", value: withReference ? { type: "environment", name: "SOURCE" } : { type: "literal", value: "" } }],
              cwd: { type: "root" }
            }])
            requests.push(strict(Mcp.OracleRequest, {
              schema: 1, type: "render_mcp", input: {
                format, remote: withRemote ? { remote: { url: "https://app.example/mcp", headers: { "X-Z": "last", "X-A": "first" } } } : {},
                local: Object.fromEntries(reverse ? locals.reverse() : locals)
              }
            }))
          }
        }
      }
    }
  }
  expect(requests).toHaveLength(96)
  compare(requests)
})

it("rejects overlapping names and malformed nested process values at the schema seam", () => {
  const request = vectors.find((row) => row.name === "claude_single_local")?.request
  if (request === undefined) throw new Error("Missing single-local MCP fixture")
  const app = request.input.local.app
  if (app === undefined) throw new Error("Missing app plan")
  for (const input of [
    { ...request.input, remote: { app: { url: "https://app.example/mcp", headers: {} } } },
    { ...request.input, local: { "": app } },
    { ...request.input, local: { "\ud800": app } },
    { ...request.input, local: { app: { ...app, args: [{ type: "literal", value: "a\0b" }] } } },
    { ...request.input, local: { app: { ...app, command: { ...app.command, unexpected: true } } } }
  ]) expect(() => strict(Mcp.OracleRequest, { ...request, input })).toThrow()
})
