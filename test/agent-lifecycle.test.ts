import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Artifacts from "../contracts/Artifacts.ts"
import * as Catalog from "../contracts/Catalog.ts"
import * as Compatibility from "../contracts/Compatibility.ts"
import * as Compiler from "../contracts/Compiler.ts"
import * as DistributionModel from "../contracts/DistributionModel.ts"
import * as Repair from "../contracts/Repair.ts"
import { parseJson } from "../src/internal/json.ts"
import { checkPackages } from "../src/catalog/artifacts/model.ts"
import { register, resolve } from "../src/catalog/model.ts"
import { nativeOwnershipCompatible, selectNativeProfile } from "../src/installer/target/compatibility.ts"
import { selectDistributionFormat } from "../src/distribution/selection.ts"
import { beginRepair, propose, settleRepair } from "../src/installer/recovery/model.ts"

const oraclePath = process.env.PLUGINSDK_ORACLE ?? fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const DistributionRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("select_distribution_format"),
  input: DistributionModel.SelectionInput
})
const DistributionResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("select_distribution_format"),
  output: DistributionModel.Selection
})
const Request = Schema.Union([
  ...Catalog.OracleRequest.members,
  Artifacts.OracleRequest,
  DistributionRequest,
  ...Compatibility.OracleRequest.members,
  ...Repair.OracleRequest.members
]).pipe(Schema.toTaggedUnion("type"))
const Response = Schema.Union([
  ...Catalog.OracleResponse.members,
  Artifacts.OracleResponse,
  DistributionResponse,
  ...Compatibility.OracleResponse.members,
  ...Repair.OracleResponse.members
]).pipe(Schema.toTaggedUnion("type"))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Request,
  expected: Response
})
const equivalentResponse = Schema.toEquivalence(Response)

type OracleRequest = typeof Request.Type
type OracleResponse = typeof Response.Type
type Case = {
  readonly name: string
  readonly request: OracleRequest
  readonly expected: OracleResponse
}

const clients: ReadonlyArray<{ readonly format: Compiler.Format; readonly other: Compiler.Format }> = [
  { format: "claude_code", other: "codex" },
  { format: "codex", other: "claude_code" }
]

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(path: string): ReadonlyArray<typeof Vector.Type> {
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => decode(Vector, parseJson(line)))
}

function request(input: unknown): OracleRequest {
  return decode(Request, input)
}

function evaluate(input: OracleRequest): OracleResponse {
  return Match.value(input).pipe(Match.discriminatorsExhaustive("type")({
    catalog_register: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "catalog_register",
      output: register(value.ledger, value.release)
    }),
    catalog_resolve: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "catalog_resolve",
      output: resolve(value.ledger, value.key, value.target)
    }),
    check_packages: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "check_packages",
      output: checkPackages(value)
    }),
    select_distribution_format: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "select_distribution_format",
      output: selectDistributionFormat(value)
    }),
    select_native_profile: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "select_native_profile",
      output: selectNativeProfile(value)
    }),
    native_ownership_compatible: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "native_ownership_compatible",
      output: nativeOwnershipCompatible(value)
    }),
    repair_propose: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "repair_propose",
      output: propose(value)
    }),
    repair_begin: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "repair_begin",
      output: beginRepair(value)
    }),
    repair_settle: ({ input: value }): OracleResponse => ({
      schema: 1,
      type: "repair_settle",
      output: settleRepair(value)
    })
  }))
}

function evaluateWithoutMutation(input: OracleRequest): OracleResponse {
  const before = structuredClone(input)
  const response = evaluate(input)
  expect(input, `${input.type}: input value`).toEqual(before)
  return decode(Response, response)
}

