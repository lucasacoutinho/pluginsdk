import { Context, Effect, Schema } from "effect"
import { Directory, EnvironmentName, HeaderName, PackagePath, Plugin, PluginId } from "./Plugin.ts"
import { PackageClient } from "./Clients.ts"

export const Format = PackageClient
export type Format = typeof Format.Type

export const Capability = Schema.Literals(["stdio", "hooks", "agents"])
export type Capability = typeof Capability.Type

export const BundleDigest = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/)
).pipe(Schema.brand("pluginsdk/BundleDigest"))
export type BundleDigest = typeof BundleDigest.Type

export const PackageFile = Schema.Struct({
  path: PackagePath,
  content: Schema.Uint8ArrayFromBase64,
  executable: Schema.Boolean
})
export type PackageFile = typeof PackageFile.Type

export const BundleBody = Schema.Struct({
  schema: Schema.Literal(1),
  plugin: PluginId,
  format: Format,
  files: Schema.NonEmptyArray(PackageFile)
})
export type BundleBody = typeof BundleBody.Type

export const Bundle = Schema.Struct({ ...BundleBody.fields, digest: BundleDigest })
export type Bundle = typeof Bundle.Type

export const BuildRequest = Schema.Struct({
  root: Directory,
  plugin: Plugin,
  format: Format
})
export type BuildRequest = typeof BuildRequest.Type

export const PathCollision = Schema.Struct({ type: Schema.Literal("path_collision"), path: PackagePath })
export type PathCollision = typeof PathCollision.Type

export const ReservedAsset = Schema.Struct({ type: Schema.Literal("reserved_asset"), path: PackagePath })
export type ReservedAsset = typeof ReservedAsset.Type

export const BundleCheckIssue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("digest_mismatch") }),
  Schema.Struct({ type: Schema.Literal("noncanonical_order") }),
  PathCollision
]).pipe(Schema.toTaggedUnion("type"))
export type BundleCheckIssue = typeof BundleCheckIssue.Type

export const BundleIssue = Schema.Union([
  ...BundleCheckIssue.members,
  Schema.Struct({ type: Schema.Literal("invalid_native_package"), detail: Schema.NonEmptyString })
]).pipe(Schema.toTaggedUnion("type"))
export type BundleIssue = typeof BundleIssue.Type

export class BundleRejected extends Schema.TaggedError<BundleRejected, { readonly brand: unique symbol }>()("BundleRejected", {
  issues: Schema.NonEmptyArray(BundleIssue)
}) {}

export const McpProblem = Schema.Union([
  Schema.Struct({ type: Schema.Literal("environment_reference"), header: HeaderName }),
  Schema.Struct({ type: Schema.Literal("literal_expansion"), header: HeaderName }),
  Schema.Struct({ type: Schema.Literal("header_collision"), header: HeaderName })
]).pipe(Schema.toTaggedUnion("type"))
export type McpProblem = typeof McpProblem.Type

export const UnsupportedMcp = Schema.Struct({
  type: Schema.Literal("unsupported_mcp"),
  server: Schema.NonEmptyString,
  reason: McpProblem
})
export type UnsupportedMcp = typeof UnsupportedMcp.Type

export const LocalMcpProblem = Schema.Union([
  Schema.Struct({ type: Schema.Literal("missing_file"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("not_executable"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("missing_directory"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("environment_reference_unsupported"), name: EnvironmentName }),
  Schema.Struct({ type: Schema.Literal("environment_collision"), name: EnvironmentName })
]).pipe(Schema.toTaggedUnion("type"))
export type LocalMcpProblem = typeof LocalMcpProblem.Type

export const BuildIssue = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("invalid_metadata"),
    field: Schema.Literals(["id", "version", "description"]),
    detail: Schema.NonEmptyString
  }),
  Schema.Struct({
    type: Schema.Literal("invalid_skill"),
    path: PackagePath,
    detail: Schema.NonEmptyString
  }),
  Schema.Struct({
    type: Schema.Literal("invalid_asset"),
    path: PackagePath,
    detail: Schema.NonEmptyString
  }),
  Schema.Struct({
    type: Schema.Literal("invalid_agent"),
    path: PackagePath,
    detail: Schema.NonEmptyString
  }),
  Schema.Struct({
    type: Schema.Literal("invalid_executable"),
    path: PackagePath,
    detail: Schema.NonEmptyString
  }),
  PathCollision,
  ReservedAsset,
  Schema.Struct({ type: Schema.Literal("source_escape"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("invalid_process"), server: Schema.NonEmptyString, reason: LocalMcpProblem }),
  Schema.Struct({ type: Schema.Literal("invalid_hook_process"), hook: Schema.NonEmptyString, reason: LocalMcpProblem }),
  UnsupportedMcp
]).pipe(Schema.toTaggedUnion("type"))
export type BuildIssue = typeof BuildIssue.Type

export class BuildRejected extends Schema.TaggedError<BuildRejected, { readonly brand: unique symbol }>()("BuildRejected", {
  issues: Schema.NonEmptyArray(BuildIssue)
}) {}

export class SourceUnavailable extends Schema.TaggedError<SourceUnavailable, { readonly brand: unique symbol }>()("SourceUnavailable", {
  root: Directory,
  cause: Schema.Defect()
}) {}

export class Compiler extends Context.Service<Compiler, {
  readonly build: (request: BuildRequest) => Effect.Effect<Bundle, BuildRejected | SourceUnavailable>
}>()("pluginsdk/Compiler") {}
