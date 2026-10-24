import { expect, it } from "@effect/vitest"
import { Effect, Layer, Match, Schema } from "effect"
import { BundleBody } from "../contracts/Compiler.ts"
import type { Bundle } from "../contracts/Compiler.ts"
import {
  Fingerprint,
  HostUnavailable,
  InstallationKey,
  Installer,
  PlanId,
  PlanRejected,
  type ApplyFailure,
  type ApplyOutcome,
  type Conflict as InstallerConflict,
  type PlanBody,
  type PlanChange,
  type PlanRequest as PlanRequestType,
  type Planning,
  type PlanningFailure,
  type ReadyPlan,
  type ReviewedPlan,
  type Snapshot
} from "../contracts/Installer.ts"
import { Directory, PluginId } from "../contracts/Plugin.ts"
import { LocalPreviewStatus, ProjectError } from "../contracts/Project.ts"
import {
  applyInherited,
  prepareInstallation
} from "../src/project/preview/installations.ts"
import { bundleDigest, planId } from "../src/internal/identity.ts"

type TestIntent = Extract<PlanRequestType["intent"], { readonly type: "absent" | "present" }>
type TestPlanRequest = Omit<PlanRequestType, "intent"> & { readonly intent: TestIntent }

const bundle: Bundle = (() => {
  const body = Schema.decodeSync(BundleBody)({
    schema: 1,
    plugin: "preview-boundary",
    format: "claude_code_v4",
    files: [{ path: "skills/overview/SKILL.md", content: "IyBQcmV2aWV3IGZpeHR1cmUK", executable: false }]
  })
  return { ...body, digest: bundleDigest(body) }
})()

const plugin = PluginId.make("preview-boundary")
const providerHome = Directory.make("/profiles/claude")
const cursorHome = Directory.make("/profiles/cursor")

const providerRequest: TestPlanRequest = {
  destination: { type: "user", host: "claude_code", home: providerHome },
  intent: { type: "present", bundle }
}

const cleanupRequest: TestPlanRequest = {
  destination: { type: "user", host: "cursor", home: cursorHome },
  intent: { type: "absent", plugin }
}

const absentSnapshot = (): Snapshot => ({
  revision: null,
  receipt: null,
  observed: { type: "absent" }
})

const presentSnapshot = (): Snapshot => {
  const plan = PlanId.make("c".repeat(64))
  const fingerprint = Fingerprint.make("d".repeat(64))
  const identity = { plan, bundle: bundle.digest }
  const receipt = { identity, fingerprint }
  return {
    revision: plan,
    receipt,
    observed: { type: "present", fingerprint, identity }
  }
}

const unknownSnapshot = (): Snapshot => ({
  revision: null,
  receipt: null,
  observed: { type: "unknown" }
})

const desiredSnapshot = (request: TestPlanRequest): Snapshot => Match.value(request.intent).pipe(
  Match.discriminatorsExhaustive("type")({
    absent: () => absentSnapshot(),
    present: () => presentSnapshot()
  })
)

type PlanSelection = {
  readonly plugin: typeof plugin
  readonly before: Snapshot
  readonly change: PlanChange
}

const readyPlan = (request: TestPlanRequest): ReadyPlan => {
  const selection: PlanSelection = Match.value(request.intent).pipe(Match.discriminatorsExhaustive("type")({
    absent: ({ plugin: selectedPlugin }): PlanSelection => ({
      plugin: selectedPlugin,
      before: presentSnapshot(),
      change: { type: "remove" }
    }),
    present: ({ bundle: selectedBundle }): PlanSelection => ({
      plugin: selectedBundle.plugin,
      before: absentSnapshot(),
      change: { type: "install", bundle: selectedBundle }
    })
  }))
  const body: PlanBody = {
    type: "ready",
    schema: 1,
    target: {
      key: InstallationKey.make(`${request.destination.host}:${request.destination.home}`),
      destination: request.destination,
      plugin: selection.plugin,
      profile: "preview-installations-test",
      version: "1.0.0"
    },
    before: selection.before,
    change: selection.change
  }
  return { ...body, id: planId(body) }
}

