import { Context, Effect, Schema } from "effect"
import { Bundle, BundleDigest, BundleRejected } from "./Compiler.ts"
import { Directory, PluginId } from "./Plugin.ts"

export const Host = Schema.Literals(["claude_code", "codex", "grok_bot", "muse"])
export type Host = typeof Host.Type

export const Destination = Schema.Union([
  Schema.Struct({ type: Schema.Literal("user"), host: Host, home: Directory }),
  Schema.Struct({ type: Schema.Literal("project"), host: Host, home: Directory, root: Directory })
]).pipe(Schema.toTaggedUnion("type"))
export type Destination = typeof Destination.Type

export const InstallationKey = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/InstallationKey"))
export type InstallationKey = typeof InstallationKey.Type

export const PlanId = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/)
).pipe(Schema.brand("pluginsdk/PlanId"))
export type PlanId = typeof PlanId.Type

export const Fingerprint = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/)
).pipe(Schema.brand("pluginsdk/Fingerprint"))
export type Fingerprint = typeof Fingerprint.Type

export const Identity = Schema.Struct({ plan: PlanId, bundle: BundleDigest })
export type Identity = typeof Identity.Type

export const Receipt = Schema.Struct({ identity: Identity, fingerprint: Fingerprint })
export type Receipt = typeof Receipt.Type

export const Observation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({
    type: Schema.Literal("present"),
    fingerprint: Fingerprint,
    identity: Schema.NullOr(Identity)
  }),
  Schema.Struct({ type: Schema.Literal("unknown") })
]).pipe(Schema.toTaggedUnion("type"))
export type Observation = typeof Observation.Type

export const Snapshot = Schema.Struct({
  revision: Schema.NullOr(PlanId),
  receipt: Schema.NullOr(Receipt),
  observed: Observation
})
export type Snapshot = typeof Snapshot.Type

export const Desired = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("present"), bundle: BundleDigest })
]).pipe(Schema.toTaggedUnion("type"))
export type Desired = typeof Desired.Type

export const Intent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent"), plugin: PluginId }),
  Schema.Struct({ type: Schema.Literal("present"), bundle: Bundle })
]).pipe(Schema.toTaggedUnion("type"))
export type Intent = typeof Intent.Type

export const PlanRequest = Schema.Struct({ destination: Destination, intent: Intent })
export type PlanRequest = typeof PlanRequest.Type

export const Change = Schema.Union([
  Schema.Struct({ type: Schema.Literal("install"), bundle: BundleDigest }),
  Schema.Struct({ type: Schema.Literal("replace"), bundle: BundleDigest }),
  Schema.Struct({ type: Schema.Literal("remove") })
]).pipe(Schema.toTaggedUnion("type"))
export type Change = typeof Change.Type

export const PlanChange = Schema.Union([
  Schema.Struct({ type: Schema.Literal("install"), bundle: Bundle }),
  Schema.Struct({ type: Schema.Literal("replace"), bundle: Bundle }),
  Schema.Struct({ type: Schema.Literal("remove") })
]).pipe(Schema.toTaggedUnion("type"))
export type PlanChange = typeof PlanChange.Type

export const Conflict = Schema.Literals(["unowned", "drift", "unknown"])
export type Conflict = typeof Conflict.Type

export const Target = Schema.Struct({
  key: InstallationKey,
  destination: Destination,
  plugin: PluginId,
  profile: Schema.NonEmptyString,
  version: Schema.NonEmptyString
})
export type Target = typeof Target.Type

export const PlanBody = Schema.Struct({
  type: Schema.Literal("ready"),
  schema: Schema.Literal(1),
  target: Target,
  before: Snapshot,
  change: PlanChange
})
export type PlanBody = typeof PlanBody.Type

export const ReadyPlan = Schema.Struct({ ...PlanBody.fields, id: PlanId })
export type ReadyPlan = typeof ReadyPlan.Type

export const RepairSnapshot = Schema.Struct({
  fingerprint: Fingerprint,
  residual: Schema.Literals(["absent", "marketplace"])
})
export type RepairSnapshot = typeof RepairSnapshot.Type

export const RepairBasis = Schema.Struct({
  interrupted: PlanId,
  pending: PlanId,
  observed: RepairSnapshot
})
export type RepairBasis = typeof RepairBasis.Type

export const RepairPlanBody = Schema.Struct({
  type: Schema.Literal("repair_ready"),
  schema: Schema.Literal(1),
  target: Target,
  before: RepairBasis
})
export type RepairPlanBody = typeof RepairPlanBody.Type

export const RepairPlan = Schema.Struct({ ...RepairPlanBody.fields, id: PlanId })
export type RepairPlan = typeof RepairPlan.Type

export const Planning = Schema.Union([
  ReadyPlan,
  Schema.Struct({ type: Schema.Literal("unchanged"), target: Target, state: Snapshot }),
  Schema.Struct({ type: Schema.Literal("blocked"), target: Target, state: Snapshot, reason: Conflict }),
  Schema.Struct({ type: Schema.Literal("pending"), plan: ReadyPlan })
]).pipe(Schema.toTaggedUnion("type"))
export type Planning = typeof Planning.Type

export const Completion = Schema.Union([
  Schema.Struct({ type: Schema.Literal("installed"), receipt: Receipt }),
  Schema.Struct({ type: Schema.Literal("removed") }),
  Schema.Struct({ type: Schema.Literal("not_applied") })
]).pipe(Schema.toTaggedUnion("type"))
export type Completion = typeof Completion.Type

export const ApplyOutcome = Schema.Union([
  Schema.Struct({ type: Schema.Literal("completed"), result: Completion }),
  Schema.Struct({ type: Schema.Literal("uncertain"), observed: Observation })
]).pipe(Schema.toTaggedUnion("type"))
export type ApplyOutcome = typeof ApplyOutcome.Type

export class DestinationUnsupported extends Schema.TaggedError<DestinationUnsupported, { readonly brand: unique symbol }>()("DestinationUnsupported", {
  destination: Destination,
  detail: Schema.NonEmptyString
}) {}

export class HostUnavailable extends Schema.TaggedError<HostUnavailable, { readonly brand: unique symbol }>()("HostUnavailable", {
  host: Host,
  cause: Schema.Defect()
}) {}

export class StateUnavailable extends Schema.TaggedError<StateUnavailable, { readonly brand: unique symbol }>()("StateUnavailable", {
  key: InstallationKey,
  cause: Schema.Defect()
}) {}

export const PlanRejection = Schema.Literals(["invalid_plan", "stale_plan", "different_pending_plan"])
export type PlanRejection = typeof PlanRejection.Type

export class PlanRejected extends Schema.TaggedError<PlanRejected, { readonly brand: unique symbol }>()("PlanRejected", {
  reason: PlanRejection
}) {}

export class Installer extends Context.Service<Installer, {
  readonly plan: (request: PlanRequest) => Effect.Effect<
    Planning,
    BundleRejected | DestinationUnsupported | HostUnavailable | StateUnavailable
  >
  readonly apply: (plan: ReadyPlan) => Effect.Effect<
    ApplyOutcome,
    DestinationUnsupported | HostUnavailable | StateUnavailable | PlanRejected
  >
}>()("pluginsdk/Installer") {}
