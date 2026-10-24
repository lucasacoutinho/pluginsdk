import { Schema } from "effect"

export const VolumeId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{16}(?![\s\S])/)
).pipe(Schema.brand("pluginsdk/FileVolumeId"))
export type VolumeId = typeof VolumeId.Type
export const FileId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{32}(?![\s\S])/)
).pipe(Schema.brand("pluginsdk/FileId"))
export type FileId = typeof FileId.Type
export const Quantity = Schema.String.check(Schema.makeFilter(
  (value) => /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/.test(value) && BigInt(value) <= 0x7fff_ffff_ffff_ffffn,
  { expected: "a canonical nonnegative signed-64-bit decimal string" }
)).pipe(Schema.brand("pluginsdk/FileQuantity"))
export type Quantity = typeof Quantity.Type
export const FinalPath = Schema.String.check(Schema.makeFilter(
  (value) => value.isWellFormed() && !value.includes("\0"),
  { expected: "a Unicode native path without NUL" }
)).pipe(Schema.brand("pluginsdk/FileFinalPath"))
export type FinalPath = typeof FinalPath.Type
export const VolumeGuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/)
).pipe(Schema.brand("pluginsdk/FileVolumeGuid"))
export type VolumeGuid = typeof VolumeGuid.Type
export const Component = Schema.NonEmptyString.check(Schema.makeFilter(
  (value) => value.isWellFormed() && value !== "." && value !== ".." && !/[\\/:\0]/.test(value),
  { expected: "a physical path component without dot, separator, stream or NUL syntax" }
)).pipe(Schema.brand("pluginsdk/FilePathComponent"))
export type Component = typeof Component.Type

export const Identity = Schema.Struct({ volume: VolumeId, file: FileId })
export type Identity = typeof Identity.Type
export const Anchor = Schema.Struct({ identity: Identity, path: FinalPath, caseSensitive: Schema.Boolean })
export type Anchor = typeof Anchor.Type
export const FileStamp = Schema.Struct({ identity: Identity, size: Quantity, modified: Quantity, changed: Quantity })
export type FileStamp = typeof FileStamp.Type
export const FileInfo = Schema.Struct({ ...FileStamp.fields, path: FinalPath })
export type FileInfo = typeof FileInfo.Type
export const Observation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unavailable") }),
  Schema.Struct({ type: Schema.Literal("directory"), anchor: Anchor }),
  Schema.Struct({ type: Schema.Literal("file"), info: FileInfo }),
  Schema.Struct({ type: Schema.Literal("other") })
]).pipe(Schema.toTaggedUnion("type"))
export type Observation = typeof Observation.Type
export const Snapshot = Schema.Struct({ root: Observation, file: Observation })
export type Snapshot = typeof Snapshot.Type
export const ReadResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("complete"), length: Quantity }),
  Schema.Struct({ type: Schema.Literal("failed") })
]).pipe(Schema.toTaggedUnion("type"))
export type ReadResult = typeof ReadResult.Type
export const ReadInput = Schema.Struct({ root: Anchor, before: Snapshot, after: Snapshot, read: ReadResult })
export type ReadInput = typeof ReadInput.Type
export const CanonicalPath = Schema.Struct({ volume: VolumeGuid, components: Schema.Array(Component) })
export type CanonicalPath = typeof CanonicalPath.Type
export const ParsedPath = Schema.Union([
  Schema.Struct({ type: Schema.Literal("plain"), path: CanonicalPath }),
  Schema.Struct({ type: Schema.Literal("stream") }),
  Schema.Struct({ type: Schema.Literal("unsupported") })
]).pipe(Schema.toTaggedUnion("type"))
export type ParsedPath = typeof ParsedPath.Type
export const ReadDecision = Schema.Literals(["accepted", "unavailable", "not_regular", "stream", "outside", "changed"])
export type ReadDecision = typeof ReadDecision.Type
export const PathInput = Schema.Struct({ path: FinalPath })
export type PathInput = typeof PathInput.Type
export const ContainmentInput = Schema.Struct({ root: CanonicalPath, file: CanonicalPath })
export type ContainmentInput = typeof ContainmentInput.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("file_path"), input: PathInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("file_containment"), input: ContainmentInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("file_read"), input: ReadInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("file_path"), output: ParsedPath }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("file_containment"), output: Schema.Boolean }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("file_read"), output: ReadDecision })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