const unchangedPlanning = (request: TestPlanRequest): Planning => ({
  type: "unchanged",
  target: readyPlan(request).target,
  state: desiredSnapshot(request)
})

const blockedPlanning = (request: TestPlanRequest, reason: InstallerConflict): Planning => ({
  type: "blocked",
  target: readyPlan(request).target,
  state: Match.value(reason).pipe(Match.when("unknown", () => unknownSnapshot()), Match.whenOr("unowned", "drift", () => presentSnapshot()), Match.exhaustive),
  reason
})

const readyPlanning = (request: TestPlanRequest): Planning => readyPlan(request)

const pendingPlanning = (request: TestPlanRequest): Planning => ({
  type: "pending",
  plan: readyPlan(request)
})

type PlanResponse =
  | { readonly type: "planning"; readonly planning: Planning }
  | { readonly type: "failure"; readonly failure: PlanningFailure }

type ApplyResponse =
  | { readonly type: "outcome"; readonly outcome: ApplyOutcome }
  | { readonly type: "failure"; readonly failure: ApplyFailure }

type PlanStep = { readonly request: PlanRequestType; readonly response: PlanResponse }
type ApplyStep = { readonly plan: ReadyPlan; readonly response: ApplyResponse }

type Operation =
  | { readonly type: "plan"; readonly request: PlanRequestType }
  | { readonly type: "apply"; readonly plan: ReviewedPlan }
  | { readonly type: "imports"; readonly result: boolean | "failure" }

type ImportCheck =
  | { readonly type: "enabled"; readonly value: boolean }
  | { readonly type: "failure"; readonly error: ProjectError }

type Trace = {
  readonly requests: Array<PlanRequestType>
  readonly applied: Array<ReviewedPlan>
  readonly mutations: Array<string>
  readonly operations: Array<Operation>
}

const scriptedImports = (trace: Trace, checks: ReadonlyArray<ImportCheck>): Effect.Effect<boolean, ProjectError> => {
  let checkIndex = 0
  return Effect.suspend(() => {
    const check = checks[checkIndex]
    checkIndex += 1
    if (check === undefined) return Effect.die(new Error("Unexpected native import check"))
    const result = Match.value(check).pipe(Match.withReturnType<boolean | "failure">(), Match.discriminatorsExhaustive("type")({
      enabled: ({ value }) => value,
      failure: () => "failure"
    }))
    trace.operations.push({ type: "imports", result })
    return Match.value(check).pipe(Match.discriminatorsExhaustive("type")({
      enabled: ({ value }) => Effect.succeed(value),
      failure: ({ error }) => Effect.fail(error)
    }))
  })
}

type Scenario = {
  readonly layer: Layer.Layer<Installer>
  readonly trace: Trace
}

const makeScenario = (plans: ReadonlyArray<PlanStep>, applies: ReadonlyArray<ApplyStep>): Scenario => {
  let planIndex = 0
  let applyIndex = 0
  const trace: Trace = { requests: [], applied: [], mutations: [], operations: [] }
  const service = Installer.of({
    plan: (request) => {
      trace.requests.push(request)
      trace.operations.push({ type: "plan", request })
      const step = plans[planIndex]
      planIndex += 1
      if (step === undefined) return Effect.die(new Error("Unexpected Installer.plan request"))
      expect(request).toEqual(step.request)
      return Match.value(step.response).pipe(Match.discriminatorsExhaustive("type")({
        planning: ({ planning }) => Effect.succeed(planning),
        failure: ({ failure }) => Effect.fail(failure)
      }))
    },
    apply: (plan) => {
      trace.applied.push(plan)
      trace.operations.push({ type: "apply", plan })
      const step = applies[applyIndex]
      applyIndex += 1
      if (step === undefined) return Effect.die(new Error("Unexpected Installer.apply request"))
      expect(plan).toBe(step.plan)
      return Match.value(step.response).pipe(Match.discriminatorsExhaustive("type")({
        outcome: ({ outcome }) => {
          const target = Match.value(plan).pipe(Match.discriminatorsExhaustive("type")({
            ready: ({ target }) => target,
            repair_ready: ({ target }) => target
          }))
          const mutation = Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
            uncertain: () => null,
            completed: ({ result }) => Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
              installed: () => "installed",
              removed: () => "removed",
              not_applied: () => null
            }))
          }))
          if (mutation !== null) trace.mutations.push(`${target.destination.host}:${mutation}`)
          return Effect.succeed(outcome)
        },
        failure: ({ failure }) => Effect.fail(failure)
      }))
    }
  })
  return { layer: Layer.succeed(Installer, service), trace }
}

