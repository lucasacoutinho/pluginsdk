import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { Format } from "../contracts/Compiler.ts"
import { Host } from "../contracts/Installer.ts"
import * as Compatibility from "../contracts/Compatibility.ts"
import { nativeOwnershipCompatible, selectNativeProfile } from "../src/installer/target/compatibility.ts"

type SelectRequest = Extract<Compatibility.OracleRequest, { type: "select_native_profile" }>
type OwnershipRequest = Extract<Compatibility.OracleRequest, { type: "native_ownership_compatible" }>
type CompatibilityCase = { readonly name: string; readonly request: Compatibility.OracleRequest }
type InvalidRequest = { readonly name: string; readonly request: unknown }

const oraclePath = process.env.PLUGINSDK_ORACLE ?? fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPaths = [
  fileURLToPath(new URL("../spec/vectors/compatibility.ndjson", import.meta.url)),
  fileURLToPath(new URL("../spec/vectors/cursor-compatibility.ndjson", import.meta.url))
]
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Compatibility.OracleRequest,
  expected: Compatibility.OracleResponse
})
const equivalentResponse = Schema.toEquivalence(Compatibility.OracleResponse)

function other<A>(values: ReadonlyArray<A>, current: A): A {
  const alternative = values.find((value) => value !== current)
  if (alternative === undefined) throw new Error("Compatibility fixture needs a distinct alternative")
  return alternative
}

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(path: string): ReadonlyArray<typeof Vector.Type> {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const raw: unknown = JSON.parse(line)
    return decode(Vector, raw)
  })
}

function readAllVectors(): ReadonlyArray<typeof Vector.Type> {
  return vectorPaths.flatMap(readVectors)
}

function runOracle(requests: ReadonlyArray<Compatibility.OracleRequest>): ReadonlyArray<Compatibility.OracleResponse> {
  const lines = requests.map((request) => {
    const encoded: unknown = Schema.encodeSync(Compatibility.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("compatibility oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean compatibility oracle exited with status ${String(result.status)}: ${result.stderr}`)
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const raw: unknown = JSON.parse(line)
    return decode(Compatibility.OracleResponse, raw)
  })
}

function evaluate(request: Compatibility.OracleRequest): Compatibility.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    select_native_profile: ({ input }): Compatibility.OracleResponse => ({
      schema: 1,
      type: "select_native_profile",
      output: selectNativeProfile(input)
    }),
    native_ownership_compatible: ({ input }): Compatibility.OracleResponse => ({
      schema: 1,
      type: "native_ownership_compatible",
      output: nativeOwnershipCompatible(input)
    })
  }))
}

function evaluateWithoutMutation(request: Compatibility.OracleRequest): Compatibility.OracleResponse {
  const before = structuredClone(request.input)
  const profiles = request.input.profiles
  const profileReferences = profiles.slice()
  const response = evaluate(request)
  expect(request.input, `${request.type}: input value`).toEqual(before)
  expect(request.input.profiles, `${request.type}: profile list`).toBe(profiles)
  for (const [index, profile] of profiles.entries()) {
    expect(profile, `${request.type}: profile reference ${index}`).toBe(profileReferences[index])
  }
  if (request.type === "select_native_profile" &&
    response.type === "select_native_profile" &&
    response.output.type === "selected") {
    expect(profiles.includes(response.output.profile), "selected profile is retained from the input").toBe(true)
  }
  return response
}

function decodeProfile(input: unknown): Compatibility.NativeProfile {
  return decode(Compatibility.NativeProfile, input)
}

function decodeIdentity(input: unknown): Compatibility.ProfileIdentity {
  return decode(Compatibility.ProfileIdentity, input)
}

function selectionRequest(input: unknown): SelectRequest {
  return { schema: 1, type: "select_native_profile", input: decode(Compatibility.SelectionInput, input) }
}

function ownershipRequest(input: unknown): OwnershipRequest {
  return { schema: 1, type: "native_ownership_compatible", input: decode(Compatibility.OwnershipInput, input) }
}

function addSelectionPermutations(
  cases: Array<CompatibilityCase>,
  name: string,
  request: SelectRequest
): void {
  cases.push({ name, request })
  cases.push({
    name: `${name}_reversed`,
    request: selectionRequest({ ...request.input, profiles: request.input.profiles.toReversed() })
  })
}

