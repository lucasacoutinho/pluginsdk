import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Artifacts from "../contracts/Artifacts.ts"
import * as Catalog from "../contracts/Catalog.ts"
import type { Format as CompilerFormat } from "../contracts/Compiler.ts"
import * as Compatibility from "../contracts/Compatibility.ts"
import * as Distribution from "../contracts/DistributionModel.ts"
import { checkPackages } from "../src/catalog/artifacts/model.ts"
import { register, resolve } from "../src/catalog/model.ts"
import { selectNativeProfile } from "../src/installer/target/compatibility.ts"
import { selectDistributionFormat } from "../src/distribution/selection.ts"

const Request = Schema.Union([
  ...Catalog.OracleRequest.members,
  Artifacts.OracleRequest,
  Distribution.OracleRequest.members[0],
  Compatibility.OracleRequest.members[0]
]).pipe(Schema.toTaggedUnion("type"))
const Response = Schema.Union([
  ...Catalog.OracleResponse.members,
  Artifacts.OracleResponse,
  Distribution.OracleResponse.members[0],
  Compatibility.OracleResponse.members[0]
]).pipe(Schema.toTaggedUnion("type"))

type PortableFormat = Extract<CompilerFormat, "claude_code_portable_v1" | "codex_plugin_portable_v1">
type Case = {
  readonly name: string
  readonly request: typeof Request.Type
  readonly expected: typeof Response.Type
}
type FormatPair = {
  readonly format: PortableFormat
  readonly legacy: CompilerFormat
  readonly host: Distribution.LocalHost
  readonly digest: string
  readonly alternateDigest: string
}

const pairs: ReadonlyArray<FormatPair> = [
  { format: "claude_code_portable_v1", legacy: "claude_code_v5", host: "claude_code", digest: "a".repeat(64), alternateDigest: "b".repeat(64) },
  { format: "codex_plugin_portable_v1", legacy: "codex_plugin_v2", host: "codex", digest: "c".repeat(64), alternateDigest: "d".repeat(64) }
]
const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const equivalentResponse = Schema.toEquivalence(Response)

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function other<A>(values: ReadonlyArray<A>, selected: A, label: string): A {
  const alternative = values.find((value) => value !== selected)
  if (alternative === undefined) throw new Error(`${label} needs a distinct alternative`)
  return alternative
}

function testCase(name: string, request: unknown, expected: unknown): Case {
  return { name, request: decodeStrict(Request, request), expected: decodeStrict(Response, expected) }
}

function releaseFor(pair: FormatPair): Catalog.Release {
  return decodeStrict(Catalog.Release, {
    key: { organization: "format-conformance", integration: `portable-${pair.format}`, release: "1" },
    version: "1.0.0",
    origin: { type: "repository", repository: "example/portable-format-fixture", commit: "a".repeat(40), path: "." },
    contents: { type: "plugin", plugin: "portable-format-fixture", packages: { [pair.format]: pair.digest } }
  })
}

function packageInput(packages: unknown, artifacts: ReadonlyArray<unknown>): Artifacts.PackageSetInput {
  return decodeStrict(Artifacts.PackageSetInput, {
    plugin: "portable-format-fixture", version: "1.0.0", packages, artifacts
  })
}

function descriptor(format: CompilerFormat, digest: string): unknown {
  return { plugin: "portable-format-fixture", format, version: "1.0.0", digest }
}

function profileFor(pair: FormatPair, formats: ReadonlyArray<CompilerFormat>): Compatibility.NativeProfile {
  return decodeStrict(Compatibility.NativeProfile, {
    host: pair.host, platform: "linux-x64", version: "1.2.3", scope: "user", revision: "portable-adapter-v1", formats
  })
}