function compare(cases: ReadonlyArray<Case>, label: string): ReadonlyArray<OracleResponse> {
  const lines = cases.map(({ request: oracleRequest }) => {
    const encoded: unknown = Schema.encodeSync(Request)(oracleRequest)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("Lifecycle oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Lean lifecycle oracle exited with status ${String(result.status)}: ${result.stderr}`)
  }
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    return decode(Response, parseJson(line))
  })
  expect(responses, `${label}: Lean response count`).toHaveLength(cases.length)

  for (const [index, current] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing lifecycle oracle response for ${current.name}`)
    expect(equivalentResponse(response, current.expected), `${current.name}: Lean expectation`).toBe(true)
    expect(
      equivalentResponse(evaluateWithoutMutation(current.request), current.expected),
      `${current.name}: TypeScript expectation`
    ).toBe(true)
  }
  return responses
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
    const profile = decode(Compatibility.NativeProfile, {
      ...identity,
      format: client.format,
      capabilities: ["stdio", "hooks"]
    })
    const query = {
      host: client.format,
      platform: identity.platform,
      scope: identity.scope,
      format: client.format,
      requirements: ["stdio"]
    }
    const selected = {
      schema: 1,
      type: "select_native_profile",
      output: { type: "selected", profile }
    }
    const unqualified = {
      schema: 1,
      type: "select_native_profile",
      output: { type: "blocked", reason: "unqualified" }
    }
    const ambiguous = {
      schema: 1,
      type: "select_native_profile",
      output: { type: "blocked", reason: "ambiguous" }
    }
    cases.push(
      {
        name: `${client.format}_required_capability_selected`,
        request: request({ schema: 1, type: "select_native_profile", input: { query, profiles: [profile] } }),
        expected: decode(Response, { ...selected, schema: 1 })
      },
      {
        name: `${client.format}_missing_required_capability_blocked`,
        request: request({ schema: 1, type: "select_native_profile", input: {
          query,
          profiles: [decode(Compatibility.NativeProfile, { ...profile, capabilities: ["hooks"] })]
        } }),
        expected: decode(Response, { ...unqualified, schema: 1 })
      },
      {
        name: `${client.format}_cross_client_profile_blocked`,
        request: request({ schema: 1, type: "select_native_profile", input: {
          query,
          profiles: [decode(Compatibility.NativeProfile, { ...profile, host: client.other })]
        } }),
        expected: decode(Response, { ...unqualified, schema: 1 })
      },
      {
        name: `${client.format}_duplicate_profile_ambiguous`,
        request: request({ schema: 1, type: "select_native_profile", input: { query, profiles: [profile, profile] } }),
        expected: decode(Response, { ...ambiguous, schema: 1 })
      }
    )
  }
  return cases
}

function clientBindings(value: unknown, found = new Set<Compiler.Format>()): ReadonlySet<Compiler.Format> {
  if (typeof value === "string") {
    if (value === "claude_code" || value === "codex") found.add(value)
    return found
  }
  if (Array.isArray(value)) {
    for (const item of value) clientBindings(item, found)
    return found
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) clientBindings(item, found)
  }
  return found
}

const lifecycleVectors = readVectors("../spec/vectors/agent-lifecycle.ndjson")
const repairVectors = readVectors("../spec/vectors/repair.ndjson")

it("matches every authored lifecycle and repair vector against expectations, Lean, and TypeScript", () => {
  const vectors = [...lifecycleVectors, ...repairVectors]
  const cases = vectors.map(({ name, request: vectorRequest, expected }) => ({
    name,
    request: vectorRequest,
    expected
  }))
  compare(cases, "authored lifecycle vectors")

  const properties = new Set(vectors.flatMap(({ properties: vectorProperties }) => vectorProperties))
  for (const property of ["N1", "N2", "N3", "N4", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]) {
    expect(properties.has(property), `authored lifecycle vectors cover ${property}`).toBe(true)
  }

  const bindings = new Set<Compiler.Format>()
  for (const { request: vectorRequest } of vectors) {
    for (const format of clientBindings(vectorRequest)) bindings.add(format)
  }
  expect(bindings, "authored lifecycle vectors use both current package clients").toEqual(new Set(Compiler.Format.literals))
})

it("matches current client capability and ambiguity cases against Lean", () => {
  const cases = currentCompatibilityCases()
  expect(cases.length).toBeGreaterThan(0)
  compare(cases, "current client compatibility cases")
})
