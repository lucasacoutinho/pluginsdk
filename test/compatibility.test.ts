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

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/compatibility.ndjson", import.meta.url))
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

function readVectors(path = vectorPath): ReadonlyArray<typeof Vector.Type> {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const raw: unknown = JSON.parse(line)
    return decode(Vector, raw)
  })
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
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
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

function generatedSelectionCases(): ReadonlyArray<CompatibilityCase> {
  const cases: Array<CompatibilityCase> = []
  const platforms = ["linux", "darwin", "win32"]
  const versions = ["2.1.303", "2.1.304"]
  const scopes = Compatibility.Scope.literals

  for (const host of Host.literals) {
    for (const platform of platforms) {
      for (const version of versions) {
        for (const scope of scopes) {
          for (const format of [null, ...Format.literals]) {
            const identity = { host, platform, version, scope, revision: "adapter-1" }
            const query = { host, platform, version, scope, format }
            const formats = format === null ? Format.literals : [format]
            const selected = decodeProfile({ ...identity, formats })
            const ineligible = [
              decodeProfile({ ...identity, host: other(Host.literals, host), formats }),
              decodeProfile({ ...identity, platform: other(platforms, platform), formats }),
              decodeProfile({ ...identity, version: other(versions, version), formats }),
              decodeProfile({ ...identity, scope: other(scopes, scope), formats })
            ]
            if (format !== null) {
              ineligible.push(decodeProfile({ ...identity, formats: [other(Format.literals, format)] }))
            }
            addSelectionPermutations(cases, `query_${host}_${platform}_${version}_${scope}_${format ?? "any"}`, selectionRequest({
              query,
              profiles: [selected, ...ineligible]
            }))
            addSelectionPermutations(cases, `duplicate_${host}_${platform}_${version}_${scope}_${format ?? "any"}`, selectionRequest({
              query,
              profiles: [...ineligible, selected, decodeProfile({ ...identity, formats })]
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
  const formats = [Format.literals[0]]

  for (const host of Host.literals) {
    for (const platform of platforms) {
      for (const scope of scopes) {
        for (const revision of revisions) {
          const current = decodeIdentity({ host, platform, version: "2.1.303", scope, revision })
          const retained = decodeIdentity({ host, platform, version: "2.1.304", scope, revision })
          const currentProfile = decodeProfile({ ...current, formats })
          const retainedProfile = decodeProfile({ ...retained, formats })
          const baseProfiles = [currentProfile, retainedProfile]
          const label = `ownership_${host}_${platform}_${scope}_${revision}`
          addOwnershipPermutations(cases, `${label}_version_change`, ownershipRequest({ current, retained, profiles: baseProfiles }))
          addOwnershipPermutations(cases, `${label}_same_version`, ownershipRequest({
            current,
            retained: current,
            profiles: baseProfiles
          }))

          const changed = [
            decodeIdentity({ ...retained, host: other(Host.literals, host) }),
            decodeIdentity({ ...retained, platform: other(platforms, platform) }),
            decodeIdentity({ ...retained, scope: other(scopes, scope) }),
            decodeIdentity({ ...retained, revision: other(revisions, revision) })
          ]
          for (const [index, changedRetained] of changed.entries()) {
            addOwnershipPermutations(cases, `${label}_adapter_change_${index}`, ownershipRequest({
              current,
              retained: changedRetained,
              profiles: [currentProfile, decodeProfile({ ...changedRetained, formats })]
            }))
          }
          addOwnershipPermutations(cases, `${label}_duplicate_current`, ownershipRequest({
            current,
            retained,
            profiles: [currentProfile, retainedProfile, currentProfile]
          }))
          addOwnershipPermutations(cases, `${label}_duplicate_retained`, ownershipRequest({
            current,
            retained,
            profiles: [currentProfile, retainedProfile, retainedProfile]
          }))
        }
      }
    }
  }
  return cases
}

const vectors = readVectors()

it("matches all 44 authored compatibility vectors against their expectations and Lean", () => {
  expect(vectors).toHaveLength(44)
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

it("matches Lean over bounded selection and ownership combinations, duplicates and row permutations", () => {
  const selectionCases = generatedSelectionCases()
  const ownershipCases = generatedOwnershipCases()
  expect(selectionCases.length).toBeGreaterThan(0)
  expect(ownershipCases.length).toBeGreaterThan(0)
  const cases = [...selectionCases, ...ownershipCases]
  const responses = runOracle(cases.map(({ request }) => request))
  expect(responses).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing generated compatibility oracle response for ${current.name}`)
    expect(
      equivalentResponse(evaluateWithoutMutation(current.request), response),
      `${current.name}: TypeScript matches Lean`
    ).toBe(true)
  }
})

it("preserves Cursor client identity while selecting its compatible package format", () => {
  const cursor = readVectors(fileURLToPath(new URL("../spec/vectors/cursor-compatibility.ndjson", import.meta.url)))
  expect(cursor).toHaveLength(20)
  const responses = runOracle(cursor.map(({ request }) => request))
  expect(responses).toHaveLength(cursor.length)
  for (const [index, vector] of cursor.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Cursor oracle response for ${vector.name}`)
    expect(equivalentResponse(response, vector.expected), `${vector.name}: Lean`).toBe(true)
    expect(equivalentResponse(evaluateWithoutMutation(vector.request), vector.expected), `${vector.name}: TypeScript`).toBe(true)
  }
})

it("rejects malformed Cursor profile requests at both wire boundaries", () => {
  const Fixture = Schema.Struct({ name: Schema.NonEmptyString, request: Schema.Unknown })
  const raw: unknown = JSON.parse(readFileSync(new URL("./fixtures/cursor-compatibility-invalid.json", import.meta.url), "utf8"))
  const fixtures = decode(Schema.Array(Fixture), raw)
  expect(fixtures).toHaveLength(6)
  for (const { name, request } of fixtures) {
    expect(() => decode(Compatibility.OracleRequest, request), name).toThrow()
    const result = spawnSync(oraclePath, [], { input: `${JSON.stringify(request)}\n`, encoding: "utf8", timeout: 10_000 })
    if (result.error !== undefined) throw result.error
    expect(result.status, name).toBe(1)
    expect(result.stdout, name).toBe("")
  }
})