const planningStep = (request: PlanRequestType, planning: Planning): PlanStep => ({
  request,
  response: { type: "planning", planning }
})

const planOperation = (request: PlanRequestType): Operation => ({ type: "plan", request })
const applyOperation = (plan: ReviewedPlan): Operation => ({ type: "apply", plan })

const planningFailureStep = (request: PlanRequestType, failure: PlanningFailure): PlanStep => ({
  request,
  response: { type: "failure", failure }
})

const applyStep = (plan: ReadyPlan, outcome: ApplyOutcome): ApplyStep => ({
  plan,
  response: { type: "outcome", outcome }
})

const applyFailureStep = (plan: ReadyPlan, failure: ApplyFailure): ApplyStep => ({
  plan,
  response: { type: "failure", failure }
})

const run = <A, E>(scenario: Scenario, effect: Effect.Effect<A, E, Installer>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(scenario.layer)))

const prepareCursor = () => prepareInstallation("cursor", cursorHome, { type: "absent", plugin })

const confirmedProviderPlanning = unchangedPlanning(providerRequest)
const confirmedCleanupPlanning = unchangedPlanning(cleanupRequest)
const removedOutcome: ApplyOutcome = { type: "completed", result: { type: "removed" } }

it("inherits only after successful provider application and fresh provider and local absence confirmations", async () => {
  const cleanupPlan = readyPlan(cleanupRequest)
  for (const providerStatus of ["installed", "unchanged"] satisfies ReadonlyArray<LocalPreviewStatus>) {
    const scenario = makeScenario([
      planningStep(cleanupRequest, cleanupPlan),
      planningStep(providerRequest, confirmedProviderPlanning),
      planningStep(providerRequest, confirmedProviderPlanning),
      planningStep(cleanupRequest, confirmedCleanupPlanning)
    ], [applyStep(cleanupPlan, removedOutcome)])
    const importsEnabled = scriptedImports(scenario.trace, [
      { type: "enabled", value: true },
      { type: "enabled", value: true }
    ])

    const result = await run(scenario, Effect.gen(function*() {
      const prepared = yield* prepareCursor()
      const status = yield* applyInherited(providerRequest, providerStatus, prepared, importsEnabled)
      return { prepared, status }
    }))

    expect(result.prepared.plan).toBe(cleanupPlan)
    expect(result.status).toBe("inherited")
    expect(scenario.trace.requests).toEqual([cleanupRequest, providerRequest, providerRequest, cleanupRequest])
    expect(scenario.trace.applied).toEqual([cleanupPlan])
    expect(scenario.trace.applied[0]).toBe(cleanupPlan)
    expect(scenario.trace.mutations).toEqual(["cursor:removed"])
    expect(scenario.trace.operations).toEqual([
      planOperation(cleanupRequest),
      planOperation(providerRequest),
      { type: "imports", result: true },
      applyOperation(cleanupPlan),
      planOperation(providerRequest),
      planOperation(cleanupRequest),
      { type: "imports", result: true }
    ])
  }
})

it("never cleans the local copy when the provider outcome is missing, removed, not applied or uncertain", async () => {
  const denied: ReadonlyArray<{ readonly provider: LocalPreviewStatus; readonly expected: LocalPreviewStatus }> = [
    { provider: "missing", expected: "not_applied" },
    { provider: "removed", expected: "not_applied" },
    { provider: "not_applied", expected: "not_applied" },
    { provider: "uncertain", expected: "uncertain" }
  ]

  for (const { provider, expected } of denied) {
    const cleanupPlan = readyPlan(cleanupRequest)
    const scenario = makeScenario([planningStep(cleanupRequest, cleanupPlan)], [])
    const status = await run(scenario, Effect.gen(function*() {
      const prepared = yield* prepareCursor()
      return yield* applyInherited(providerRequest, provider, prepared, Effect.succeed(true))
    }))

    expect(status).toBe(expected)
    expect(scenario.trace.requests).toEqual([cleanupRequest])
    expect(scenario.trace.applied).toEqual([])
    expect(scenario.trace.mutations).toEqual([])
  }
})