function capabilitySubsets(
  capabilities: ReadonlyArray<Compatibility.Capability>
): ReadonlyArray<ReadonlyArray<Compatibility.Capability>> {
  let subsets: Array<ReadonlyArray<Compatibility.Capability>> = [[]]
  for (const capability of capabilities) {
    const previous = subsets.slice()
    for (const subset of previous) subsets.push([...subset, capability])
  }
  return subsets
}

function generatedSelectionCases(): ReadonlyArray<CompatibilityCase> {
  const cases: Array<CompatibilityCase> = []
  const platforms = ["linux", "darwin", "win32"]
  const scopes = Compatibility.Scope.literals
  const capabilities = Compatibility.Capability.literals
  const requirements = capabilitySubsets(capabilities)
  const formatQueries: ReadonlyArray<Format | null> = [null, ...Format.literals]
  const [defaultFormat] = Format.literals
  if (defaultFormat === undefined) throw new Error("Compatibility needs at least one package format")

  for (const host of Host.literals) {
    for (const platform of platforms) {
      for (const scope of scopes) {
        for (const format of formatQueries) {
          for (const required of requirements) {
            const identity = { host, platform, scope, revision: "adapter-1" }
            const query = { host, platform, scope, format, requirements: required }
            const selected = decodeProfile({
              ...identity,
              format: format ?? defaultFormat,
              capabilities
            })
            const ineligible = [
              decodeProfile({ ...identity, host: other(Host.literals, host), format: selected.format, capabilities }),
              decodeProfile({ ...identity, platform: other(platforms, platform), format: selected.format, capabilities }),
              decodeProfile({ ...identity, scope: other(scopes, scope), format: selected.format, capabilities })
            ]
            if (format !== null) {
              ineligible.push(decodeProfile({
                ...identity,
                format: other(Format.literals, format),
                capabilities
              }))
            }
            if (required.length > 0) {
              ineligible.push(decodeProfile({
                ...identity,
                format: selected.format,
                capabilities: capabilities.filter((capability) => !required.includes(capability))
              }))
            }

            const label = `${host}_${platform}_${scope}_${format ?? "any"}_${required.join("-") || "none"}`
            addSelectionPermutations(cases, `unique_${label}`, selectionRequest({ query, profiles: [selected, ...ineligible] }))
            addSelectionPermutations(cases, `duplicate_${label}`, selectionRequest({
              query,
              profiles: [...ineligible, selected, decodeProfile(selected)]
            }))
          }
        }
      }
    }
  }
  return cases
}

function addOwnershipPermutations(
  cases: Array<CompatibilityCase>,
  name: string,
  request: OwnershipRequest
): void {
  cases.push({ name, request })
  cases.push({
    name: `${name}_reversed`,
    request: ownershipRequest({ ...request.input, profiles: request.input.profiles.toReversed() })
  })
}

function generatedOwnershipCases(): ReadonlyArray<CompatibilityCase> {
  const cases: Array<CompatibilityCase> = []
  const platforms = ["linux", "darwin", "win32"]
  const scopes = Compatibility.Scope.literals
  const revisions = ["adapter-1", "adapter-2"]
  const [format] = Format.literals
  if (format === undefined) throw new Error("Compatibility needs at least one package format")

  for (const host of Host.literals) {
    for (const platform of platforms) {
      for (const scope of scopes) {
        for (const revision of revisions) {
          const current = decodeIdentity({ host, platform, scope, revision })
          const currentProfile = decodeProfile({ ...current, format, capabilities: Compatibility.Capability.literals })
          const label = `ownership_${host}_${platform}_${scope}_${revision}`
          addOwnershipPermutations(cases, `${label}_same_identity`, ownershipRequest({
            current,
            retained: current,
            profiles: [currentProfile]
          }))

          const changed = [
            decodeIdentity({ ...current, host: other(Host.literals, host) }),
            decodeIdentity({ ...current, platform: other(platforms, platform) }),
            decodeIdentity({ ...current, scope: other(scopes, scope) }),
            decodeIdentity({ ...current, revision: other(revisions, revision) })
          ]
          for (const [index, retained] of changed.entries()) {
            const retainedProfile = decodeProfile({ ...retained, format, capabilities: Compatibility.Capability.literals })
            addOwnershipPermutations(cases, `${label}_adapter_change_${index}`, ownershipRequest({
              current,
              retained,
              profiles: [currentProfile, retainedProfile]
            }))
          }

          addOwnershipPermutations(cases, `${label}_duplicate_registration`, ownershipRequest({
            current,
            retained: current,
            profiles: [currentProfile, decodeProfile(currentProfile)]
          }))
        }
      }
    }
  }
  return cases
}

