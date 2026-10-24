import { Schema } from "effect"
import { FileDigest } from "./CompilerModel.ts"
import { Directory, PluginId } from "./Plugin.ts"

export const BlockKey = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(Schema.brand("pluginsdk/ProjectBlockKey"))
export type BlockKey = typeof BlockKey.Type

export const MarketplaceName = Schema.String.check(
  Schema.isPattern(/^pluginsdk-[a-f0-9]{24}$/)
).pipe(Schema.brand("pluginsdk/ProjectMarketplaceName"))
export type MarketplaceName = typeof MarketplaceName.Type

export const Registration = Schema.Struct({
  plugin: PluginId,
  marketplace: MarketplaceName,
  root: Directory.check(Schema.makeFilter(
    (root) => root.isWellFormed() && !root.includes("\0"),
    { expected: "a well-formed Unicode marketplace root without NUL" }
  ))
})
export type Registration = typeof Registration.Type

export const PosixFileBasis = Schema.Struct({
  type: Schema.Literal("file"),
  digest: FileDigest,
  mode: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0o7777 }))
})

export const WindowsFileAttributes = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff })
).pipe(Schema.brand("pluginsdk/WindowsFileAttributes"))
export type WindowsFileAttributes = typeof WindowsFileAttributes.Type

export const WindowsFileBasis = Schema.Struct({
  type: Schema.Literal("windows_file"),
  digest: FileDigest,
  attributes: WindowsFileAttributes,
  security: FileDigest
})

export const FileBasis = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  PosixFileBasis,
  WindowsFileBasis
]).pipe(Schema.toTaggedUnion("type"))
export type FileBasis = typeof FileBasis.Type

export const ProjectCapture = Schema.Struct({
  before: FileBasis,
  previous: Schema.NullOr(Registration)
})
export type ProjectCapture = typeof ProjectCapture.Type

export const Segment = Schema.Union([
  Schema.Struct({ type: Schema.Literal("external"), content: Schema.String }),
  Schema.Struct({ type: Schema.Literal("managed"), key: BlockKey, content: Schema.String })
]).pipe(Schema.toTaggedUnion("type"))
export type Segment = typeof Segment.Type

export const EditInput = Schema.Struct({
  key: BlockKey,
  previous: Schema.NullOr(Schema.String),
  desired: Schema.NullOr(Schema.String),
  document: Schema.Array(Segment)
})
export type EditInput = typeof EditInput.Type

export const EditReason = Schema.Literals(["duplicate", "unowned", "drift"])
export type EditReason = typeof EditReason.Type

export const EditResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), document: Schema.Array(Segment) }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: EditReason })
]).pipe(Schema.toTaggedUnion("type"))
export type EditResult = typeof EditResult.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("edit_project_config"), input: EditInput })
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("edit_project_config"), output: EditResult })
