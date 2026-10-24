import { Schema } from "effect"
import { FileDigest } from "./CompilerModel.ts"
import { PackagePath } from "./Plugin.ts"

export const PermissionBits = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 0o777 })
).pipe(Schema.brand("pluginsdk/PermissionBits"))
export type PermissionBits = typeof PermissionBits.Type

export const ModeObservation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("posix"), before: PermissionBits, after: PermissionBits }),
  Schema.Struct({ type: Schema.Literal("unrepresented") }),
  Schema.Struct({ type: Schema.Literal("unavailable") })
]).pipe(Schema.toTaggedUnion("type"))
export type ModeObservation = typeof ModeObservation.Type

export const FileIntent = Schema.Struct({ path: PackagePath, executable: Schema.Boolean })
export type FileIntent = typeof FileIntent.Type
export const NativeFile = Schema.Struct({ path: PackagePath, mode: ModeObservation })
export type NativeFile = typeof NativeFile.Type

export const SourceInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("filesystem"), files: Schema.Array(NativeFile) }),
  Schema.Struct({ type: Schema.Literal("declared"), files: Schema.Array(PackagePath), executables: Schema.Array(PackagePath) })
]).pipe(Schema.toTaggedUnion("type"))
export type SourceInput = typeof SourceInput.Type

export const NativeReason = Schema.Literals(["unavailable", "unrepresented", "changed"])
export type NativeReason = typeof NativeReason.Type
export const NativeResolution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("resolved"), executable: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("refused"), reason: NativeReason })
]).pipe(Schema.toTaggedUnion("type"))
export type NativeResolution = typeof NativeResolution.Type

export const SourceReason = Schema.Literals([
  "duplicate_file", "duplicate_declaration", "missing_file", "unavailable", "unrepresented", "changed"
])
export type SourceReason = typeof SourceReason.Type
export const SourceResolution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("resolved"), files: Schema.Array(FileIntent) }),
  Schema.Struct({ type: Schema.Literal("refused"), reason: SourceReason, path: PackagePath })
]).pipe(Schema.toTaggedUnion("type"))
export type SourceResolution = typeof SourceResolution.Type

export const RetainedFile = Schema.Struct({ ...FileIntent.fields, digest: FileDigest })
export type RetainedFile = typeof RetainedFile.Type
export const ObservedFile = Schema.Struct({ ...NativeFile.fields, digest: FileDigest })
export type ObservedFile = typeof ObservedFile.Type
export const PayloadInput = Schema.Struct({ retained: RetainedFile, observed: ObservedFile })
export type PayloadInput = typeof PayloadInput.Type
export const PayloadReason = Schema.Literals(["path", "content", "unavailable", "changed", "intent"])
export type PayloadReason = typeof PayloadReason.Type
export const PayloadResolution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("resolved"), executable: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("refused"), reason: PayloadReason })
]).pipe(Schema.toTaggedUnion("type"))
export type PayloadResolution = typeof PayloadResolution.Type

export const StageInput = Schema.Struct({ current: PermissionBits, executable: Schema.Boolean })
export type StageInput = typeof StageInput.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("source_intent"), input: SourceInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("payload_intent"), input: PayloadInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("stage_permissions"), input: StageInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("source_intent"), output: SourceResolution }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("payload_intent"), output: PayloadResolution }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("stage_permissions"), output: PermissionBits })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
