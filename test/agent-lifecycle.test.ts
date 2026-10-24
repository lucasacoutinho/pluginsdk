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
import * as Installer from "../contracts/Installer.ts"
import * as Repair from "../contracts/Repair.ts"
import { parseJson } from "../src/internal/json.ts"
import { checkPackages } from "../src/catalog/artifacts/model.ts"
import { register, resolve } from "../src/catalog/model.ts"
import { nativeOwnershipCompatible, selectNativeProfile } from "../src/installer/target/compatibility.ts"
import { selectDistributionFormat } from "../src/distribution/selection.ts"
import { beginRepair, propose, settleRepair } from "../src/installer/recovery/model.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
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

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(path: string): ReadonlyArray<typeof Vector.Type> {
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => decode(Vector, parseJson(line)))
}

function evaluate(request: OracleRequest): OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    catalog_register: ({ input }): OracleResponse => ({
      schema: 1,
      type: "catalog_register",
      output: register(input.ledger, input.release)
    }),
    catalog_resolve: ({ input }): OracleResponse => ({
      schema: 1,
      type: "catalog_resolve",
      output: resolve(input.ledger, input.key, input.target)
    }),
    check_packages: ({ input }): OracleResponse => ({
      schema: 1,
      type: "check_packages",
      output: checkPackages(input)
    }),
    select_distribution_format: ({ input }): OracleResponse => ({
      schema: 1,
      type: "select_distribution_format",
      output: selectDistributionFormat(input)
    }),
    select_native_profile: ({ input }): OracleResponse => ({
      schema: 1,
      type: "select_native_profile",
      output: selectNativeProfile(input)
    }),
    native_ownership_compatible: ({ input }): OracleResponse => ({
      schema: 1,
      type: "native_ownership_compatible",
      output: nativeOwnershipCompatible(input)
    }),
    repair_propose: ({ input }): OracleResponse => ({
      schema: 1,
      type: "repair_propose",
      output: propose(input)
    }),
    repair_begin: ({ input }): OracleResponse => ({
      schema: 1,
      type: "repair_begin",
      output: beginRepair(input)
    }),
    repair_settle: ({ input }): OracleResponse => ({
      schema: 1,
      type: "repair_settle",
      output: settleRepair(input)
    })
  }))
}

function evaluateWithoutMutation(request: OracleRequest): OracleResponse {
  const before = structuredClone(request)
  const response = evaluate(request)
  expect(request, request.type + ": input value").toEqual(before)
  return decode(Response, response)
}

function compare(requests: ReadonlyArray<OracleRequest>): ReadonlyArray<OracleResponse> {
  const lines = requests.map((request) => {
    const encoded: unknown = Schema.encodeSync(Request)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("lifecycle oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: lines.join("\n") + "\n",
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error("Lean lifecycle oracle exited with status " + String(result.status) + ": " + result.stderr)
  }
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    return decode(Response, parseJson(line))
  })
  expect(responses, "Lean lifecycle response count").toHaveLength(requests.length)

  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing lifecycle oracle response " + index)
    expect(
      equivalentResponse(evaluateWithoutMutation(request), response),
      request.type + " oracle case " + index
    ).toBe(true)
  }
  return responses
}

function request(input: unknown): OracleRequest {
  return decode(Request, input)
}

function formatSelectionRequests(): ReadonlyArray<OracleRequest> {
  const requests: OracleRequest[] = []
  for (const host of DistributionModel.LocalHost.literals) {
    for (const format of Compiler.Format.literals) {
      requests.push(request({
        schema: 1,
        type: "select_distribution_format",
        input: { host, formats: [format] }
      }))
      requests.push(request({
        schema: 1,
        type: "select_distribution_format",
        input: { host, formats: [format, format] }
      }))
    }
    requests.push(request({
      schema: 1,
      type: "select_distribution_format",
      input: { host, formats: [] }
    }))
    requests.push(request({
      schema: 1,
      type: "select_distribution_format",
      input: { host, formats: [...Compiler.Format.literals] }
    }))
  }
  return requests
}

