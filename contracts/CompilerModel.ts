import { Schema } from "effect"
import { BundleCheckIssue, BundleDigest, Format, PathCollision, UnsupportedMcp } from "./Compiler.ts"
import { McpName, PackagePath, Plugin, RemoteMcp } from "./Plugin.ts"

export const FileDigest = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/)
).pipe(Schema.brand("pluginsdk/FileDigest"))
export type FileDigest = typeof FileDigest.Type

export const CapturedFile = Schema.Struct({ digest: FileDigest, executable: Schema.Boolean })
export type CapturedFile = typeof CapturedFile.Type

export const Asset = Schema.Struct({ ...CapturedFile.fields, path: PackagePath })
export type Asset = typeof Asset.Type

export const SkillName = Schema.String.check(
  Schema.isBetweenLength(1, 64),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
).pipe(Schema.brand("pluginsdk/SkillName"))
export type SkillName = typeof SkillName.Type

export const Skill = Schema.Struct({
  name: SkillName,
  entry: CapturedFile,
  assets: Schema.Array(Asset)
})
export type Skill = typeof Skill.Type

export const Metadata = Schema.Struct({
  id: Plugin.fields.id,
  version: Plugin.fields.version,
  description: Plugin.fields.description
})
export type Metadata = typeof Metadata.Type

export const RenderInput = Schema.Struct({
  format: Format,
  metadata: Metadata,
  skills: Schema.Array(Skill),
  mcp: Schema.Record(McpName, Schema.toEncoded(RemoteMcp))
})
export type RenderInput = typeof RenderInput.Type

export const RenderedFile = Schema.Union([
  Schema.Struct({ type: Schema.Literal("copy"), path: PackagePath, ...CapturedFile.fields }),
  Schema.Struct({ type: Schema.Literal("json"), path: PackagePath, value: Schema.JsonObject })
]).pipe(Schema.toTaggedUnion("type"))
export type RenderedFile = typeof RenderedFile.Type

export const RenderIssue = Schema.Union([PathCollision, UnsupportedMcp]).pipe(Schema.toTaggedUnion("type"))
export type RenderIssue = typeof RenderIssue.Type

export const RenderResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("rendered"), files: Schema.NonEmptyArray(RenderedFile) }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(RenderIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type RenderResult = typeof RenderResult.Type

export { render } from "../src/compiler/package/model.ts"

export const BundleCheckInput = Schema.Struct({
  digest: BundleDigest,
  computed: BundleDigest,
  paths: Schema.NonEmptyArray(PackagePath)
})
export type BundleCheckInput = typeof BundleCheckInput.Type

export const BundleCheckResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("valid") }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(BundleCheckIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type BundleCheckResult = typeof BundleCheckResult.Type

export { checkBundle } from "../src/compiler/package/model.ts"

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render"),
  input: RenderInput
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render"),
  output: RenderResult
})
export type OracleResponse = typeof OracleResponse.Type

export const BundleOracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("check_bundle"),
  input: BundleCheckInput
})
export type BundleOracleRequest = typeof BundleOracleRequest.Type

export const BundleOracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("check_bundle"),
  output: BundleCheckResult
})
export type BundleOracleResponse = typeof BundleOracleResponse.Type
