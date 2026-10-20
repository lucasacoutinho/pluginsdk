import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { BundleRejected, type Bundle } from "../../contracts/Compiler.ts"
import { PlanRejected, ReadyPlan, StateUnavailable, Target, type Change, type PlanRequest, type PlanChange } from "../../contracts/Installer.ts"
import { Pending } from "../../contracts/Lifecycle.ts"
import { validateBundle } from "../compiler/native.ts"
import { copyBundle, planId } from "../internal/identity.ts"
import { begin } from "../model/lifecycle.ts"
import { StoredState } from "./records.ts"
import { durableWrite, readRecord } from "./storage.ts"
import { targetPaths } from "./target.ts"

const sameTarget = Schema.toEquivalence(Target)
const samePlan = Schema.toEquivalence(ReadyPlan)
const samePending = Schema.toEquivalence(Pending)
const encodePlan = Schema.encodeSync(ReadyPlan)
const encodeState = Schema.encodeSync(StoredState)

export const modelChange = (change: PlanChange): Change => Match.value(change).pipe(
  Match.discriminatorsExhaustive("type")({
    install: (change): Change => ({ type: "install", bundle: change.bundle.digest }),
    replace: (change): Change => ({ type: "replace", bundle: change.bundle.digest }),
    remove: (): Change => ({ type: "remove" })
  })
)

const validatePlan = (plan: ReadyPlan): void => {
  if (plan.id !== planId(plan)) throw new Error("Plan commitment differs")
  if (plan.change.type !== "remove") {
    if (plan.target.plugin !== plan.change.bundle.plugin) throw new Error("Plan plugin differs from bundle")
    validateBundle(plan.change.bundle)
  }
}

export const snapshotPlan = (plan: ReadyPlan): ReadyPlan => {
  const captured = Schema.decodeSync(Schema.toType(ReadyPlan))(structuredClone(plan), { onExcessProperty: "error" })
  const change = Match.value(captured.change).pipe(Match.discriminatorsExhaustive("type")({
    install: (change): PlanChange => ({ ...change, bundle: copyBundle(change.bundle) }),
    replace: (change): PlanChange => ({ ...change, bundle: copyBundle(change.bundle) }),
    remove: (change): PlanChange => change
  }))
  const snapshot: ReadyPlan = { ...captured, change }
  validatePlan(snapshot)
  return snapshot
}

export const snapshotRequest = (request: PlanRequest): PlanRequest => {
  const destination = structuredClone(request.destination)
  return Match.value(request.intent).pipe(Match.discriminatorsExhaustive("type")({
    absent: (intent): PlanRequest => ({ destination, intent: { ...intent } }),
    present: (intent): PlanRequest => {
      const bundle = copyBundle(intent.bundle)
      validateBundle(bundle)
      return { destination, intent: { type: "present", bundle } }
    }
  }))
}

export const savePlan = Effect.fnUntraced(function*(plan: ReadyPlan) {
  const path = join(targetPaths(plan.target).plans, `${plan.id}.json`)
  const retained = yield* readRecord(plan.target.key, path, ReadyPlan)
  if (retained !== null && !samePlan(retained, plan)) return yield* new StateUnavailable({ key: plan.target.key, cause: new Error("Saved plan commitment collision or corrupt record") })
  if (retained === null) yield* durableWrite(plan.target.key, path, encodePlan(plan))
})

export const saveState = (target: Target, state: StoredState) => durableWrite(target.key, targetPaths(target).state, encodeState(state))

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
    const retained = yield* readRecord(target.key, join(targetPaths(target).plans, `${state.plan.id}.json`), ReadyPlan)
    if (retained === null || !samePlan(retained, state.plan)) return yield* new StateUnavailable({ key: target.key, cause: new Error("Pending plan is not retained intact") })
  }
  return state
})

export const rejectInvalidPlan = (): PlanRejected => new PlanRejected({ reason: "invalid_plan" })

export const rejectInvalidBundle = (cause: unknown): BundleRejected => cause instanceof BundleRejected ? cause :
  new BundleRejected({ issues: [{ type: "invalid_native_package", detail: "Bundle could not be captured and validated" }] })

export const changedBundle = (plan: ReadyPlan): Bundle | undefined => plan.change.type === "remove" ? undefined : plan.change.bundle
