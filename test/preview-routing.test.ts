import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { LocalClient } from "../contracts/Clients.ts"
import { PreviewClient } from "../contracts/Project.ts"
import { Desired, LocalStatus, OracleRequest, OracleResponse, Provider } from "../contracts/PreviewRouting.ts"
import { finishPreview, mayApplyInherited, routePreview } from "../src/project/preview/model.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ request: OracleRequest, response: OracleResponse })

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const evaluate = (request: OracleRequest): OracleResponse => Match.value(request).pipe(
  Match.discriminatorsExhaustive("type")({
    preview_route: ({ input }): OracleResponse => ({ schema: 1, type: "preview_route", output: routePreview(input) }),
    preview_apply: ({ input }): OracleResponse => ({ schema: 1, type: "preview_apply", output: mayApplyInherited(input.provider) }),
    preview_finish: ({ input }): OracleResponse => ({ schema: 1, type: "preview_finish", output: finishPreview(input) })
  })
)

const oracle = (requests: ReadonlyArray<OracleRequest>): ReadonlyArray<OracleResponse> => {
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(Schema.encodeSync(OracleRequest)(request)) + "\n").join(""),
    encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Preview routing oracle failed: ${result.stderr}`)
  expect(result.stderr).toBe("")
  return result.stdout.trimEnd().split("\n").map((line) => decode(OracleResponse, JSON.parse(line)))
}

it("matches independent direct, inherited, refusal and dependency-failure examples", () => {
  const vectors = readFileSync(new URL("../spec/vectors/preview-routing.ndjson", import.meta.url), "utf8")
    .trimEnd().split("\n").map((line) => decode(Vector, JSON.parse(line)))
  expect(vectors).toHaveLength(26)
  const responses = oracle(vectors.map(({ request }) => request))
  expect(responses).toHaveLength(vectors.length)
  vectors.forEach(({ request, response }, index) => {
    expect(responses[index], `example ${index}: Lean`).toEqual(response)
    expect(evaluate(request), `example ${index}: TypeScript`).toEqual(response)
  })
})

it("matches Lean for every routing, provider and completion value without mutating input", () => {
  const requests: OracleRequest[] = []
  for (const client of LocalClient.literals) {
    for (const desired of Desired.literals) {
      for (const provider of Provider.literals) requests.push({ schema: 1, type: "preview_route", input: { client, desired, provider } })
    }
  }
  for (const provider of LocalStatus.literals) requests.push({ schema: 1, type: "preview_apply", input: { provider } })
  for (const status of LocalStatus.literals) requests.push({ schema: 1, type: "preview_finish", input: { type: "direct", status } })
  for (const provider of LocalStatus.literals) {
    for (const local of LocalStatus.literals) requests.push({ schema: 1, type: "preview_finish", input: { type: "inherited", provider, local } })
  }
  expect(requests).toHaveLength(66)
  const responses = oracle(requests)
  expect(responses).toHaveLength(requests.length)
  requests.forEach((request, index) => {
    const before = structuredClone(request)
    const response = evaluate(request)
    expect(response, `finite case ${index}`).toEqual(responses[index])
    expect(decode(OracleResponse, Schema.encodeSync(OracleResponse)(response))).toEqual(response)
    expect(request).toEqual(before)
  })
})

it("rejects malformed requests in both strict decoders and impossible inherited responses", () => {
  const malformed = decode(Schema.Array(Schema.Unknown), JSON.parse(readFileSync(
    new URL("./fixtures/preview-routing-invalid.json", import.meta.url), "utf8"
  )))
  expect(malformed).toHaveLength(30)
  for (const request of malformed) {
    expect(() => decode(OracleRequest, request)).toThrow()
    const result = spawnSync(oraclePath, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
  }
  for (const change of [{ client: "codex" }, { provider: "codex" }, { desired: "present" }]) {
    expect(() => decode(OracleResponse, { schema: 1, type: "preview_route", output: {
      type: "inherited", client: "cursor", provider: "claude_code", desired: "absent", ...change
    } })).toThrow()
  }
})

it("requires the inherited client and its concrete provider in the public result", () => {
  const inherited = { client: "cursor", home: "/profile/.cursor", status: "inherited", provider: { client: "claude_code", home: "/profile/.claude" } }
  expect(decode(PreviewClient, inherited)).toEqual(inherited)
  for (const client of LocalClient.literals) {
    for (const status of LocalStatus.literals) expect(decode(PreviewClient, { client, home: "/profile", status })).toEqual({ client, home: "/profile", status })
  }
  for (const invalid of [
    { ...inherited, client: "codex" },
    { ...inherited, client: "claude_code" },
    { client: "cursor", home: "/profile/.cursor", status: "inherited" },
    { ...inherited, provider: { client: "codex", home: "/profile/.codex" } },
    { ...inherited, provider: { client: "claude_code" } }
  ]) expect(() => decode(PreviewClient, invalid)).toThrow()
})
