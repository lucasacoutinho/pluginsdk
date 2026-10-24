import { Effect, Match } from "effect"
import { PlanRejected, type ApplyOutcome, type PlanId, type Planning, type RepairPlan, type RepairPlanBody, type Target } from "../../../contracts/Installer.ts"
import type { RepairInspection, RepairPending, RepairState } from "../../../contracts/Repair.ts"
import { planId } from "../../internal/identity.ts"
import { snapshot } from "../lifecycle/model.ts"
import { beginRepair, propose, settleRepair } from "./model.ts"
import { executeOnce, executionQuiescent } from "../execution/execute.ts"
import { observe } from "../lifecycle/inspect.ts"
import { loadPlan, savePlan, saveState } from "../lifecycle/plans.ts"
import type { Execution, StoredState } from "../lifecycle/records.ts"
import { inspectRepair, repairObservation, type RepairDetails } from "./inspect.ts"
import { sameCapture } from "../companions/capture.ts"

type PendingRecord = Exclude<StoredState, { readonly type: "idle" }>

const originalFor = (record: PendingRecord) => Match.value(record).pipe(Match.discriminatorsExhaustive("type")({
  pending: (record) => record.plan,
  repair_pending: (record) => record.original
}))

const pendingState = (record: PendingRecord): RepairState => Match.value(record).pipe(Match.discriminatorsExhaustive("type")({
  pending: (record): RepairState => ({ type: "operation_pending", plan: record.plan.id }),
  repair_pending: (record): RepairState => ({ type: "repair_pending", plan: record.plan.id, before: record.plan.before })
}))

const inspectPending = Effect.fnUntraced(function*(target: Target, record: PendingRecord) {
  if (yield* executionQuiescent(target, record.execution)) return yield* inspectRepair(target, originalFor(record))
  const blocked: RepairDetails = { inspection: { type: "blocked", reason: "unknown" } }
  return blocked
})

export const planRepair = Effect.fnUntraced(function*(target: Target, pending: PlanId, record: StoredState) {
  if (record.type === "idle") return { type: "unchanged", target, state: snapshot(record.journal, yield* observe(target)) } satisfies Planning
  if (record.plan.id !== pending) return { type: "pending", plan: record.plan } satisfies Planning
  const details = yield* inspectPending(target, record)
  const observed = details.inspection
  return yield* Match.value(propose({ state: pendingState(record), observed })).pipe(Match.discriminatorsExhaustive("type")({
    not_pending: () => Effect.die(new Error("A pending record produced an inactive repair proposal")),
    blocked: ({ reason }) => Effect.succeed<Planning>({ type: "blocked", target, reason, state: { revision: record.plan.id, receipt: null, observed: repairObservation(observed) } }),
    repair: ({ before }) => Effect.gen(function*() {
      const body: RepairPlanBody = { type: "repair_ready", schema: 1, target, before, ...(details.companions === undefined ? {} : { companions: details.companions }) }
      const plan: RepairPlan = { ...body, id: planId(body) }
      yield* savePlan(plan)
      return plan
    })
  }))
})

const completeRepair = Effect.fnUntraced(function*(target: Target, state: RepairPending, observed: RepairInspection) {
  return yield* Match.value(settleRepair({ state, observed })).pipe(Match.discriminatorsExhaustive("type")({
    uncertain: ({ observed }) => Effect.succeed<ApplyOutcome>({ type: "uncertain", observed: repairObservation(observed) }),
    completed: ({ state }) => Effect.gen(function*() {
      yield* saveState(target, { schema: 1, type: "idle", journal: { type: "empty", last: state.plan } })
      return { type: "completed", result: { type: "removed" } } satisfies ApplyOutcome
    })
  }))
})

export const applyRepair = Effect.fnUntraced(function*(plan: RepairPlan, record: StoredState, leases: ReadonlyArray<number>) {
  const target = plan.target
  const original = record.type === "idle" ? yield* loadPlan(target, plan.before.interrupted) : originalFor(record)
  if (original === null || original.type !== "ready") return yield* new PlanRejected({ reason: "invalid_plan" })
  if (original.id !== plan.before.interrupted) return yield* new PlanRejected({ reason: "stale_plan" })
  const state = yield* Match.value(record).pipe(Match.discriminatorsExhaustive("type")({
    pending: (record) => Effect.succeed(pendingState(record)),
    repair_pending: (record) => Effect.succeed(pendingState(record)),
    idle: ({ journal }) => Match.value(journal).pipe(Match.discriminatorsExhaustive("type")({
      empty: ({ last }) => last === null
        ? Effect.fail(new PlanRejected({ reason: "invalid_plan" }))
        : Effect.succeed<RepairState>({ type: "complete", plan: last }),
      installed: () => Effect.fail(new PlanRejected({ reason: "invalid_plan" })),
      not_applied: () => Effect.fail(new PlanRejected({ reason: "invalid_plan" }))
    }))
  }))
  const details = record.type === "idle" ? yield* inspectRepair(target, original) : yield* inspectPending(target, record)
  const observed = details.inspection
  return yield* Match.value(beginRepair({ state, observed, plan: plan.id, before: plan.before })).pipe(Match.discriminatorsExhaustive("type")({
    rejected: ({ reason }) => Effect.fail(new PlanRejected({ reason })),
    completed: () => Effect.succeed<ApplyOutcome>({ type: "completed", result: { type: "removed" } }),
    resume: ({ state }) => completeRepair(target, state, observed),
    start: (authorization) => Effect.gen(function*() {
      if (!sameCapture(details.companions, plan.companions)) return yield* new PlanRejected({ reason: "invalid_plan" })
      yield* savePlan(plan)
      let execution: Execution = { type: "prepared" }
      const persist = (next: Execution) => saveState(target, { schema: 1, type: "repair_pending", original, plan, execution: next })
      yield* persist(execution)
      yield* Match.value(authorization.change).pipe(
        Match.when("none", () => Effect.void),
        Match.whenOr("remove_marketplace", "remove_companions", "remove_marketplace_and_companions", "archive_local", () => executeOnce(plan, leases, (next) => persist(next).pipe(
          Effect.tap(() => Effect.sync(() => { execution = next }))
        )).pipe(Effect.catchTag("StateUnavailable", () => Effect.void))),
        Match.exhaustive
      )
      const after: RepairInspection = (yield* executionQuiescent(target, execution))
        ? (yield* inspectRepair(target, original)).inspection
        : { type: "blocked", reason: "unknown" }
      return yield* completeRepair(target, authorization.state, after)
    })
  }))
})
