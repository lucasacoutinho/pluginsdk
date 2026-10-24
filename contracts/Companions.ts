import { Schema } from "effect"
import { RoleName } from "./Agents.ts"
import { FileDigest } from "./CompilerModel.ts"

export const FileIdentity = Schema.Struct({ name: RoleName, digest: FileDigest })
export type FileIdentity = typeof FileIdentity.Type

export const RoleFile = Schema.Struct({ name: RoleName, content: Schema.Uint8ArrayFromBase64 })
export type RoleFile = typeof RoleFile.Type

export const CompanionCapture = Schema.Struct({ previous: Schema.Array(RoleFile), desired: Schema.Array(RoleFile) })
export type CompanionCapture = typeof CompanionCapture.Type

export const FileObservation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("file"), digest: FileDigest }),
  Schema.Struct({ type: Schema.Literal("conflict") }),
  Schema.Struct({ type: Schema.Literal("unknown") })
]).pipe(Schema.toTaggedUnion("type"))
export type FileObservation = typeof FileObservation.Type

export const ObservedFile = Schema.Struct({ name: RoleName, observed: FileObservation })
export type ObservedFile = typeof ObservedFile.Type

export const ReviewInput = Schema.Struct({
  previous: Schema.Array(FileIdentity),
  desired: Schema.Array(FileIdentity),
  observed: Schema.Array(ObservedFile)
})
export type ReviewInput = typeof ReviewInput.Type

export const FileChange = Schema.Union([
  Schema.Struct({ type: Schema.Literal("create"), name: RoleName, after: FileDigest }),
  Schema.Struct({ type: Schema.Literal("replace"), name: RoleName, before: FileDigest, after: FileDigest }),
  Schema.Struct({ type: Schema.Literal("remove"), name: RoleName, before: FileDigest }),
  Schema.Struct({ type: Schema.Literal("keep"), name: RoleName, digest: FileDigest })
]).pipe(Schema.toTaggedUnion("type"))
export type FileChange = typeof FileChange.Type

export const CompanionReason = Schema.Literals([
  "duplicate_previous", "duplicate_desired", "observation_unavailable", "unowned", "drift", "unknown"
])
export type CompanionReason = typeof CompanionReason.Type

export const ReviewIssue = Schema.Struct({ name: RoleName, reason: CompanionReason })
export type ReviewIssue = typeof ReviewIssue.Type

export const ReviewResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), changes: Schema.Array(FileChange) }),
  Schema.Struct({ type: Schema.Literal("blocked"), issues: Schema.NonEmptyArray(ReviewIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type ReviewResult = typeof ReviewResult.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_companions"), input: ReviewInput })
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_companions"), output: ReviewResult })
export type OracleResponse = typeof OracleResponse.Type
