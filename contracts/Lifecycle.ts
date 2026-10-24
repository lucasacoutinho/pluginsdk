import { Schema } from "effect"
import {
  Change,
  Completion,
  Conflict,
  Desired,
  Observation,
  PlanId,
  PlanRejection,
  Receipt,
  Snapshot
} from "./Installer.ts"

export const Idle = Schema.Union([
  Schema.Struct({ type: Schema.Literal("empty"), last: Schema.NullOr(PlanId) }),
  Schema.Struct({ type: Schema.Literal("installed"), receipt: Receipt }),
  Schema.Struct({
    type: Schema.Literal("not_applied"),
    plan: PlanId,
    change: Change,
    state: Snapshot
  })
]).pipe(Schema.toTaggedUnion("type"))
export type Idle = typeof Idle.Type

export const Pending = Schema.Struct({
  type: Schema.Literal("pending"),
  plan: PlanId,
  previous: Idle,
  observed: Observation,
  change: Change
})
export type Pending = typeof Pending.Type

export const Journal = Schema.Union([Idle, Pending]).pipe(Schema.toTaggedUnion("type"))
export type Journal = typeof Journal.Type

export const Decision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("change"), change: Change, before: Snapshot }),
  Schema.Struct({ type: Schema.Literal("unchanged"), state: Snapshot }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Conflict, state: Snapshot }),
  Schema.Struct({ type: Schema.Literal("pending"), plan: PlanId })
]).pipe(Schema.toTaggedUnion("type"))
export type Decision = typeof Decision.Type

export const PlanningInput = Schema.Struct({ journal: Journal, observed: Observation, desired: Desired })
export type PlanningInput = typeof PlanningInput.Type

export const BeginInput = Schema.Struct({
  journal: Journal,
  observed: Observation,
  plan: PlanId,
  before: Snapshot,
  change: Change
})
export type BeginInput = typeof BeginInput.Type

export const BeginResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("start"), journal: Pending }),
  Schema.Struct({ type: Schema.Literal("resume"), journal: Pending }),
  Schema.Struct({ type: Schema.Literal("completed"), result: Completion }),
  Schema.Struct({
    type: Schema.Literal("rejected"),
    reason: PlanRejection
  })
]).pipe(Schema.toTaggedUnion("type"))
export type BeginResult = typeof BeginResult.Type

export const SettleInput = Schema.Struct({ journal: Pending, observed: Observation })
export type SettleInput = typeof SettleInput.Type

export const Settlement = Schema.Union([
  Schema.Struct({ type: Schema.Literal("completed"), journal: Idle, result: Completion }),
  Schema.Struct({ type: Schema.Literal("uncertain"), journal: Pending, observed: Observation })
]).pipe(Schema.toTaggedUnion("type"))
export type Settlement = typeof Settlement.Type

export { decide, begin, settle } from "../src/installer/lifecycle/model.ts"

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("decide"), input: PlanningInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("begin"), input: BeginInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("settle"), input: SettleInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("decide"), output: Decision }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("begin"), output: BeginResult }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("settle"), output: Settlement })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
