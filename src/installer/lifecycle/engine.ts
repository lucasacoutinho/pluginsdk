import { Effect, FileSystem, Layer, Match } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { HostUnavailable, Installer, PlanRejected, StateUnavailable, type ApplyOutcome, type Desired, type Observation, type PlanBody, type PlanChange, type PlanRequest, type Planning, type ReadyPlan, type ReviewedPlan } from "../../../contracts/Installer.ts"
import { planId } from "../../internal/identity.ts"
import { begin, decide, settle } from "./model.ts"
import { checkOtherExecutions, executeOnce, executionQuiescent } from "../execution/execute.ts"
import { observe } from "./inspect.ts"
import { changedBundle, loadState, modelChange, rejectInvalidBundle, rejectInvalidPlan, savePlan, saveState, snapshotPlan, snapshotRequest } from "./plans.ts"
import { type Execution } from "./records.ts"
import { lockTarget } from "../target/locks.ts"
import { resolveTarget } from "../target/resolve.ts"
import { sameOwnedTarget } from "../target/profiles.ts"
import { applyRepair, planRepair } from "../recovery/repair.ts"
import { captureCompanions, companionConflict, reviewCapturedCompanions, sameCapture } from "../companions/capture.ts"
import { captureProject, reviewProjectPlan } from "../project/inspect.ts"
import { checkProcessDirectories } from "../runtime/directories.ts"

