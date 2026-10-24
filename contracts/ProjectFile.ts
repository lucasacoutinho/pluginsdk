import { Schema } from "effect"
import { RuntimePlatform } from "./Compatibility.ts"
import { FileBasis, PosixFileBasis, WindowsFileBasis } from "./ProjectConfig.ts"

export const Streams = Schema.Literals(["default_only", "additional", "unavailable"])
export type Streams = typeof Streams.Type

export const Observation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  PosixFileBasis,
  Schema.Struct({ ...WindowsFileBasis.fields, streams: Streams })
]).pipe(Schema.toTaggedUnion("type"))
export type Observation = typeof Observation.Type

export const PresentSnapshot = Schema.Struct({
  observed: Schema.Union([Observation.members[1], Observation.members[2]]).pipe(Schema.toTaggedUnion("type")),
  bytes: Schema.Uint8Array
})
export type PresentSnapshot = typeof PresentSnapshot.Type

export const Snapshot = Schema.Union([
  Schema.Struct({ observed: Observation.members[0], bytes: Schema.Null }),
  PresentSnapshot
])
export type Snapshot = typeof Snapshot.Type

export const Input = Schema.Struct({ platform: RuntimePlatform, observed: Observation })
export type Input = typeof Input.Type

export const ReviewInput = Schema.Struct({ current: Input, reviewed: FileBasis })
export type ReviewInput = typeof ReviewInput.Type

export const Reason = Schema.Literals(["platform", "representation", "attributes", "streams", "changed"])
export type Reason = typeof Reason.Type

export const Decision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), basis: FileBasis }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Reason })
]).pipe(Schema.toTaggedUnion("type"))
export type Decision = typeof Decision.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("admit_project_file"), input: Input }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_project_file"), input: ReviewInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("admit_project_file"), output: Decision }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_project_file"), output: Decision })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
