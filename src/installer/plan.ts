import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { BundleRejected, type Bundle } from "../../contracts/Compiler.ts"
import {
  PlanRejected,
  ReadyPlan,
  RepairPlan,
  ReviewedPlan,
  StateUnavailable,
  Target,
  type Change,
  type PlanId,
  type PlanRequest,
  type PlanChange
} from "../../contracts/Installer.ts"
import { RepairPending, type RepairState } from "../../contracts/Repair.ts"
import { Pending } from "../../contracts/Lifecycle.ts"
import { validateBundle } from "../compiler/native.ts"
import { copyBundle, planId } from "../internal/identity.ts"
import { begin } from "../model/lifecycle.ts"
import { beginRepair } from "../model/repair.ts"
import { StoredState } from "./records.ts"
import { durableWrite, readRecord } from "./storage.ts"
import { targetPaths } from "./target.ts"

const sameTarget = Schema.toEquivalence(Target)
const samePlan = Schema.toEquivalence(ReviewedPlan)
const samePending = Schema.toEquivalence(Pending)
const sameRepairPending = Schema.toEquivalence(RepairPending)
const encodePlan = Schema.encodeSync(ReviewedPlan)
const encodeState = Schema.encodeSync(StoredState)

export const modelChange = (change: PlanChange): Change => Match.value(change).pipe(
  Match.discriminatorsExhaustive("type")({
    install: (change): Change => ({ type: "install", bundle: change.bundle.digest }),
    replace: (change): Change => ({ type: "replace", bundle: change.bundle.digest }),
    remove: (): Change => ({ type: "remove" })
  })
)

export const validatePlan = (plan: ReviewedPlan): void => {
  if (plan.id !== planId(plan)) throw new Error("Plan commitment differs")
  Match.value(plan).pipe(Match.discriminatorsExhaustive("type")({
    ready: (plan) => {
      const bundle = changedBundle(plan)
      if (bundle === undefined) return
      if (plan.target.plugin !== bundle.plugin) throw new Error("Plan plugin differs from bundle")
      validateBundle(bundle)
    },
    repair_ready: (plan) => {
      if (plan.id === plan.before.pending || plan.id === plan.before.interrupted) {
        throw new Error("Repair plan must have a distinct identity")
      }
    }
  }))
}

export function snapshotPlan(plan: ReadyPlan): ReadyPlan
export function snapshotPlan(plan: RepairPlan): RepairPlan
export function snapshotPlan(plan: ReviewedPlan): ReviewedPlan
export function snapshotPlan(plan: ReviewedPlan): ReviewedPlan {
  const captured = Schema.decodeSync(Schema.toType(ReviewedPlan))(structuredClone(plan), { onExcessProperty: "error" })
  return Match.value(captured).pipe(Match.discriminatorsExhaustive("type")({
    ready: (captured): ReadyPlan => {
      const change = Match.value(captured.change).pipe(Match.discriminatorsExhaustive("type")({
        install: (change): PlanChange => ({ ...change, bundle: copyBundle(change.bundle) }),
        replace: (change): PlanChange => ({ ...change, bundle: copyBundle(change.bundle) }),
        remove: (change): PlanChange => change
      }))
      const snapshot: ReadyPlan = { ...captured, change }
      validatePlan(snapshot)
      return snapshot
    },
    repair_ready: (captured): RepairPlan => {
      validatePlan(captured)
      return captured
    }
  }))
}

export const snapshotRequest = (request: PlanRequest): PlanRequest => {
  const destination = structuredClone(request.destination)
  return Match.value(request.intent).pipe(Match.discriminatorsExhaustive("type")({
    absent: (intent): PlanRequest => ({ destination, intent: { ...intent } }),
    present: (intent): PlanRequest => {
      const bundle = copyBundle(intent.bundle)
      validateBundle(bundle)
      return { destination, intent: { type: "present", bundle } }
    },
    repair: (intent): PlanRequest => ({ destination, intent: { ...intent } })
  }))
}

const retainedPlanPath = (target: Target, id: PlanId): string => join(targetPaths(target).plans, `${id}.json`)

export const loadPlan = Effect.fnUntraced(function*(target: Target, id: PlanId) {
  const plan = yield* readRecord(target.key, retainedPlanPath(target, id), ReviewedPlan)
  if (plan === null) return null
  yield* Effect.try({
    try: () => {
      validatePlan(plan)
      if (plan.id !== id) throw new Error("Retained plan ID differs from its path")
      if (!sameTarget(plan.target, target)) throw new Error("Retained plan target differs")
    },
    catch: (cause) => new StateUnavailable({ key: target.key, cause })
  })
  return plan
})

export const savePlan = Effect.fnUntraced(function*(plan: ReviewedPlan) {
  const path = retainedPlanPath(plan.target, plan.id)
  const retained = yield* readRecord(plan.target.key, path, ReviewedPlan)
  if (retained !== null && !samePlan(retained, plan)) return yield* new StateUnavailable({ key: plan.target.key, cause: new Error("Saved plan commitment collision or corrupt record") })
  if (retained === null) yield* durableWrite(plan.target.key, path, encodePlan(plan))
})