function rawSelectionRequest(query: unknown, profiles: unknown): unknown {
  return { schema: 1, type: "select_native_profile", input: { query, profiles } }
}

function oracleRejects(request: unknown, name: string): void {
  const line = JSON.stringify(request)
  if (line === undefined) throw new Error(`${name}: malformed request is not JSON-serializable`)
  const result = spawnSync(oraclePath, [], { input: `${line}\n`, encoding: "utf8", timeout: 10_000 })
  if (result.error !== undefined) throw result.error
  expect(result.status, name).toBe(1)
  expect(result.stdout, name).toBe("")
  expect(result.stderr, name).toContain("oracle:")
}

const vectors = readAllVectors()

it("matches all 64 authored compatibility vectors against expectations, Lean, and TypeScript", () => {
  expect(vectors).toHaveLength(64)
  const properties = new Set(vectors.flatMap(({ properties: vectorProperties }) => vectorProperties))
  for (const property of ["N1", "N2", "N3", "N4", "N5", "N6", "N8", "N9", "N10"]) {
    expect(properties.has(property), `authored vectors cover ${property}`).toBe(true)
  }
  expect(properties.has("N7"), "the retired version property is absent").toBe(false)

  const responses = runOracle(vectors.map(({ request }) => request))
  expect(responses).toHaveLength(vectors.length)
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing compatibility oracle response for ${vector.name}`)
    expect(equivalentResponse(response, vector.expected), `${vector.name}: Lean authored expectation`).toBe(true)
    expect(
      equivalentResponse(evaluateWithoutMutation(vector.request), vector.expected),
      `${vector.name}: TypeScript authored expectation`
    ).toBe(true)
  }
})

it("matches Lean over generated capability, format, adapter, duplicate, and order combinations", () => {
  const cases = [...generatedSelectionCases(), ...generatedOwnershipCases()]
  expect(cases.length).toBeGreaterThan(0)
  const responses = runOracle(cases.map(({ request }) => request))
  expect(responses).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing generated compatibility response for ${current.name}`)
    expect(
      equivalentResponse(evaluateWithoutMutation(current.request), response),
      `${current.name}: TypeScript matches Lean`
    ).toBe(true)
  }
})

it("rejects malformed compatibility inputs in both schema and Lean wire decoding", () => {
  const Fixture = Schema.Struct({ name: Schema.NonEmptyString, request: Schema.Unknown })
  const fixtureInput: unknown = JSON.parse(readFileSync(
    new URL("./fixtures/cursor-compatibility-invalid.json", import.meta.url),
    "utf8"
  ))
  const fixtures = decode(Schema.Array(Fixture), fixtureInput)
  expect(fixtures).toHaveLength(6)

  const validQuery = {
    host: "cursor",
    platform: "win32",
    scope: "user",
    format: "claude_code",
    requirements: ["stdio"]
  }
  const validProfile = {
    host: "cursor",
    platform: "win32",
    scope: "user",
    revision: "cursor-adapter:1",
    format: "claude_code",
    capabilities: ["stdio"]
  }
  const malformed: ReadonlyArray<InvalidRequest> = [
    {
      name: "host_is_not_package_format",
      request: rawSelectionRequest({ ...validQuery, format: "cursor" }, [])
    },
    {
      name: "missing_query_requirements",
      request: rawSelectionRequest({
        host: "cursor", platform: "win32", scope: "user", format: "claude_code"
      }, [])
    },
    {
      name: "missing_profile_capabilities",
      request: rawSelectionRequest(validQuery, [{
        host: "cursor", platform: "win32", scope: "user", revision: "cursor-adapter:1", format: "claude_code"
      }])
    },
    {
      name: "non_array_requirements",
      request: rawSelectionRequest({ ...validQuery, requirements: "stdio" }, [])
    },
    {
      name: "non_array_profile_capabilities",
      request: rawSelectionRequest(validQuery, [{ ...validProfile, capabilities: "stdio" }])
    },
    {
      name: "extra_top_level_field",
      request: { schema: 1, type: "select_native_profile", input: { query: validQuery, profiles: [] }, force: true }
    }
  ]

  for (const { name, request } of [...fixtures, ...malformed]) {
    expect(() => decode(Compatibility.OracleRequest, request), name).toThrow()
    oracleRejects(request, name)
  }
})
