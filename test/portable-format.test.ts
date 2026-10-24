import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Artifacts from "../contracts/Artifacts.ts"
import * as Catalog from "../contracts/Catalog.ts"
import * as Compatibility from "../contracts/Compatibility.ts"
import * as Compiler from "../contracts/Compiler.ts"
import * as Distribution from "../contracts/DistributionModel.ts"
import { checkPackages } from "../src/catalog/artifacts/model.ts"
import { register, resolve } from "../src/catalog/model.ts"
import { nativeOwnershipCompatible, selectNativeProfile } from "../src/installer/target/compatibility.ts"
import { selectDistributionFormat } from "../src/distribution/selection.ts"

const Request = Schema.Union([
  ...Catalog.OracleRequest.members,
  Artifacts.OracleRequest,
  Distribution.OracleRequest.members[0],
  ...Compatibility.OracleRequest.members
]).pipe(Schema.toTaggedUnion("type"))
const Response = Schema.Union([
  ...Catalog.OracleResponse.members,
  Artifacts.OracleResponse,
  Distribution.OracleResponse.members[0],
  ...Compatibility.OracleResponse.members
]).pipe(Schema.toTaggedUnion("type"))

type Case = {
  readonly name: string
  readonly request: typeof Request.Type
  readonly expected: typeof Response.Type
}
type PackageClient = Compiler.Format

const clients: ReadonlyArray<{ readonly format: PackageClient; readonly other: PackageClient }> = [
  { format: "claude_code", other: "codex" },
  { format: "codex", other: "claude_code" }
]
const oraclePath = process.env.PLUGINSDK_ORACLE ?? fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const equivalentResponse = Schema.toEquivalence(Response)

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function testCase(name: string, request: unknown, expected: unknown): Case {
  return { name, request: decodeStrict(Request, request), expected: decodeStrict(Response, expected) }
}

function readVectors(): ReadonlyArray<Case> {
  const Vector = Schema.Struct({ name: Schema.NonEmptyString, request: Request, expected: Response })
  return readFileSync(new URL("../spec/vectors/portable-feature-formats.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => decodeStrict(Vector, JSON.parse(line)))
}

function formatsIn(request: typeof Request.Type): ReadonlyArray<PackageClient> {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    catalog_register: ({ input }) => input.release.contents.type === "plugin"
      ? decodeStrict(Schema.Array(Compiler.Format), Object.keys(input.release.contents.packages))
      : [],
    catalog_resolve: ({ input }) => input.target.type === "plugin" ? [input.target.format] : [],
    check_packages: ({ input }) => [
      ...decodeStrict(Schema.Array(Compiler.Format), Object.keys(input.packages)),
      ...input.artifacts.map(({ format }) => format)
    ],
    select_distribution_format: ({ input }) => input.formats,
    select_native_profile: ({ input }) => [
      ...(input.query.format === null ? [] : [input.query.format]),
      ...input.profiles.map(({ format }) => format)
    ],
    native_ownership_compatible: ({ input }) => input.profiles.map(({ format }) => format)
  }))
}

function evaluate(request: typeof Request.Type): typeof Response.Type {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    catalog_register: ({ input }): typeof Response.Type => ({ schema: 1, type: "catalog_register", output: register(input.ledger, input.release) }),
    catalog_resolve: ({ input }): typeof Response.Type => ({ schema: 1, type: "catalog_resolve", output: resolve(input.ledger, input.key, input.target) }),
    check_packages: ({ input }): typeof Response.Type => ({ schema: 1, type: "check_packages", output: checkPackages(input) }),
    select_distribution_format: ({ input }): typeof Response.Type => ({ schema: 1, type: "select_distribution_format", output: selectDistributionFormat(input) }),
    select_native_profile: ({ input }): typeof Response.Type => ({ schema: 1, type: "select_native_profile", output: selectNativeProfile(input) }),
    native_ownership_compatible: ({ input }): typeof Response.Type => ({ schema: 1, type: "native_ownership_compatible", output: nativeOwnershipCompatible(input) })
  }))
}

