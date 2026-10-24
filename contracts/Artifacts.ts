import { Schema } from "effect"
import { FormatDigests } from "./Catalog.ts"
import { BundleDigest, Format } from "./Compiler.ts"
import { PluginId } from "./Plugin.ts"

export const PackageDescriptor = Schema.Struct({
  plugin: PluginId,
  format: Format,
  version: Schema.NonEmptyString,
  digest: BundleDigest
})
export type PackageDescriptor = typeof PackageDescriptor.Type

export const PackageSetInput = Schema.Struct({
  plugin: PluginId,
  version: Schema.NonEmptyString,
  packages: FormatDigests,
  artifacts: Schema.Array(PackageDescriptor)
})
export type PackageSetInput = typeof PackageSetInput.Type

export const PackageSetIssue = Schema.Struct({
  type: Schema.Literals([
    "missing_package", "unexpected_package", "duplicate_package",
    "plugin_mismatch", "version_mismatch", "digest_mismatch"
  ]),
  format: Format
})
export type PackageSetIssue = typeof PackageSetIssue.Type

export const PackageSetResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("accepted") }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(PackageSetIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type PackageSetResult = typeof PackageSetResult.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("check_packages"), input: PackageSetInput
})
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("check_packages"), output: PackageSetResult
})
export type OracleResponse = typeof OracleResponse.Type