export const InstallerEngineLive = Layer.effect(Installer, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

  const plan = Effect.fn("Installer.plan")(function*(input: PlanRequest) {
    const request = yield* Effect.try({ try: () => snapshotRequest(input), catch: rejectInvalidBundle })
    const plugin = request.intent.type === "present" ? request.intent.bundle.plugin : request.intent.plugin
    const bundle = request.intent.type === "present" ? request.intent.bundle : null
    const target = yield* resolveTarget(request.destination, plugin, bundle ?? undefined)
    yield* lockTarget(target)
    const lockedTarget = yield* resolveTarget(request.destination, plugin, bundle ?? undefined)
    if (!sameOwnedTarget(target, lockedTarget)) return yield* new HostUnavailable({ host: target.destination.host, cause: new Error("Physical destination changed while acquiring its lock") })
    yield* checkOtherExecutions(target)
    const record = yield* loadState(target)
    if (request.intent.type === "repair") return yield* planRepair(target, request.intent.pending, record)
    if (record.type !== "idle") return { type: "pending", plan: record.plan } satisfies Planning
    const observed = yield* observe(target)
    const desired: Desired = bundle === null ? { type: "absent" } : { type: "present", bundle: bundle.digest }
    const decision = decide({ journal: record.journal, observed, desired })
    return yield* Match.value(decision).pipe(Match.discriminatorsExhaustive("type")({
      blocked: (decision) => Effect.succeed<Planning>({ type: "blocked", target, state: decision.state, reason: decision.reason }),
      unchanged: (decision) => Effect.succeed<Planning>({ type: "unchanged", target, state: decision.state }),
      pending: () => Effect.die(new Error("Idle journal produced a pending decision")),
      change: (decision) => Effect.gen(function*() {
        const change = yield* Match.value(decision.change).pipe(Match.discriminatorsExhaustive("type")({
          remove: () => Effect.succeed<PlanChange>({ type: "remove" }),
          install: () => bundle === null ? Effect.die(new Error("Install requires a captured bundle")) : Effect.succeed<PlanChange>({ type: "install", bundle }),
          replace: () => bundle === null ? Effect.die(new Error("Replace requires a captured bundle")) : Effect.succeed<PlanChange>({ type: "replace", bundle })
        }))
        const companions = yield* captureCompanions(target, decision.before, change)
        const reviewed = yield* reviewCapturedCompanions(target, companions).pipe(
          Effect.catchTag("InspectionUnavailable", (cause) => new StateUnavailable({ key: target.key, cause }))
        )
        if (reviewed.type === "blocked") return { type: "blocked", target, state: decision.before, reason: companionConflict(reviewed) } satisfies Planning
        const project = yield* captureProject(target, decision.before)
        const body: PlanBody = { type: "ready", schema: 1, target, before: decision.before, change, ...(companions === undefined ? {} : { companions }), ...(project === undefined ? {} : { project }) }
        const ready: ReadyPlan = { ...body, id: planId(body) }
        yield* checkProcessDirectories(ready)
        const projectReview = yield* reviewProjectPlan(ready).pipe(
          Effect.catchTags({
            InspectionUnavailable: (cause) => new StateUnavailable({ key: target.key, cause }),
            HostUnavailable: (cause) => new StateUnavailable({ key: target.key, cause })
          })
        )
        if (projectReview.type === "blocked") return { type: "blocked", target, state: decision.before, reason: "drift" } satisfies Planning
        yield* savePlan(ready)
        return ready
      })
    }))
  }, Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner), Effect.scoped)

  const apply = Effect.fn("Installer.apply")(function*(input: ReviewedPlan) {
    const plan = yield* Effect.try({ try: () => snapshotPlan(input), catch: rejectInvalidPlan })
    const target = yield* resolveTarget(plan.target.destination, plan.target.plugin, changedBundle(plan))
    if (!sameOwnedTarget(target, plan.target)) return yield* new PlanRejected({ reason: "stale_plan" })
    const leases = yield* lockTarget(target)
    const lockedTarget = yield* resolveTarget(plan.target.destination, plan.target.plugin, changedBundle(plan))
    if (!sameOwnedTarget(target, lockedTarget)) return yield* new PlanRejected({ reason: "stale_plan" })
    yield* checkOtherExecutions(target)
    const record = yield* loadState(target)
    if (plan.type === "repair_ready") return yield* applyRepair(plan, record, leases)
    if (record.type === "repair_pending") return yield* new PlanRejected({ reason: "different_pending_plan" })
    const observed = record.type === "pending" && !(yield* executionQuiescent(target, record.execution))
      ? { type: "unknown" } satisfies Observation
      : yield* observe(target)
    const authorization = begin({ journal: record.journal, observed, plan: plan.id, before: plan.before, change: modelChange(plan.change) })
    return yield* Match.value(authorization).pipe(Match.discriminatorsExhaustive("type")({
      rejected: (authorization) => Effect.fail(new PlanRejected({ reason: authorization.reason })),
      completed: (authorization) => Effect.succeed<ApplyOutcome>({ type: "completed", result: authorization.result }),
      start: (authorization) => Effect.gen(function*() {
        yield* checkProcessDirectories(plan)
        const companions = yield* captureCompanions(target, plan.before, plan.change)
        if (!sameCapture(companions, plan.companions)) return yield* new PlanRejected({ reason: "invalid_plan" })
        const reviewed = yield* reviewCapturedCompanions(target, companions).pipe(
          Effect.catchTag("InspectionUnavailable", () => new PlanRejected({ reason: "stale_plan" }))
        )
        if (reviewed.type === "blocked") return yield* new PlanRejected({ reason: "stale_plan" })
        const projectReview = yield* reviewProjectPlan(plan).pipe(Effect.catchTags({
          InspectionUnavailable: () => new PlanRejected({ reason: "stale_plan" }),
          HostUnavailable: () => new PlanRejected({ reason: "stale_plan" })
        }))
        if (projectReview.type === "blocked") return yield* new PlanRejected({ reason: "stale_plan" })
        yield* savePlan(plan)
        let execution: Execution = { type: "prepared" }
        yield* saveState(target, { schema: 1, type: "pending", journal: authorization.journal, plan, execution })
        yield* executeOnce(plan, leases, (next) => saveState(target, { schema: 1, type: "pending", journal: authorization.journal, plan, execution: next }).pipe(
          Effect.tap(() => Effect.sync(() => { execution = next }))
        )).pipe(Effect.catchTag("StateUnavailable", () => Effect.void))
        const after: Observation = (yield* executionQuiescent(target, execution)) ? yield* observe(target) : { type: "unknown" }
        const settlement = settle({ journal: authorization.journal, observed: after })
        if (settlement.type === "uncertain") return { type: "uncertain", observed: settlement.observed } satisfies ApplyOutcome
        yield* saveState(target, { schema: 1, type: "idle", journal: settlement.journal })
        return { type: "completed", result: settlement.result } satisfies ApplyOutcome
      }),
      resume: (authorization) => Effect.gen(function*() {
        const settlement = settle({ journal: authorization.journal, observed })
        if (settlement.type === "uncertain") return { type: "uncertain", observed: settlement.observed } satisfies ApplyOutcome
        yield* saveState(target, { schema: 1, type: "idle", journal: settlement.journal })
        return { type: "completed", result: settlement.result } satisfies ApplyOutcome
      })
    }))
  }, Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner), Effect.scoped)

  return Installer.of({ plan, apply })
}))
