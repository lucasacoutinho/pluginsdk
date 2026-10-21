import { Schema } from "effect"
import { Conflict, PlanId, PlanRejection, RepairBasis, RepairSnapshot } from "./Installer.ts"

export const RepairPending = Schema.Struct({
  type: Schema.Literal("repair_pending"),
  plan: PlanId,
  before: RepairBasis
})
export type RepairPending = typeof RepairPending.Type

export const RepairState = Schema.Union([
  Schema.Struct({ type: Schema.Literal("operation_pending"), plan: PlanId }),
  RepairPending,
  Schema.Struct({ type: Schema.Literal("complete"), plan: PlanId })
]).pipe(Schema.toTaggedUnion("type"))
export type RepairState = typeof RepairState.Type

export const RepairInspection = Schema.Union([
  Schema.Struct({ type: Schema.Literal("recoverable"), state: RepairSnapshot }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Conflict })
]).pipe(Schema.toTaggedUnion("type"))
export type RepairInspection = typeof RepairInspection.Type

export const ProposalInput = Schema.Struct({ state: RepairState, observed: RepairInspection })
export type ProposalInput = typeof ProposalInput.Type

export const RepairProposal = Schema.Union([
  Schema.Struct({ type: Schema.Literal("repair"), before: RepairBasis }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Conflict }),
  Schema.Struct({ type: Schema.Literal("not_pending") })
]).pipe(Schema.toTaggedUnion("type"))
export type RepairProposal = typeof RepairProposal.Type

export const RepairBeginInput = Schema.Struct({
  ...ProposalInput.fields,
  plan: PlanId,
  before: RepairBasis
})
export type RepairBeginInput = typeof RepairBeginInput.Type

export const RepairBeginResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("start"), state: RepairPending, change: Schema.Literals(["none", "remove_marketplace"]) }),
  Schema.Struct({ type: Schema.Literal("resume"), state: RepairPending }),
  Schema.Struct({ type: Schema.Literal("completed") }),
  Schema.Struct({ type: Schema.Literal("rejected"), reason: PlanRejection })
]).pipe(Schema.toTaggedUnion("type"))
export type RepairBeginResult = typeof RepairBeginResult.Type

export const RepairSettleInput = Schema.Struct({ state: RepairPending, observed: RepairInspection })
export type RepairSettleInput = typeof RepairSettleInput.Type

export const RepairSettlement = Schema.Union([
  Schema.Struct({ type: Schema.Literal("completed"), state: Schema.Struct({ type: Schema.Literal("complete"), plan: PlanId }) }),
  Schema.Struct({ type: Schema.Literal("uncertain"), state: RepairPending, observed: RepairInspection })
]).pipe(Schema.toTaggedUnion("type"))
export type RepairSettlement = typeof RepairSettlement.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_propose"), input: ProposalInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_begin"), input: RepairBeginInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_settle"), input: RepairSettleInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_propose"), output: RepairProposal }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_begin"), output: RepairBeginResult }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_settle"), output: RepairSettlement })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