function batchOracle(testCases: ReadonlyArray<Case>): ReadonlyArray<typeof Response.Type> {
  const encode = Schema.encodeSync(Request)
  const lines = testCases.map(({ request }) => {
    const line = JSON.stringify(encode(request))
    if (line === undefined) throw new Error("Package binding oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8", input: `${lines.join("\n")}\n`, maxBuffer: 8 * 1024 * 1024, timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Package binding Lean oracle exited with status ${String(result.status)}: ${result.stderr}`)
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const raw: unknown = JSON.parse(line)
    return decodeStrict(Response, raw)
  })
}

function currentCompatibilityCases(): ReadonlyArray<Case> {
  const cases: Array<Case> = []
  for (const client of clients) {
    const identity = {
      host: client.format,
      platform: "linux-x64",
      scope: "user",
      revision: `adapter-${client.format}`
    }
    const profile = decodeStrict(Compatibility.NativeProfile, {
      ...identity,
      format: client.format,
      capabilities: ["stdio", "hooks"]
    })
    const query = {
      host: identity.host,
      platform: identity.platform,
      scope: identity.scope,
      format: client.format,
      requirements: ["stdio"]
    }
    cases.push(
      testCase(`${client.format}_selects_required_profile`,
        { schema: 1, type: "select_native_profile", input: { query, profiles: [profile] } },
        { schema: 1, type: "select_native_profile", output: { type: "selected", profile } }),
      testCase(`${client.format}_rejects_missing_capability`,
        { schema: 1, type: "select_native_profile", input: {
          query,
          profiles: [decodeStrict(Compatibility.NativeProfile, { ...profile, capabilities: ["hooks"] })]
        } },
        { schema: 1, type: "select_native_profile", output: { type: "blocked", reason: "unqualified" } }),
      testCase(`${client.format}_rejects_cross_client_profile`,
        { schema: 1, type: "select_native_profile", input: {
          query,
          profiles: [decodeStrict(Compatibility.NativeProfile, { ...profile, host: client.other })]
        } },
        { schema: 1, type: "select_native_profile", output: { type: "blocked", reason: "unqualified" } }),
      testCase(`${client.format}_ambiguous_duplicate_profiles`,
        { schema: 1, type: "select_native_profile", input: { query, profiles: [profile, profile] } },
        { schema: 1, type: "select_native_profile", output: { type: "blocked", reason: "ambiguous" } }),
      testCase(`${client.format}_ownership_requires_unique_registration`,
        { schema: 1, type: "native_ownership_compatible", input: {
          current: identity,
          retained: identity,
          profiles: [profile, profile]
        } },
        { schema: 1, type: "native_ownership_compatible", output: false })
    )
  }
  return cases
}

function compareCases(testCases: ReadonlyArray<Case>, label: string): void {
  const oracle = batchOracle(testCases)
  expect(oracle, `${label}: Lean response count`).toHaveLength(testCases.length)
  for (const [index, current] of testCases.entries()) {
    const lean = oracle[index]
    if (lean === undefined) throw new Error(`Missing Lean response for ${current.name}`)
    expect(equivalentResponse(lean, current.expected), `${current.name}: Lean expectation`).toBe(true)
    expect(equivalentResponse(evaluate(current.request), current.expected), `${current.name}: TypeScript expectation`).toBe(true)
  }
}

const vectors = readVectors()

it("matches every portable package binding vector against expectations, Lean, and TypeScript", () => {
  compareCases(vectors, "portable package binding vectors")
  const formats = new Set(vectors.flatMap(({ request }) => formatsIn(request)))
  expect(formats, "vectors exercise both current package clients").toEqual(new Set(Compiler.Format.literals))
})

it("matches Claude and Codex selection, capability, target, and ambiguity cases", () => {
  const cases = currentCompatibilityCases()
  expect(cases.length).toBeGreaterThan(0)
  compareCases(cases, "current compatibility cases")
})
