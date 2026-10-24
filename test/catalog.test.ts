import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Catalog from "../contracts/Catalog.ts"
import { Format } from "../contracts/Compiler.ts"
import { register, resolve } from "../src/catalog/model.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/catalog.ndjson", import.meta.url))
const Fixture = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.String),
  request: Catalog.OracleRequest,
  expected: Catalog.OracleResponse
})
const equivalentResponse = Schema.toEquivalence(Catalog.OracleResponse)
const equivalentRelease = Schema.toEquivalence(Catalog.Release)

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const vectors = readFileSync(vectorPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
  const value: unknown = JSON.parse(line)
  return decodeStrict(Fixture, value)
})

function fixtureRelease(name: string): Catalog.Release {
  const row = vectors.find((current) => current.name === name)
  if (row?.request.type !== "catalog_register") throw new Error(`Missing registration fixture: ${name}`)
  return row.request.input.release
}

const plugin = fixtureRelease("first_plugin_release")
const mcp = fixtureRelease("second_application_contract")

function evaluate(request: Catalog.OracleRequest): Catalog.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    catalog_register: ({ input }): Catalog.OracleResponse => ({ schema: 1, type: "catalog_register", output: register(input.ledger, input.release) }),
    catalog_resolve: ({ input }): Catalog.OracleResponse => ({ schema: 1, type: "catalog_resolve", output: resolve(input.ledger, input.key, input.target) })
  }))
}

function compareWithOracle(requests: ReadonlyArray<Catalog.OracleRequest>): ReadonlyArray<Catalog.OracleResponse> {
  const encoded = requests.map((request) => JSON.stringify(Schema.encodeSync(Catalog.OracleRequest)(request)))
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8", input: encoded.join("\n") + "\n", timeout: 30_000, maxBuffer: 24 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean catalog oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const value: unknown = JSON.parse(line)
    return decodeStrict(Catalog.OracleResponse, value)
  })
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Catalog response ${index} is missing`)
    expect(equivalentResponse(evaluate(request), response), `request ${index}`).toBe(true)
  }
  return responses
}

it("C1-C6: agrees with independent immutable release and exact selection vectors", () => {
  const responses = compareWithOracle(vectors.map((row) => row.request))
  for (const [index, row] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Catalog vector ${index} is missing`)
    expect(equivalentResponse(response, row.expected), row.name).toBe(true)
  }
})

it("conforms across tenant, integration, release, kind and format combinations", () => {
  const requests: Array<Catalog.OracleRequest> = []
  const targets: ReadonlyArray<Catalog.ReleaseTarget> = [...Format.literals.map((format): Catalog.ReleaseTarget => ({ type: "plugin", format })), { type: "mcp" }]
  for (const organization of ["acme", "another-company"]) {
    for (const integration of ["tickets", "payroll"]) {
      for (const release of ["release-17", "1.0.0"]) {
        const key = decodeStrict(Catalog.ReleaseKey, { organization, integration, release })
        for (const ledger of [[], [plugin, mcp], [mcp, plugin]]) {
          requests.push({ schema: 1, type: "catalog_register", input: { ledger, release: { ...plugin, key } } })
          for (const target of targets) requests.push({ schema: 1, type: "catalog_resolve", input: { ledger, key, target } })
        }
      }
    }
  }
  compareWithOracle(requests)
})

it("keeps an approved release unchanged when another release is promoted", () => {
  const first = register([], plugin)
  if (first.type !== "registered") throw new Error("First release was not registered")
  expect(register(first.ledger, plugin)).toEqual({ type: "unchanged" })
  const changed: Catalog.Release = { ...plugin, origin: mcp.origin }
  expect(register(first.ledger, changed)).toEqual({ type: "conflict" })
  const next: Catalog.Release = { ...changed, key: { ...changed.key, release: Catalog.ReleaseId.make("release-18") } }
  const promoted = register(first.ledger, next)
  if (promoted.type !== "registered") throw new Error("New release identity was not registered")
  expect(promoted.ledger).toHaveLength(2)
  const formats: ReadonlyArray<Format> = ["claude_code_v2", "agent_plugins_v2"]
  for (const release of [plugin, next]) {
    for (const format of formats) {
      const selected = resolve(promoted.ledger, release.key, { type: "plugin", format })
      if (selected.type !== "resolved") throw new Error("Approved release did not resolve")
      expect(equivalentRelease(selected.release, release)).toBe(true)
    }
  }
  const stored = first.ledger[0]
  if (stored === undefined) throw new Error("Original release disappeared")
  expect(equivalentRelease(stored, plugin)).toBe(true)
})

it("gives no precedence to ledger or package field enumeration order", () => {
  for (const row of vectors) {
    if (row.request.type !== "catalog_resolve") continue
    const { input } = row.request
    const reordered: Catalog.ReleaseLedger = input.ledger.map((release) => {
      if (release.contents.type !== "plugin") return release
      return decodeStrict(Catalog.Release, {
        ...release,
        contents: { ...release.contents, packages: Object.fromEntries(Object.entries(release.contents.packages).reverse()) }
      })
    }).reverse()
    expect(equivalentResponse(
      evaluate({ ...row.request, input: { ...input, ledger: reordered } }), evaluate(row.request)
    ), row.name).toBe(true)
  }
  if (plugin.contents.type !== "plugin") throw new Error("Plugin fixture has wrong kind")
  const reordered = decodeStrict(Catalog.Release, {
    ...plugin,
    contents: { ...plugin.contents, packages: Object.fromEntries(Object.entries(plugin.contents.packages).reverse()) }
  })
  expect(register([plugin], reordered)).toEqual({ type: "unchanged" })
})

it("rejects incomplete or ambiguous release declarations at the schema seam", () => {
  const invalid: ReadonlyArray<unknown> = [
    { ...plugin, unexpected: true },
    { ...plugin, key: { ...plugin.key, organization: "" } },
    { ...plugin, origin: { type: "repository", repository: "repo", commit: "main", path: "." } },
    { ...plugin, origin: { type: "repository", repository: "repo", commit: "a".repeat(40), path: "../plugin" } },
    { ...plugin, origin: { type: "artifact", location: "registry:17", digest: "A".repeat(64) } },
    { ...plugin, contents: { type: "plugin", plugin: "tickets", packages: {} } },
    { ...plugin, contents: { type: "plugin", plugin: "tickets", packages: { another_format: "a".repeat(64) } } },
    { ...plugin, contents: { type: "plugin", plugin: "tickets", packages: { claude_code_v2: "invalid" } } },
    { ...plugin, contents: { type: "mcp", service: "payroll", contract: "c".repeat(64), url: "https://payroll.example/mcp" } }
  ]
  for (const release of invalid) expect(() => decodeStrict(Catalog.Release, release)).toThrow()
  expect(() => decodeStrict(Catalog.ReleaseLedger, undefined)).toThrow()
  expect(() => decodeStrict(Catalog.ReleaseTarget, { type: "plugin", format: "cursor" })).toThrow()
})