function otherScope(scope: Compatibility.Scope): Compatibility.Scope {
  return Match.value(scope).pipe(
    Match.when("user", (): Compatibility.Scope => "project"),
    Match.when("project", (): Compatibility.Scope => "user"),
    Match.exhaustive
  )
}

function profileSelectionRequests(): ReadonlyArray<OracleRequest> {
  const requests: OracleRequest[] = []
  for (const host of Installer.Host.literals) {
    for (const scope of Compatibility.Scope.literals) {
      const profile = {
        host,
        platform: "linux",
        version: "2.1.304",
        scope,
        revision: "adapter-1",
        formats: [...Compiler.Format.literals]
      }
      const query = { host, platform: "linux", version: "2.1.304", scope, format: null }
      requests.push(request({
        schema: 1,
        type: "select_native_profile",
        input: { query, profiles: [profile] }
      }))
      requests.push(request({
        schema: 1,
        type: "select_native_profile",
        input: { query: { ...query, scope: otherScope(scope) }, profiles: [profile] }
      }))
    }
  }
  return requests
}

function repairRequests(): ReadonlyArray<OracleRequest> {
  const interrupted = "a".repeat(64)
  const pending = "c".repeat(64)
  const otherPlan = "d".repeat(64)
  const fingerprint = "1".repeat(64)
  const changedFingerprint = "2".repeat(64)
  const residuals = Installer.RepairResidual.literals
  const requests: OracleRequest[] = []

  const snapshot = (residual: Installer.RepairResidual, value = fingerprint) => ({
    fingerprint: value,
    residual
  })
  const basis = (residual: Installer.RepairResidual) => ({
    interrupted,
    pending: interrupted,
    observed: snapshot(residual)
  })

  for (const residual of residuals) {
    const before = basis(residual)
    const state = snapshot(residual)
    requests.push(request({
      schema: 1,
      type: "repair_begin",
      input: {
        state: { type: "operation_pending", plan: interrupted },
        observed: { type: "recoverable", state },
        plan: pending,
        before
      }
    }))

    const pendingState = { type: "repair_pending", plan: pending, before: { ...before, pending } }
    for (const observedResidual of residuals) {
      requests.push(request({
        schema: 1,
        type: "repair_settle",
        input: {
          state: pendingState,
          observed: {
            type: "recoverable",
            state: snapshot(observedResidual, changedFingerprint)
          }
        }
      }))
      requests.push(request({
        schema: 1,
        type: "repair_begin",
        input: {
          state: { type: "complete", plan: pending },
          observed: { type: "recoverable", state: snapshot(observedResidual, changedFingerprint) },
          plan: pending,
          before: { ...before, pending }
        }
      }))
    }
    requests.push(request({
      schema: 1,
      type: "repair_begin",
      input: {
        state: { type: "complete", plan: pending },
        observed: { type: "recoverable", state: snapshot("absent", changedFingerprint) },
        plan: otherPlan,
        before: { ...before, pending }
      }
    }))
  }
  return requests
}

const lifecycleVectors = readVectors("../spec/vectors/agent-lifecycle.ndjson")
const repairVectors = readVectors("../spec/vectors/repair.ndjson")

it("matches all authored agent lifecycle and existing repair vectors against Lean", () => {
  expect(lifecycleVectors).toHaveLength(50)
  expect(repairVectors).toHaveLength(18)
  const vectors = [...lifecycleVectors, ...repairVectors]
  const responses = compare(vectors.map(({ request: vectorRequest }) => vectorRequest))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing authored response for " + vector.name)
    expect(equivalentResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("matches generated format-host pairs, registration scopes, and four-way repair transitions", () => {
  const requests = [
    ...formatSelectionRequests(),
    ...profileSelectionRequests(),
    ...repairRequests()
  ]
  expect(requests).toHaveLength(100)
  compare(requests)
})