it("refuses cleanup when fresh provider planning is drifted, unknown, still ready or pending", async () => {
  const cases: ReadonlyArray<{ readonly planning: Planning; readonly expected: LocalPreviewStatus }> = [
    { planning: blockedPlanning(providerRequest, "drift"), expected: "not_applied" },
    { planning: blockedPlanning(providerRequest, "unknown"), expected: "uncertain" },
    { planning: readyPlanning(providerRequest), expected: "not_applied" },
    { planning: pendingPlanning(providerRequest), expected: "uncertain" }
  ]

  for (const { planning, expected } of cases) {
    const cleanupPlan = readyPlan(cleanupRequest)
    const scenario = makeScenario([
      planningStep(cleanupRequest, cleanupPlan),
      planningStep(providerRequest, planning)
    ], [])
    const status = await run(scenario, Effect.gen(function*() {
      const prepared = yield* prepareCursor()
      return yield* applyInherited(providerRequest, "installed", prepared, Effect.succeed(true))
    }))

    expect(status).toBe(expected)
    expect(scenario.trace.requests).toEqual([cleanupRequest, providerRequest])
    expect(scenario.trace.applied).toEqual([])
    expect(scenario.trace.mutations).toEqual([])
  }
})

it("does not claim inheritance when cleanup is not applied or has an uncertain outcome", async () => {
  const cleanupPlan = readyPlan(cleanupRequest)
  const cases: ReadonlyArray<{ readonly outcome: ApplyOutcome; readonly expected: LocalPreviewStatus }> = [
    { outcome: { type: "completed", result: { type: "not_applied" } }, expected: "not_applied" },
    { outcome: { type: "uncertain", observed: { type: "unknown" } }, expected: "uncertain" }
  ]

  for (const { outcome, expected } of cases) {
    const scenario = makeScenario([
      planningStep(cleanupRequest, cleanupPlan),
      planningStep(providerRequest, confirmedProviderPlanning)
    ], [applyStep(cleanupPlan, outcome)])
    const status = await run(scenario, Effect.gen(function*() {
      const prepared = yield* prepareCursor()
      return yield* applyInherited(providerRequest, "installed", prepared, Effect.succeed(true))
    }))

    expect(status).toBe(expected)
    expect(scenario.trace.requests).toEqual([cleanupRequest, providerRequest])
    expect(scenario.trace.applied).toEqual([cleanupPlan])
    expect(scenario.trace.mutations).toEqual([])
  }
})

it("reconfirms provider presence and local absence after cleanup before returning inherited", async () => {
  const cleanupPlan = readyPlan(cleanupRequest)
  const cases: ReadonlyArray<{
    readonly providerAfter: Planning
    readonly cleanupAfter: Planning
    readonly expected: LocalPreviewStatus
  }> = [
    { providerAfter: readyPlanning(providerRequest), cleanupAfter: confirmedCleanupPlanning, expected: "not_applied" },
    { providerAfter: blockedPlanning(providerRequest, "unknown"), cleanupAfter: confirmedCleanupPlanning, expected: "uncertain" },
    { providerAfter: confirmedProviderPlanning, cleanupAfter: readyPlanning(cleanupRequest), expected: "not_applied" },
    { providerAfter: confirmedProviderPlanning, cleanupAfter: blockedPlanning(cleanupRequest, "unknown"), expected: "uncertain" }
  ]

  for (const { providerAfter, cleanupAfter, expected } of cases) {
    const scenario = makeScenario([
      planningStep(cleanupRequest, cleanupPlan),
      planningStep(providerRequest, confirmedProviderPlanning),
      planningStep(providerRequest, providerAfter),
      planningStep(cleanupRequest, cleanupAfter)
    ], [applyStep(cleanupPlan, removedOutcome)])
    const status = await run(scenario, Effect.gen(function*() {
      const prepared = yield* prepareCursor()
      return yield* applyInherited(providerRequest, "installed", prepared, Effect.succeed(true))
    }))

    expect(status).toBe(expected)
    expect(scenario.trace.requests).toEqual([cleanupRequest, providerRequest, providerRequest, cleanupRequest])
    expect(scenario.trace.applied).toEqual([cleanupPlan])
    expect(scenario.trace.mutations).toEqual(["cursor:removed"])
  }
})

