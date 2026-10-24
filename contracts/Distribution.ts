import { Context, Effect, Schema } from "effect"
import { OrganizationId } from "./Authorization.ts"
import { Release } from "./Catalog.ts"
import { Desired, DistributionPlanId, LocalHost, PlanningIssue, StepDescriptor, Summary, TargetId } from "./DistributionModel.ts"
import { Completion, Destination, Intent, Observation, ReadyPlan as InstallationPlan, Snapshot, Target } from "./Installer.ts"
import { Directory } from "./Plugin.ts"
import type { ReleaseCatalog } from "./Registry.ts"

export { Desired, DistributionPlanId, PlanningIssue, TargetId } from "./DistributionModel.ts"

export const LocalDestination = Schema.Union([
  Schema.Struct({ ...Destination.members[0].fields, host: LocalHost }),
  Schema.Struct({ ...Destination.members[1].fields, host: LocalHost })
]).pipe(Schema.toTaggedUnion("type"))
export type LocalDestination = typeof LocalDestination.Type
export const WorkspaceId = Schema.NonEmptyString.check(Schema.makeFilter((value) => value.isWellFormed(), {
  expected: "a nonempty Unicode workspace identity"
})).pipe(Schema.brand("pluginsdk/WorkspaceId"))
export type WorkspaceId = typeof WorkspaceId.Type
export const WorkspaceSurface = Schema.Literals([
  "claude_code", "claude_desktop", "claude_web", "codex", "chatgpt", "cursor", "grok_bot", "muse"
])
export type WorkspaceSurface = typeof WorkspaceSurface.Type
export const DistributionTarget = Schema.Union([
  Schema.Struct({ type: Schema.Literal("local"), id: TargetId, destination: LocalDestination }),
  Schema.Struct({ type: Schema.Literal("workspace"), id: TargetId, organization: OrganizationId, workspace: WorkspaceId, surface: WorkspaceSurface })
]).pipe(Schema.toTaggedUnion("type"))
export type DistributionTarget = typeof DistributionTarget.Type
export const Request = Schema.Struct({ desired: Desired, targets: Schema.NonEmptyArray(DistributionTarget) })
export type Request = typeof Request.Type
export const PlanRequest = Schema.Struct({ release: Release, ...Request.fields })
export type PlanRequest = typeof PlanRequest.Type

export const NativeIntent = Schema.Union([Intent.members[0], Intent.members[1]]).pipe(Schema.toTaggedUnion("type"))
export type NativeIntent = typeof NativeIntent.Type
export const Operation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("apply"), plan: InstallationPlan }),
  Schema.Struct({ type: Schema.Literal("verify"), target: Target, before: Snapshot, intent: NativeIntent })
]).pipe(Schema.toTaggedUnion("type"))
export type Operation = typeof Operation.Type
export const Step = Schema.Struct({ target: TargetId, operation: Operation })
export type Step = typeof Step.Type
export const PlanBody = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("ready"), desired: Desired, release: Release, steps: Schema.NonEmptyArray(Step)
})
export type PlanBody = typeof PlanBody.Type
export const ReadyPlan = Schema.Struct({ ...PlanBody.fields, id: DistributionPlanId })
export type ReadyPlan = typeof ReadyPlan.Type
export const Planning = Schema.Union([
  ReadyPlan,
  Schema.Struct({ type: Schema.Literal("blocked"), issues: Schema.NonEmptyArray(PlanningIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type Planning = typeof Planning.Type

export const Outcome = Schema.Union([
  Schema.Struct({ type: Schema.Literal("pending") }),
  ...Completion.members,
  Schema.Struct({ type: Schema.Literal("unchanged"), state: Snapshot }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Schema.Literals([
    "invalid_plan", "stale_plan", "different_pending_plan", "basis_changed", "destination_unsupported"
  ]) }),
  Schema.Struct({ type: Schema.Literal("uncertain"), observed: Observation }),
  Schema.Struct({ type: Schema.Literal("unavailable"), reason: Schema.Literals(["host_unavailable", "installation_unavailable"]) })
]).pipe(Schema.toTaggedUnion("type"))
export type Outcome = typeof Outcome.Type
export const DestinationResult = Schema.Struct({ step: StepDescriptor, outcome: Outcome })
export type DestinationResult = typeof DestinationResult.Type
export const ExecutionRecord = Schema.Struct({
  schema: Schema.Literal(1), id: DistributionPlanId, desired: Desired, entries: Schema.NonEmptyArray(DestinationResult)
})
export type ExecutionRecord = typeof ExecutionRecord.Type
export const ExecutionResult = Schema.Struct({ type: Summary, record: ExecutionRecord })
export type ExecutionResult = typeof ExecutionResult.Type

export class DistributionInputRejected extends Schema.TaggedError<DistributionInputRejected, { readonly brand: unique symbol }>()("DistributionInputRejected", {
  cause: Schema.Defect()
}) {}
export class DistributionRejected extends Schema.TaggedError<DistributionRejected, { readonly brand: unique symbol }>()("DistributionRejected", {
  reason: Schema.Literals(["invalid_plan", "plan_conflict"])
}) {}
export class DistributionUnavailable extends Schema.TaggedError<DistributionUnavailable, { readonly brand: unique symbol }>()("DistributionUnavailable", {
  directory: Directory, cause: Schema.Defect()
}) {}

export class Distribution extends Context.Service<Distribution, {
  readonly plan: (request: PlanRequest) => Effect.Effect<Planning, DistributionInputRejected, ReleaseCatalog>
  readonly apply: (plan: ReadyPlan, state: Directory) => Effect.Effect<ExecutionResult, DistributionRejected | DistributionUnavailable>
}>()("pluginsdk/Distribution") {}
