import { Match, Schema } from "effect"
import {
  Desired,
  DistributionPlanId,
  StepDescriptor,
  TargetId
} from "../../contracts/DistributionModel.ts"
import type {
  OpenInput,
  OpenResult,
  PlanSpec,
  ProgressEntry,
  ProgressRecord,
  RecordInput,
  RecordResult,
  Schedule,
  ScheduleInput,
  Summary,
  SummaryInput
} from "../../contracts/DistributionModel.ts"

const planIdEquivalent = Schema.toEquivalence(DistributionPlanId)
const desiredEquivalent = Schema.toEquivalence(Desired)
const stepEquivalent = Schema.toEquivalence(StepDescriptor)
const targetEquivalent = Schema.toEquivalence(TargetId)

const sameReviewedSteps = (plan: PlanSpec, prior: ProgressRecord): boolean =>
  plan.steps.length === prior.entries.length && plan.steps.every((step, index) => {
    const entry = prior.entries[index]
    return entry !== undefined && stepEquivalent(step, entry.step)
  })

const bindingsMatch = (plan: PlanSpec, prior: ProgressRecord): boolean =>
  planIdEquivalent(plan.id, prior.id) &&
  desiredEquivalent(plan.desired, prior.desired) &&
  sameReviewedSteps(plan, prior)

const pendingEntry = (step: StepDescriptor): ProgressEntry => ({ step, status: "pending" })

const pendingEntries = (steps: PlanSpec["steps"]): ProgressRecord["entries"] => {
  const [first, ...rest] = steps
  return [pendingEntry(first), ...rest.map(pendingEntry)]
}

export const openDistribution = (input: OpenInput): OpenResult => {
  if (input.prior !== null) {
    return bindingsMatch(input.plan, input.prior)
      ? { type: "opened", record: input.prior }
      : { type: "rejected", reason: "plan_conflict" }
  }
  return {
    type: "opened",
    record: {
      id: input.plan.id,
      desired: input.plan.desired,
      entries: pendingEntries(input.plan.steps)
    }
  }
}

const canAttempt = (status: ProgressEntry["status"]): boolean => Match.value(status).pipe(
  Match.whenOr("pending", "uncertain", "unavailable", () => true),
  Match.whenOr("installed", "removed", "unchanged", "not_applied", "blocked", () => false),
  Match.exhaustive
)

const eligible = (entry: ProgressEntry, visited: ScheduleInput["visited"]): boolean =>
  canAttempt(entry.status) && !visited.some((target) => targetEquivalent(entry.step.target, target))

export const scheduleDistribution = (input: ScheduleInput): Schedule => {
  const entry = input.record.entries.find((candidate) => eligible(candidate, input.visited))
  return entry === undefined ? { type: "idle" } : { type: "attempt", step: entry.step }
}

export const recordDistribution = (input: RecordInput): RecordResult => {
  const matchesTarget = (entry: ProgressEntry): boolean =>
    targetEquivalent(entry.step.target, input.target)
  const selected = input.record.entries.find(matchesTarget)
  if (selected === undefined) return { type: "rejected", reason: "step_missing" }
  if (!canAttempt(selected.status)) return { type: "rejected", reason: "step_terminal" }

  const update = (entry: ProgressEntry): ProgressEntry =>
    matchesTarget(entry) ? { ...entry, status: input.status } : entry
  const [first, ...rest] = input.record.entries
  const entries: ProgressRecord["entries"] = [update(first), ...rest.map(update)]
  return { type: "recorded", record: { ...input.record, entries } }
}

const satisfies = (desired: PlanSpec["desired"], status: ProgressEntry["status"]): boolean =>
  Match.value(status).pipe(
    Match.when("unchanged", () => true),
    Match.when("installed", () => Match.value(desired).pipe(
      Match.when("present", () => true),
      Match.when("absent", () => false),
      Match.exhaustive
    )),
    Match.when("removed", () => Match.value(desired).pipe(
      Match.when("present", () => false),
      Match.when("absent", () => true),
      Match.exhaustive
    )),
    Match.whenOr("pending", "not_applied", "blocked", "uncertain", "unavailable", () => false),
    Match.exhaustive
  )

export const summarizeDistribution = ({ record }: SummaryInput): Summary =>
  record.entries.every((entry) => satisfies(record.desired, entry.status)) ? "complete" : "partial"
