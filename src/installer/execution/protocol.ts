import { Schema } from "effect"
import { ApplyFailure, ApplyOutcome, Planning, PlanningFailure, PlanRequest, ReviewedPlan } from "../../../contracts/Installer.ts"

export const WorkerRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("plan"), input: PlanRequest }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("apply"), input: ReviewedPlan })
]).pipe(Schema.toTaggedUnion("type"))
export type WorkerRequest = typeof WorkerRequest.Type

export const PlanReply = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("plan"), result: Schema.toCodecJson(Schema.Result(Planning, PlanningFailure))
})
export const ApplyReply = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("apply"), result: Schema.toCodecJson(Schema.Result(ApplyOutcome, ApplyFailure))
})
