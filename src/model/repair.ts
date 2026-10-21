import { Match, Schema } from "effect"
import { RepairBasis as RepairBasisSchema } from "../../contracts/Installer.ts"
import type {
  RepairBasis,
  RepairSnapshot
} from "../../contracts/Installer.ts"
import type {
  ProposalInput,
  RepairBeginInput,
  RepairBeginResult,
  RepairInspection,
  RepairPending,
  RepairProposal,
  RepairSettleInput,
  RepairSettlement,
  RepairState
} from "../../contracts/Repair.ts"

const sameRepairBasis = Schema.toEquivalence(RepairBasisSchema)

function proposalForInspection(state: RepairState, observed: RepairInspection): RepairProposal {
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      blocked: (inspection): RepairProposal => ({ type: "blocked", reason: inspection.reason }),
      recoverable: (inspection): RepairProposal => Match.value(state).pipe(
        Match.discriminatorsExhaustive("type")({
          operation_pending: (pending): RepairProposal => ({
            type: "repair",
            before: {
              interrupted: pending.plan,
              pending: pending.plan,
              observed: inspection.state
            }
          }),
          repair_pending: (pending): RepairProposal => ({
            type: "repair",
            before: {
              interrupted: pending.before.interrupted,
              pending: pending.plan,
              observed: inspection.state
            }
          }),
          complete: (): RepairProposal => ({ type: "not_pending" })
        })
      )
    })
  )
}

export function propose(input: ProposalInput): RepairProposal {
  return Match.value(input.state).pipe(
    Match.discriminatorsExhaustive("type")({
      complete: (): RepairProposal => ({ type: "not_pending" }),
      operation_pending: (): RepairProposal => proposalForInspection(input.state, input.observed),
      repair_pending: (): RepairProposal => proposalForInspection(input.state, input.observed)
    })
  )
}

function changeFor(snapshot: RepairSnapshot): "none" | "remove_marketplace" {
  return Match.value(snapshot.residual).pipe(
    Match.when("absent", (): "none" => "none"),
    Match.when("marketplace", (): "remove_marketplace" => "remove_marketplace"),
    Match.exhaustive
  )
}

function rejectFresh(input: RepairBeginInput, expectedPending: RepairBasis["pending"]): RepairBeginResult {
  if (input.before.pending !== expectedPending) return { type: "rejected", reason: "different_pending_plan" }

  return Match.value(propose({ state: input.state, observed: input.observed })).pipe(
    Match.discriminatorsExhaustive("type")({
      repair: (proposal): RepairBeginResult => sameRepairBasis(proposal.before, input.before)
        ? {
          type: "start",
          state: { type: "repair_pending", plan: input.plan, before: proposal.before },
          change: changeFor(proposal.before.observed)
        }
        : { type: "rejected", reason: "stale_plan" },
      blocked: (): RepairBeginResult => ({ type: "rejected", reason: "stale_plan" }),
      not_pending: (): RepairBeginResult => ({ type: "rejected", reason: "invalid_plan" })
    })
  )
}

function beginOperationPending(input: RepairBeginInput, state: Extract<RepairState, { type: "operation_pending" }>): RepairBeginResult {
  if (input.plan === state.plan) return { type: "rejected", reason: "invalid_plan" }
  if (input.before.interrupted !== state.plan) return { type: "rejected", reason: "stale_plan" }
  return rejectFresh(input, state.plan)
}

function beginRepairPending(input: RepairBeginInput, state: RepairPending): RepairBeginResult {
  if (input.plan === state.plan) {
    return sameRepairBasis(input.before, state.before)
      ? { type: "resume", state }
      : { type: "rejected", reason: "invalid_plan" }
  }
  if (input.plan === state.before.interrupted) return { type: "rejected", reason: "invalid_plan" }
  if (input.before.interrupted !== state.before.interrupted) return { type: "rejected", reason: "stale_plan" }
  return rejectFresh(input, state.plan)
}

function beginComplete(input: RepairBeginInput, state: Extract<RepairState, { type: "complete" }>): RepairBeginResult {
  if (input.plan !== state.plan) return { type: "rejected", reason: "invalid_plan" }
  return Match.value(input.observed).pipe(
    Match.discriminatorsExhaustive("type")({
      blocked: (): RepairBeginResult => ({ type: "rejected", reason: "stale_plan" }),
      recoverable: (inspection): RepairBeginResult => Match.value(inspection.state.residual).pipe(
        Match.when("absent", (): RepairBeginResult => ({ type: "completed" })),
        Match.when("marketplace", (): RepairBeginResult => ({ type: "rejected", reason: "stale_plan" })),
        Match.exhaustive
      )
    })
  )
}

export function beginRepair(input: RepairBeginInput): RepairBeginResult {
  return Match.value(input.state).pipe(
    Match.discriminatorsExhaustive("type")({
      operation_pending: (state): RepairBeginResult => beginOperationPending(input, state),
      repair_pending: (state): RepairBeginResult => beginRepairPending(input, state),
      complete: (state): RepairBeginResult => beginComplete(input, state)
    })
  )
}

export function settleRepair(input: RepairSettleInput): RepairSettlement {
  return Match.value(input.observed).pipe(
    Match.discriminatorsExhaustive("type")({
      blocked: (): RepairSettlement => ({ type: "uncertain", state: input.state, observed: input.observed }),
      recoverable: (inspection): RepairSettlement => Match.value(inspection.state.residual).pipe(
        Match.when("absent", (): RepairSettlement => ({
          type: "completed",
          state: { type: "complete", plan: input.state.plan }
        })),
        Match.when("marketplace", (): RepairSettlement => ({
          type: "uncertain",
          state: input.state,
          observed: input.observed
        })),
        Match.exhaustive
      )
    })
  )
}