it("replays unchanged local absence without mutation and still reconfirms both destinations", async () => {
  const scenario = makeScenario([
    planningStep(cleanupRequest, confirmedCleanupPlanning),
    planningStep(providerRequest, confirmedProviderPlanning),
    planningStep(providerRequest, confirmedProviderPlanning),
    planningStep(cleanupRequest, confirmedCleanupPlanning)
  ], [])
  const result = await run(scenario, Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    const status = yield* applyInherited(providerRequest, "unchanged", prepared, scriptedImports(scenario.trace, [
      { type: "enabled", value: true },
      { type: "enabled", value: true }
    ]))
    return { prepared, status }
  }))

  expect(result.prepared.plan).toBeNull()
  expect(result.status).toBe("inherited")
  expect(scenario.trace.requests).toEqual([cleanupRequest, providerRequest, providerRequest, cleanupRequest])
  expect(scenario.trace.applied).toEqual([])
  expect(scenario.trace.mutations).toEqual([])
  expect(scenario.trace.operations).toEqual([
    planOperation(cleanupRequest),
    planOperation(providerRequest),
    { type: "imports", result: true },
    planOperation(providerRequest),
    planOperation(cleanupRequest),
    { type: "imports", result: true }
  ])
})

it("requires import evidence immediately before cleanup and after final confirmations", async () => {
  const cleanupPlan = readyPlan(cleanupRequest)
  const beforeCleanup = makeScenario([
    planningStep(cleanupRequest, cleanupPlan),
    planningStep(providerRequest, confirmedProviderPlanning)
  ], [])
  const beforeStatus = await run(beforeCleanup, Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    return yield* applyInherited(providerRequest, "installed", prepared, scriptedImports(beforeCleanup.trace, [
      { type: "enabled", value: false }
    ]))
  }))

  expect(beforeStatus).toBe("not_applied")
  expect(beforeCleanup.trace.applied).toEqual([])
  expect(beforeCleanup.trace.mutations).toEqual([])
  expect(beforeCleanup.trace.operations).toEqual([
    planOperation(cleanupRequest),
    planOperation(providerRequest),
    { type: "imports", result: false }
  ])

  const afterCleanup = makeScenario([
    planningStep(cleanupRequest, cleanupPlan),
    planningStep(providerRequest, confirmedProviderPlanning),
    planningStep(providerRequest, confirmedProviderPlanning),
    planningStep(cleanupRequest, confirmedCleanupPlanning)
  ], [applyStep(cleanupPlan, removedOutcome)])
  const afterStatus = await run(afterCleanup, Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    return yield* applyInherited(providerRequest, "installed", prepared, scriptedImports(afterCleanup.trace, [
      { type: "enabled", value: true },
      { type: "enabled", value: false }
    ]))
  }))

  expect(afterStatus).toBe("not_applied")
  expect(afterCleanup.trace.applied).toEqual([cleanupPlan])
  expect(afterCleanup.trace.mutations).toEqual(["cursor:removed"])
  expect(afterCleanup.trace.operations).toEqual([
    planOperation(cleanupRequest),
    planOperation(providerRequest),
    { type: "imports", result: true },
    applyOperation(cleanupPlan),
    planOperation(providerRequest),
    planOperation(cleanupRequest),
    { type: "imports", result: false }
  ])
})