function cases(): ReadonlyArray<Case> {
  const generated: Array<Case> = []
  for (const pair of pairs) {
    const release = releaseFor(pair)
    const ledger = [release]
    const otherPortable = other(pairs.map(({ format }) => format), pair.format, "portable formats")
    generated.push(
      testCase(`${pair.format}_register`,
        { schema: 1, type: "catalog_register", input: { ledger: [], release } },
        { schema: 1, type: "catalog_register", output: { type: "registered", ledger } }),
      testCase(`${pair.format}_register_unchanged`,
        { schema: 1, type: "catalog_register", input: { ledger, release } },
        { schema: 1, type: "catalog_register", output: { type: "unchanged" } }),
      testCase(`${pair.format}_resolve_present`,
        { schema: 1, type: "catalog_resolve", input: { ledger, key: release.key, target: { type: "plugin", format: pair.format } } },
        {
          schema: 1, type: "catalog_resolve",
          output: {
            type: "resolved", release,
            artifact: { type: "plugin", plugin: "portable-format-fixture", format: pair.format, digest: pair.digest }
          }
        }),
      testCase(`${pair.format}_resolve_other_portable_absent`,
        { schema: 1, type: "catalog_resolve", input: { ledger, key: release.key, target: { type: "plugin", format: otherPortable } } },
        { schema: 1, type: "catalog_resolve", output: { type: "blocked", reason: "format_unavailable" } })
    )

    const exact = descriptor(pair.format, pair.digest)
    const mismatch = descriptor(pair.format, pair.alternateDigest)
    const legacy = descriptor(pair.legacy, pair.alternateDigest)
    const packageCases: ReadonlyArray<{
      readonly name: string
      readonly input: Artifacts.PackageSetInput
      readonly output: unknown
    }> = [
      { name: "accepted", input: packageInput({ [pair.format]: pair.digest }, [exact]), output: { type: "accepted" } },
      { name: "missing", input: packageInput({ [pair.format]: pair.digest }, []), output: { type: "rejected", issues: [{ type: "missing_package", format: pair.format }] } },
      { name: "unexpected", input: packageInput({ [pair.legacy]: pair.alternateDigest }, [legacy, exact]), output: { type: "rejected", issues: [{ type: "unexpected_package", format: pair.format }] } },
      { name: "duplicate", input: packageInput({ [pair.format]: pair.digest }, [exact, exact]), output: { type: "rejected", issues: [{ type: "duplicate_package", format: pair.format }] } },
      { name: "digest_mismatch", input: packageInput({ [pair.format]: pair.digest }, [mismatch]), output: { type: "rejected", issues: [{ type: "digest_mismatch", format: pair.format }] } }
    ]
    for (const current of packageCases) {
      generated.push(testCase(`${pair.format}_package_${current.name}`,
        { schema: 1, type: "check_packages", input: current.input },
        { schema: 1, type: "check_packages", output: current.output }))
    }

    const wrongHost = other(Distribution.LocalHost.literals, pair.host, "distribution hosts")
    generated.push(
      testCase(`${pair.format}_selected_on_native_host`,
        { schema: 1, type: "select_distribution_format", input: { host: pair.host, formats: [pair.format] } },
        { schema: 1, type: "select_distribution_format", output: { type: "selected", format: pair.format } }),
      testCase(`${pair.format}_unavailable_on_other_host`,
        { schema: 1, type: "select_distribution_format", input: { host: wrongHost, formats: [pair.format] } },
        { schema: 1, type: "select_distribution_format", output: { type: "blocked", reason: "unavailable" } }),
      testCase(`${pair.format}_duplicate_is_ambiguous`,
        { schema: 1, type: "select_distribution_format", input: { host: pair.host, formats: [pair.format, pair.format] } },
        { schema: 1, type: "select_distribution_format", output: { type: "blocked", reason: "ambiguous" } }),
      testCase(`${pair.format}_legacy_and_portable_are_ambiguous`,
        { schema: 1, type: "select_distribution_format", input: { host: pair.host, formats: [pair.legacy, pair.format] } },
        { schema: 1, type: "select_distribution_format", output: { type: "blocked", reason: "ambiguous" } })
    )

    const exactProfile = profileFor(pair, [pair.format])
    const legacyProfile = profileFor(pair, [pair.legacy])
    const query = { host: pair.host, platform: "linux-x64", version: "1.2.3", scope: "user", format: pair.format }
    generated.push(
      testCase(`${pair.format}_profile_accepts_exact_format`,
        { schema: 1, type: "select_native_profile", input: { query, profiles: [exactProfile] } },
        { schema: 1, type: "select_native_profile", output: { type: "selected", profile: exactProfile } }),
      testCase(`${pair.format}_profile_without_format_is_unqualified`,
        { schema: 1, type: "select_native_profile", input: { query, profiles: [legacyProfile] } },
        { schema: 1, type: "select_native_profile", output: { type: "blocked", reason: "unqualified" } })
    )
  }
  return generated
}

