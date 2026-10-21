import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Installer from "../contracts/Installer.ts"
import * as Repair from "../contracts/Repair.ts"
import { beginRepair, propose, settleRepair } from "../src/model/repair.ts"

type OracleRequest = Repair.OracleRequest
type OracleResponse = Repair.OracleResponse
type Case = { readonly name: string; readonly request: OracleRequest }
type VectorCase = Case & { readonly properties: ReadonlyArray<string>; readonly expected: OracleResponse }

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/repair.ndjson", import.meta.url))
const equivalentResponse = Schema.toEquivalence(Repair.OracleResponse)

const VectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: Schema.Unknown,
  expected: Schema.Unknown
})

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<VectorCase> {
  const cases: Array<VectorCase> = []
  for (const line of readFileSync(vectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const row = decodeStrict(VectorRow, JSON.parse(line))
    cases.push({
      name: row.name,
      properties: row.properties,
      request: decodeStrict(Repair.OracleRequest, row.request),
      expected: decodeStrict(Repair.OracleResponse, row.expected)
    })
  }
  return cases
}

function roundTripRequest(request: OracleRequest): OracleRequest {
  const encoded: unknown = Schema.encodeSync(Repair.OracleRequest)(request)
  return decodeStrict(Repair.OracleRequest, encoded)
}

function roundTripResponse(response: OracleResponse): OracleResponse {
  const encoded: unknown = Schema.encodeSync(Repair.OracleResponse)(response)
  return decodeStrict(Repair.OracleResponse, encoded)
}

function runOracle(requests: ReadonlyArray<OracleRequest>): ReadonlyArray<OracleResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(Repair.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("repair oracle request could not be encoded as JSON")
    lines.push(line)
  }
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean repair oracle exited with status ${String(result.status)}: ${result.stderr}`)

  const responses: Array<OracleResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(Repair.OracleResponse, raw))
  }
  return responses
}

function evaluate(request: OracleRequest): OracleResponse {
  const output = Match.value(request).pipe(
    Match.discriminatorsExhaustive("type")({
      repair_propose: (value) => propose(value.input),
      repair_begin: (value) => beginRepair(value.input),
      repair_settle: (value) => settleRepair(value.input)
    })
  )
  return roundTripResponse(decodeStrict(Repair.OracleResponse, {
    schema: 1,
    type: request.type,
    output
  }))
}

function compareWithOracle(cases: ReadonlyArray<Case>): ReadonlyArray<OracleResponse> {
  const requests = cases.map((current) => roundTripRequest(current.request))
  const oracle = runOracle(requests)
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const actual = oracle[index]
    if (actual === undefined) throw new Error(`repair oracle response ${index} is missing`)
    expect(equivalentResponse(evaluate(current.request), actual), `${current.name}: TypeScript matches Lean`).toBe(true)
  }
  return oracle
}

const idA = decodeStrict(Installer.PlanId, "a".repeat(64))
const idB = decodeStrict(Installer.PlanId, "b".repeat(64))
const idC = decodeStrict(Installer.PlanId, "c".repeat(64))
const idD = decodeStrict(Installer.PlanId, "d".repeat(64))
const fingerprintA = decodeStrict(Installer.Fingerprint, "1".repeat(64))
const fingerprintB = decodeStrict(Installer.Fingerprint, "2".repeat(64))

function snapshot(residual: "absent" | "marketplace", fingerprint = fingerprintA): Installer.RepairSnapshot {
  return decodeStrict(Installer.RepairSnapshot, { fingerprint, residual })
}

function basis(
  interrupted = idA,
  pending = idA,
  residual: "absent" | "marketplace" = "marketplace",
  fingerprint = fingerprintA
): Installer.RepairBasis {
  return decodeStrict(Installer.RepairBasis, {
    interrupted,
    pending,
    observed: snapshot(residual, fingerprint)
  })
}

function operationPending(plan = idA): Repair.RepairState {
  return decodeStrict(Repair.RepairState, { type: "operation_pending", plan })
}

function repairPending(plan = idC, before = basis()): Repair.RepairPending {
  return decodeStrict(Repair.RepairPending, { type: "repair_pending", plan, before })
}

function complete(plan = idC): Repair.RepairState {
  return decodeStrict(Repair.RepairState, { type: "complete", plan })
}

function recoverable(state: Installer.RepairSnapshot): Repair.RepairInspection {
  return decodeStrict(Repair.RepairInspection, { type: "recoverable", state })
}

function blocked(reason: Installer.Conflict): Repair.RepairInspection {
  return decodeStrict(Repair.RepairInspection, { type: "blocked", reason })
}

function proposalRequest(state: Repair.RepairState, observed: Repair.RepairInspection): OracleRequest {
  return decodeStrict(Repair.OracleRequest, {
    schema: 1,
    type: "repair_propose",
    input: { state, observed }
  })
}

function beginRequest(
  state: Repair.RepairState,
  plan: Installer.PlanId,
  before: Installer.RepairBasis,
  observed: Repair.RepairInspection
): OracleRequest {
  return decodeStrict(Repair.OracleRequest, {
    schema: 1,
    type: "repair_begin",
    input: { state, plan, before, observed }
  })
}

function settleRequest(state: Repair.RepairPending, observed: Repair.RepairInspection): OracleRequest {
  return decodeStrict(Repair.OracleRequest, {
    schema: 1,
    type: "repair_settle",
    input: { state, observed }
  })
}

function generatedCases(): ReadonlyArray<Case> {
  const cases: Array<Case> = []
  const inspections = [
    blocked("unknown"),
    blocked("unowned"),
    blocked("drift"),
    recoverable(snapshot("absent")),
    recoverable(snapshot("marketplace")),
    recoverable(snapshot("marketplace", fingerprintB))
  ] as const
  const proposalStates: ReadonlyArray<Repair.RepairState> = [
    operationPending(),
    repairPending(),
    complete()
  ]
  for (const state of proposalStates) {
    for (const observed of inspections) {
      cases.push({
        name: `generated proposal ${state.type}/${observed.type}/${observed.type === "blocked" ? observed.reason : observed.state.residual}`,
        request: proposalRequest(state, observed)
      })
    }
  }

  const startObservations = [
    recoverable(snapshot("absent")),
    recoverable(snapshot("marketplace")),
    recoverable(snapshot("marketplace", fingerprintB)),
    blocked("unknown")
  ] as const
  for (const observed of startObservations) {
    const reviewed = observed.type === "recoverable"
      ? basis(idA, idA, observed.state.residual, observed.state.fingerprint)
      : basis()
    cases.push({ name: `operation-pending fresh candidate ${observed.type}`, request: beginRequest(operationPending(), idC, reviewed, observed) })
  }
  cases.push(
    { name: "operation-pending cannot reuse interrupted ID", request: beginRequest(operationPending(), idA, basis(), recoverable(snapshot("marketplace"))) },
    { name: "operation-pending different pending basis", request: beginRequest(operationPending(), idC, basis(idA, idB), recoverable(snapshot("marketplace"))) },
    { name: "operation-pending mismatched interrupted basis", request: beginRequest(operationPending(), idC, basis(idB, idA), recoverable(snapshot("marketplace"))) }
  )

  const oldBasis = basis(idA, idA, "marketplace")
  const current = repairPending(idC, oldBasis)
  cases.push(
    { name: "exact cleanup retry ignores changed blocked observation", request: beginRequest(current, idC, oldBasis, blocked("drift")) },
    { name: "same cleanup ID with a different reviewed basis", request: beginRequest(current, idC, basis(idA, idA, "marketplace", fingerprintB), recoverable(snapshot("marketplace"))) },
    { name: "fresh cleanup supersedes current cleanup", request: beginRequest(current, idD, basis(idA, idC, "marketplace", fingerprintB), recoverable(snapshot("marketplace", fingerprintB))) },
    { name: "cleanup rejects interrupted operation ID", request: beginRequest(current, idA, oldBasis, recoverable(snapshot("marketplace"))) },
    { name: "cleanup fresh candidate changed interrupted binding", request: beginRequest(current, idD, basis(idB, idC, "marketplace", fingerprintB), recoverable(snapshot("marketplace", fingerprintB))) }
  )

  cases.push(
    { name: "completed replay with absence", request: beginRequest(complete(), idC, oldBasis, recoverable(snapshot("absent"))) },
    { name: "completed replay with residual marketplace", request: beginRequest(complete(), idC, oldBasis, recoverable(snapshot("marketplace"))) },
    { name: "completed replay with blocked observation", request: beginRequest(complete(), idC, oldBasis, blocked("unknown")) },
    { name: "completed replay with another ID", request: beginRequest(complete(), idD, oldBasis, recoverable(snapshot("absent"))) }
  )

  const pending = repairPending()
  for (const observed of inspections) {
    cases.push({ name: `generated settlement ${observed.type}/${observed.type === "blocked" ? observed.reason : observed.state.residual}`, request: settleRequest(pending, observed) })
  }
  return cases
}

it("matches all 18 committed repair vectors against the strict Lean oracle", () => {
  const cases = readVectors()
  expect(cases).toHaveLength(18)
  const oracle = compareWithOracle(cases)
  for (const [index, current] of cases.entries()) {
    const actual = oracle[index]
    if (actual === undefined) throw new Error(`repair vector oracle response ${index} is missing`)
    expect(equivalentResponse(actual, current.expected), `${current.name}: vector agrees with Lean`).toBe(true)
    expect(current.properties.length, `${current.name}: property tags are present`).toBeGreaterThan(0)
  }
})

it("matches generated proposal, start, retry, replay, and settlement cases against Lean", () => {
  const cases = generatedCases()
  expect(cases).toHaveLength(40)
  compareWithOracle(cases)
})

it("preserves independent authorization and retry edge results", () => {
  const blockedStart = evaluate(beginRequest(
    operationPending(),
    idC,
    basis(),
    blocked("unknown")
  ))
  expect(blockedStart).toStrictEqual({
    schema: 1,
    type: "repair_begin",
    output: { type: "rejected", reason: "stale_plan" }
  })

  const current = repairPending(idC, basis())
  const retry = evaluate(beginRequest(current, idC, basis(), blocked("drift")))
  expect(retry).toStrictEqual({ schema: 1, type: "repair_begin", output: { type: "resume", state: current } })

  const superseding = evaluate(beginRequest(
    current,
    idD,
    basis(idA, idC, "marketplace", fingerprintB),
    recoverable(snapshot("marketplace", fingerprintB))
  ))
  expect(superseding).toMatchObject({
    output: {
      type: "start",
      state: { plan: idD, before: { interrupted: idA, pending: idC } },
      change: "remove_marketplace"
    }
  })

  const unsettled = evaluate(settleRequest(current, recoverable(snapshot("marketplace", fingerprintB))))
  expect(unsettled).toStrictEqual({
    schema: 1,
    type: "repair_settle",
    output: { type: "uncertain", state: current, observed: recoverable(snapshot("marketplace", fingerprintB)) }
  })
})

it("rejects malformed wire values, excess properties, and non-hex brands", () => {
  const valid = readVectors()[0]
  if (valid === undefined) throw new Error("repair vectors are empty")
  expect(() => decodeStrict(Repair.OracleRequest, { ...valid.request, extra: true })).toThrow()
  expect(() => decodeStrict(Repair.OracleRequest, {
    ...valid.request,
    input: { ...valid.request.input, extra: true }
  })).toThrow()
  expect(() => decodeStrict(Repair.OracleResponse, { ...valid.expected, extra: true })).toThrow()
  expect(() => decodeStrict(Installer.PlanId, "g".repeat(64))).toThrow()
  expect(() => decodeStrict(Installer.Fingerprint, "1".repeat(63))).toThrow()
  expect(() => decodeStrict(Repair.OracleRequest, {
    schema: 1,
    type: "repair_begin",
    input: { plan: idC }
  })).toThrow()
})
