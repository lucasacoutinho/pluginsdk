import { Schema } from "effect"

export const ProcessId = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 0xffff_ffff })
).pipe(Schema.brand("pluginsdk/ProcessId"))
export type ProcessId = typeof ProcessId.Type

export const BootId = Schema.NonEmptyString.check(Schema.makeFilter(
  (value) => value.isWellFormed() && !value.includes("\0"),
  { expected: "a nonempty Unicode boot identity without NUL" }
)).pipe(Schema.brand("pluginsdk/BootId"))
export type BootId = typeof BootId.Type

export const JobName = Schema.String.check(
  Schema.isPattern(/^Global\\pluginsdk-[0-9a-f]{64}(?![\s\S])/)
).pipe(Schema.brand("pluginsdk/JobName"))
export type JobName = typeof JobName.Type

export const ProcessDomain = Schema.Union([
  Schema.Struct({ type: Schema.Literal("process_group"), group: ProcessId, boot: BootId }),
  Schema.Struct({ type: Schema.Literal("windows_job"), name: JobName })
]).pipe(Schema.toTaggedUnion("type"))
export type ProcessDomain = typeof ProcessDomain.Type

export const DomainObservation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unknown") }),
  Schema.Struct({ type: Schema.Literal("boot"), boot: BootId }),
  Schema.Struct({
    type: Schema.Literal("process_group"), group: ProcessId, boot: BootId,
    state: Schema.Literals(["present", "absent"])
  }),
  Schema.Struct({
    type: Schema.Literal("windows_job"), name: JobName,
    state: Schema.Literals(["active", "empty", "absent"])
  })
]).pipe(Schema.toTaggedUnion("type"))
export type DomainObservation = typeof DomainObservation.Type

export const DomainStatus = Schema.Literals(["quiescent", "active", "unknown"])
export type DomainStatus = typeof DomainStatus.Type

export const StatusInput = Schema.Struct({ domain: ProcessDomain, observed: DomainObservation })
export type StatusInput = typeof StatusInput.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("execution_domain_status"), input: StatusInput
})
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("execution_domain_status"), output: DomainStatus
})
export type OracleResponse = typeof OracleResponse.Type