export const saveState = (target: Target, state: StoredState) => durableWrite(target.key, targetPaths(target).state, encodeState(state))

const repairPredecessor = (
  original: ReadyPlan,
  pending: PlanId,
  retained: ReviewedPlan | null
): RepairState => {
  if (pending === original.id) return { type: "operation_pending", plan: original.id }
  return Match.value(retained).pipe(
    Match.when(null, () => { throw new Error("Repair predecessor is not retained") }),
    Match.discriminatorsExhaustive("type")({
      ready: () => { throw new Error("Repair predecessor is not a cleanup plan") },
      repair_ready: (plan): RepairState => {
        if (plan.id !== pending) throw new Error("Repair predecessor ID differs")
        if (plan.before.interrupted !== original.id) throw new Error("Repair predecessor binds another operation")
        return { type: "repair_pending", plan: plan.id, before: plan.before }
      }
    })
  )
}

const validateRepairState = (target: Target, state: Extract<StoredState, { type: "repair_pending" }>): void => {
  validatePlan(state.original)
  validatePlan(state.plan)
  if (!sameTarget(state.original.target, target)) throw new Error("Interrupted plan target differs")
  if (!sameTarget(state.plan.target, target)) throw new Error("Repair plan target differs")
  if (state.original.id !== state.plan.before.interrupted) throw new Error("Repair plan does not bind the interrupted plan")
}

const validateRepairPending = (state: Extract<StoredState, { type: "repair_pending" }>, predecessor: RepairState): void => {
  const result = beginRepair({
    state: predecessor,
    observed: { type: "recoverable", state: state.plan.before.observed },
    plan: state.plan.id,
    before: state.plan.before
  })
  const expected = { type: "repair_pending", plan: state.plan.id, before: state.plan.before } satisfies RepairPending
  const startsAsRetained = Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    start: (result) => sameRepairPending(result.state, expected),
    resume: () => false,
    completed: () => false,
    rejected: () => false
  }))
  if (!startsAsRetained) throw new Error("Repair pending state differs from the retained plan")
}

export const loadState = Effect.fnUntraced(function*(target: Target) {
  const state = yield* readRecord(target.key, targetPaths(target).state, StoredState)
  if (state === null) return { schema: 1, type: "idle", journal: { type: "empty", last: null } } satisfies StoredState
  if (state.type === "pending") {
    yield* Effect.try({
      try: () => {
        validatePlan(state.plan)
        if (!sameTarget(state.plan.target, target)) throw new Error("Pending target differs")
        const authorized = begin({
          journal: state.journal.previous,
          observed: state.journal.observed,
          before: state.plan.before,
          plan: state.plan.id,
          change: modelChange(state.plan.change)
        })
        if (authorized.type !== "start" || !samePending(authorized.journal, state.journal)) throw new Error("Pending journal differs from retained plan")
      },
      catch: (cause) => new StateUnavailable({ key: target.key, cause })
    })
    const retained = yield* loadPlan(target, state.plan.id)
    if (retained === null || !samePlan(retained, state.plan)) return yield* new StateUnavailable({ key: target.key, cause: new Error("Pending plan is not retained intact") })
  }
  if (state.type === "repair_pending") {
    yield* Effect.try({
      try: () => validateRepairState(target, state),
      catch: (cause) => new StateUnavailable({ key: target.key, cause })
    })
    const retainedOriginal = yield* loadPlan(target, state.original.id)
    if (retainedOriginal === null || !samePlan(retainedOriginal, state.original)) return yield* new StateUnavailable({ key: target.key, cause: new Error("Interrupted plan is not retained intact") })
    const retainedPlan = yield* loadPlan(target, state.plan.id)
    if (retainedPlan === null || !samePlan(retainedPlan, state.plan)) return yield* new StateUnavailable({ key: target.key, cause: new Error("Repair plan is not retained intact") })
    const retainedPredecessor = state.plan.before.pending === state.original.id
      ? null
      : yield* loadPlan(target, state.plan.before.pending)
    yield* Effect.try({
      try: () => validateRepairPending(state, repairPredecessor(state.original, state.plan.before.pending, retainedPredecessor)),
      catch: (cause) => new StateUnavailable({ key: target.key, cause })
    })
  }
  return state
})

export const rejectInvalidPlan = (): PlanRejected => new PlanRejected({ reason: "invalid_plan" })

export const rejectInvalidBundle = (cause: unknown): BundleRejected => cause instanceof BundleRejected ? cause :
  new BundleRejected({ issues: [{ type: "invalid_native_package", detail: "Bundle could not be captured and validated" }] })

export const changedBundle = (plan: ReviewedPlan): Bundle | undefined => Match.value(plan).pipe(Match.discriminatorsExhaustive("type")({
  ready: (plan) => Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
    install: (change) => change.bundle,
    replace: (change) => change.bundle,
    remove: () => undefined
  })),
  repair_ready: () => undefined
}))
