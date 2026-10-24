import { Schema } from "effect"
import { Format } from "./Compiler.ts"
import { InstallationKey } from "./Installer.ts"
import { LocalClient } from "./Clients.ts"

export const LocalHost = LocalClient
export type LocalHost = typeof LocalHost.Type
export const TargetId = Schema.NonEmptyString.check(Schema.makeFilter((value) => value.isWellFormed(), {
  expected: "a nonempty Unicode distribution target label"
})).pipe(Schema.brand("pluginsdk/DistributionTargetId"))
export type TargetId = typeof TargetId.Type
export const StepDigest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(Schema.brand("pluginsdk/DistributionStepDigest"))
export type StepDigest = typeof StepDigest.Type
export const DistributionPlanId = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(Schema.brand("pluginsdk/DistributionPlanId"))
export type DistributionPlanId = typeof DistributionPlanId.Type
export const Desired = Schema.Literals(["present", "absent"])
export type Desired = typeof Desired.Type

export const SelectionInput = Schema.Struct({ host: LocalHost, formats: Schema.Array(Format) })
export type SelectionInput = typeof SelectionInput.Type
export const Selection = Schema.Union([
  Schema.Struct({ type: Schema.Literal("selected"), format: Format }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Schema.Literals(["unavailable", "ambiguous"]) })
]).pipe(Schema.toTaggedUnion("type"))
export type Selection = typeof Selection.Type

export const PlanningFailure = Schema.Literals([
  "wrong_organization", "workspace_unqualified", "mcp_registration_unqualified", "release_unavailable", "release_mismatch",
  "package_unavailable", "package_ambiguous", "package_rejected", "destination_unsupported", "host_unavailable",
  "installation_unavailable", "pending_operation", "unowned", "drift", "unknown"
])
export type PlanningFailure = typeof PlanningFailure.Type
export const StepDescriptor = Schema.Struct({ target: TargetId, installation: InstallationKey, digest: StepDigest })
export type StepDescriptor = typeof StepDescriptor.Type
export const Candidate = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), step: StepDescriptor }),
  Schema.Struct({ type: Schema.Literal("blocked"), target: TargetId, reason: PlanningFailure })
]).pipe(Schema.toTaggedUnion("type"))
export type Candidate = typeof Candidate.Type
export const PlanningIssue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("blocked"), target: TargetId, reason: PlanningFailure }),
  Schema.Struct({ type: Schema.Literal("duplicate_target"), target: TargetId }),
  Schema.Struct({ type: Schema.Literal("duplicate_installation"), installation: InstallationKey })
]).pipe(Schema.toTaggedUnion("type"))
export type PlanningIssue = typeof PlanningIssue.Type
export const NormalizationInput = Schema.Struct({ candidates: Schema.NonEmptyArray(Candidate) })
export type NormalizationInput = typeof NormalizationInput.Type
export const Normalization = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), steps: Schema.NonEmptyArray(StepDescriptor) }),
  Schema.Struct({ type: Schema.Literal("blocked"), issues: Schema.NonEmptyArray(PlanningIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type Normalization = typeof Normalization.Type

export const ProgressStatus = Schema.Literals(["pending", "installed", "removed", "unchanged", "not_applied", "blocked", "uncertain", "unavailable"])
export type ProgressStatus = typeof ProgressStatus.Type
export const AttemptStatus = ProgressStatus.pick(["installed", "removed", "unchanged", "not_applied", "blocked", "uncertain", "unavailable"])
export type AttemptStatus = typeof AttemptStatus.Type
export const PlanSpec = Schema.Struct({ id: DistributionPlanId, desired: Desired, steps: Schema.NonEmptyArray(StepDescriptor) })
export type PlanSpec = typeof PlanSpec.Type
export const ProgressEntry = Schema.Struct({ step: StepDescriptor, status: ProgressStatus })
export type ProgressEntry = typeof ProgressEntry.Type
export const ProgressRecord = Schema.Struct({ id: DistributionPlanId, desired: Desired, entries: Schema.NonEmptyArray(ProgressEntry) })
export type ProgressRecord = typeof ProgressRecord.Type
export const OpenInput = Schema.Struct({ plan: PlanSpec, prior: Schema.NullOr(ProgressRecord) })
export type OpenInput = typeof OpenInput.Type
export const OpenResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("opened"), record: ProgressRecord }),
  Schema.Struct({ type: Schema.Literal("rejected"), reason: Schema.Literal("plan_conflict") })
]).pipe(Schema.toTaggedUnion("type"))
export type OpenResult = typeof OpenResult.Type
export const ScheduleInput = Schema.Struct({ record: ProgressRecord, visited: Schema.Array(TargetId) })
export type ScheduleInput = typeof ScheduleInput.Type
export const Schedule = Schema.Union([
  Schema.Struct({ type: Schema.Literal("attempt"), step: StepDescriptor }),
  Schema.Struct({ type: Schema.Literal("idle") })
]).pipe(Schema.toTaggedUnion("type"))
export type Schedule = typeof Schedule.Type
export const RecordInput = Schema.Struct({ record: ProgressRecord, target: TargetId, status: AttemptStatus })
export type RecordInput = typeof RecordInput.Type
export const RecordResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("recorded"), record: ProgressRecord }),
  Schema.Struct({ type: Schema.Literal("rejected"), reason: Schema.Literals(["step_missing", "step_terminal"]) })
]).pipe(Schema.toTaggedUnion("type"))
export type RecordResult = typeof RecordResult.Type
export const SummaryInput = Schema.Struct({ record: ProgressRecord })
export type SummaryInput = typeof SummaryInput.Type
export const Summary = Schema.Literals(["complete", "partial"])
export type Summary = typeof Summary.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("select_distribution_format"), input: SelectionInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("normalize_distribution"), input: NormalizationInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("open_distribution"), input: OpenInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("schedule_distribution"), input: ScheduleInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("record_distribution"), input: RecordInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("summarize_distribution"), input: SummaryInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("select_distribution_format"), output: Selection }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("normalize_distribution"), output: Normalization }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("open_distribution"), output: OpenResult }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("schedule_distribution"), output: Schedule }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("record_distribution"), output: RecordResult }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("summarize_distribution"), output: Summary })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