it("propagates import-evidence ProjectErrors before cleanup and after final confirmation", async () => {
  const cleanupPlan = readyPlan(cleanupRequest)
  const failure = new ProjectError({ detail: "Native import evidence is unavailable" })
  const beforeCleanup = makeScenario([
    planningStep(cleanupRequest, cleanupPlan),
    planningStep(providerRequest, confirmedProviderPlanning)
  ], [])
  const beforeError = await run(beforeCleanup, Effect.flip(Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    return yield* applyInherited(providerRequest, "installed", prepared, scriptedImports(beforeCleanup.trace, [
      { type: "failure", error: failure }
    ]))
  })))

  expect(beforeError).toBe(failure)
  expect(beforeCleanup.trace.applied).toEqual([])
  expect(beforeCleanup.trace.mutations).toEqual([])
  expect(beforeCleanup.trace.operations).toEqual([
    planOperation(cleanupRequest),
    planOperation(providerRequest),
    { type: "imports", result: "failure" }
  ])

  const afterCleanup = makeScenario([
    planningStep(cleanupRequest, cleanupPlan),
    planningStep(providerRequest, confirmedProviderPlanning),
    planningStep(providerRequest, confirmedProviderPlanning),
    planningStep(cleanupRequest, confirmedCleanupPlanning)
  ], [applyStep(cleanupPlan, removedOutcome)])
  const afterError = await run(afterCleanup, Effect.flip(Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    return yield* applyInherited(providerRequest, "installed", prepared, scriptedImports(afterCleanup.trace, [
      { type: "enabled", value: true },
      { type: "failure", error: failure }
    ]))
  })))

  expect(afterError).toBe(failure)
  expect(afterCleanup.trace.applied).toEqual([cleanupPlan])
  expect(afterCleanup.trace.mutations).toEqual(["cursor:removed"])
  expect(afterCleanup.trace.operations).toEqual([
    planOperation(cleanupRequest),
    planOperation(providerRequest),
    { type: "imports", result: true },
    applyOperation(cleanupPlan),
    planOperation(providerRequest),
    planOperation(cleanupRequest),
    { type: "imports", result: "failure" }
  ])
})

it("rejects blocked and pending preparation before any Installer apply", async () => {
  const cases: ReadonlyArray<Planning> = [
    blockedPlanning(cleanupRequest, "drift"),
    pendingPlanning(cleanupRequest)
  ]

  for (const planning of cases) {
    const scenario = makeScenario([planningStep(cleanupRequest, planning)], [])
    const error = await run(scenario, Effect.flip(prepareCursor()))

    expect(error).toBeInstanceOf(ProjectError)
    expect(scenario.trace.requests).toEqual([cleanupRequest])
    expect(scenario.trace.applied).toEqual([])
    expect(scenario.trace.mutations).toEqual([])
  }
})

it("propagates typed Installer planning and apply failures instead of returning inherited", async () => {
  const cleanupPlan = readyPlan(cleanupRequest)
  const hostFailure = new HostUnavailable({ host: "claude_code", cause: new Error("profile unavailable") })
  const planningScenario = makeScenario([
    planningStep(cleanupRequest, cleanupPlan),
    planningFailureStep(providerRequest, hostFailure)
  ], [])
  const planningError = await run(planningScenario, Effect.flip(Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    return yield* applyInherited(providerRequest, "installed", prepared, Effect.succeed(true))
  })))

  expect(planningError).toBe(hostFailure)
  expect(planningScenario.trace.requests).toEqual([cleanupRequest, providerRequest])
  expect(planningScenario.trace.applied).toEqual([])
  expect(planningScenario.trace.mutations).toEqual([])

  const applyFailure = new PlanRejected({ reason: "stale_plan" })
  const applyScenario = makeScenario([
    planningStep(cleanupRequest, cleanupPlan),
    planningStep(providerRequest, confirmedProviderPlanning)
  ], [applyFailureStep(cleanupPlan, applyFailure)])
  const applyError = await run(applyScenario, Effect.flip(Effect.gen(function*() {
    const prepared = yield* prepareCursor()
    return yield* applyInherited(providerRequest, "installed", prepared, Effect.succeed(true))
  })))

  expect(applyError).toBe(applyFailure)
  expect(applyScenario.trace.requests).toEqual([cleanupRequest, providerRequest])
  expect(applyScenario.trace.applied).toEqual([cleanupPlan])
  expect(applyScenario.trace.mutations).toEqual([])
})