function evaluate(request: typeof Request.Type): typeof Response.Type {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    catalog_register: ({ input }): typeof Response.Type => ({ schema: 1, type: "catalog_register", output: register(input.ledger, input.release) }),
    catalog_resolve: ({ input }): typeof Response.Type => ({ schema: 1, type: "catalog_resolve", output: resolve(input.ledger, input.key, input.target) }),
    check_packages: ({ input }): typeof Response.Type => ({ schema: 1, type: "check_packages", output: checkPackages(input) }),
    select_distribution_format: ({ input }): typeof Response.Type => ({ schema: 1, type: "select_distribution_format", output: selectDistributionFormat(input) }),
    select_native_profile: ({ input }): typeof Response.Type => ({ schema: 1, type: "select_native_profile", output: selectNativeProfile(input) })
  }))
}

function batchOracle(testCases: ReadonlyArray<Case>): ReadonlyArray<typeof Response.Type> {
  const encode = Schema.encodeSync(Request)
  const lines = testCases.map(({ request }) => {
    const line = JSON.stringify(encode(request))
    if (line === undefined) throw new Error("Portable format oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8", input: `${lines.join("\n")}\n`, maxBuffer: 8 * 1024 * 1024, timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Portable format Lean oracle exited with status ${String(result.status)}: ${result.stderr}`)
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const raw: unknown = JSON.parse(line)
    return decodeStrict(Response, raw)
  })
}

it("matches 30 independent portable-format outcomes in TypeScript and Lean", () => {
  const generated = cases()
  expect(generated).toHaveLength(30)
  const oracle = batchOracle(generated)
  expect(oracle).toHaveLength(generated.length)
  for (const [index, current] of generated.entries()) {
    const lean = oracle[index]
    if (lean === undefined) throw new Error(`Missing Lean response for ${current.name}`)
    expect(equivalentResponse(lean, current.expected), `${current.name}: Lean expectation`).toBe(true)
    expect(equivalentResponse(evaluate(current.request), current.expected), `${current.name}: TypeScript expectation`).toBe(true)
  }
})

it("keeps portable feature formats distinct across catalog, artifacts, distribution and profiles", () => {
  const Vector = Schema.Struct({ name: Schema.NonEmptyString, request: Request, expected: Response })
  const vectors = readFileSync(new URL("../spec/vectors/portable-feature-formats.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeStrict(Vector, JSON.parse(line)))
  expect(vectors).toHaveLength(36)
  const oracle = batchOracle(vectors)
  expect(oracle).toHaveLength(vectors.length)
  for (const [index, current] of vectors.entries()) {
    const lean = oracle[index]
    if (lean === undefined) throw new Error(`Missing Lean response for ${current.name}`)
    expect(equivalentResponse(lean, current.expected), `${current.name}: Lean expectation`).toBe(true)
    expect(equivalentResponse(evaluate(current.request), current.expected), `${current.name}: TypeScript expectation`).toBe(true)
  }
})

it("rejects unknown format versions and invalid v2 digests in both wire decoders", () => {
  const key = { organization: "formats", integration: "app", release: "1" }
  const malformed: ReadonlyArray<unknown> = [
    { schema: 1, type: "catalog_register", input: { ledger: [], release: {
      key, version: "1.0.0", origin: { type: "artifact", location: "fixture", digest: "a".repeat(64) },
      contents: { type: "plugin", plugin: "app", packages: { claude_code_portable_v3: "a".repeat(64) } }
    } } },
    { schema: 1, type: "catalog_resolve", input: { ledger: [], key, target: { type: "plugin", format: "claude_code_portable_v3" } } },
    { schema: 1, type: "check_packages", input: { plugin: "app", version: "1.0.0", packages: { codex_plugin_portable_v2: "invalid" }, artifacts: [] } },
    { schema: 1, type: "select_distribution_format", input: { host: "codex", formats: ["codex_plugin_portable_v3"] } },
    { schema: 1, type: "select_native_profile", input: { query: {
      host: "claude_code", platform: "linux-x64", version: "1.2.3", scope: "user", format: "claude_code_portable_v3"
    }, profiles: [] } }
  ]
  for (const value of malformed) {
    expect(() => decodeStrict(Request, value)).toThrow()
    const result = spawnSync(oraclePath, [], { input: JSON.stringify(value) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr.startsWith("oracle:")).toBe(true)
  }
})
