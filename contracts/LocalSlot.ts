import { Schema } from "effect"
import { Fingerprint, Identity, InstallationKey } from "./Installer.ts"

export const Owner = InstallationKey.check(Schema.makeFilter((value) => value.isWellFormed(), {
  expected: "a nonempty Unicode installation key"
}))
export type Owner = typeof Owner.Type

export const Claim = Schema.Struct({ owner: Owner, identity: Identity })
export type Claim = typeof Claim.Type

export const Observation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("unknown") }),
  Schema.Struct({ type: Schema.Literal("foreign"), basis: Fingerprint }),
  Schema.Struct({ type: Schema.Literal("complete"), ...Claim.fields, basis: Fingerprint }),
  Schema.Struct({ type: Schema.Literal("partial"), ...Claim.fields, basis: Fingerprint })
]).pipe(Schema.toTaggedUnion("type"))
export type Observation = typeof Observation.Type

export const Slots = Schema.Struct({ live: Observation, staged: Observation, retired: Observation })
export type Slots = typeof Slots.Type

export const Operation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("install"), next: Identity }),
  Schema.Struct({ type: Schema.Literal("replace"), previous: Identity, next: Identity }),
  Schema.Struct({ type: Schema.Literal("remove"), previous: Identity })
]).pipe(Schema.toTaggedUnion("type"))
export type Operation = typeof Operation.Type

export const Input = Schema.Struct({ owner: Owner, operation: Operation, slots: Slots })
export type Input = typeof Input.Type

export const Action = Schema.Literals(["prepare", "discard_stage", "retire", "publish", "discard_retired"])
export type Action = typeof Action.Type

export const Reason = Schema.Literals(["unknown", "unowned", "operation", "drift", "state"])
export type Reason = typeof Reason.Type

export const Decision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("complete") }),
  Schema.Struct({ type: Schema.Literal("step"), action: Action }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Reason })
]).pipe(Schema.toTaggedUnion("type"))
export type Decision = typeof Decision.Type

export const Role = Schema.Literals(["live", "staged", "retired"])
export type Role = typeof Role.Type

export const CleanupDecision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("complete") }),
  Schema.Struct({ type: Schema.Literal("step"), role: Role }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Reason })
]).pipe(Schema.toTaggedUnion("type"))
export type CleanupDecision = typeof CleanupDecision.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("advance_local_slot"), input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("advance_local_slot"), output: Decision
})
export type OracleResponse = typeof OracleResponse.Type

export const CleanupRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("cleanup_local_slots"), input: Input
})
export type CleanupRequest = typeof CleanupRequest.Type

export const CleanupResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("cleanup_local_slots"), output: CleanupDecision
})
export type CleanupResponse = typeof CleanupResponse.Type
