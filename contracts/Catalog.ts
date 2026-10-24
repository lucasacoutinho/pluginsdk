import { Schema } from "effect"
import { ContractDigest, OrganizationId, ServiceId } from "./Authorization.ts"
import { BundleDigest, Format } from "./Compiler.ts"
import { PackagePath, PluginId } from "./Plugin.ts"

export const IntegrationId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/IntegrationId"))
export type IntegrationId = typeof IntegrationId.Type
export const ReleaseId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/ReleaseId"))
export type ReleaseId = typeof ReleaseId.Type
export const CommitId = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)).pipe(Schema.brand("pluginsdk/CommitId"))
export type CommitId = typeof CommitId.Type
export const ArtifactDigest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(Schema.brand("pluginsdk/ArtifactDigest"))
export type ArtifactDigest = typeof ArtifactDigest.Type

export const ReleaseKey = Schema.Struct({ organization: OrganizationId, integration: IntegrationId, release: ReleaseId })
export type ReleaseKey = typeof ReleaseKey.Type

export const ReleaseOrigin = Schema.Union([
  Schema.Struct({ type: Schema.Literal("repository"), repository: Schema.NonEmptyString, commit: CommitId, path: Schema.Union([Schema.Literal("."), PackagePath]) }),
  Schema.Struct({ type: Schema.Literal("artifact"), location: Schema.NonEmptyString, digest: ArtifactDigest })
]).pipe(Schema.toTaggedUnion("type"))
export type ReleaseOrigin = typeof ReleaseOrigin.Type

export const FormatDigests = Schema.Struct({
  claude_code: Schema.optionalKey(BundleDigest),
  codex: Schema.optionalKey(BundleDigest)
}).check(Schema.makeFilter((packages) => Object.keys(packages).length > 0, { expected: "at least one native package digest" }))
export type FormatDigests = typeof FormatDigests.Type

export const PluginReleaseContents = Schema.Struct({ type: Schema.Literal("plugin"), plugin: PluginId, packages: FormatDigests })
export type PluginReleaseContents = typeof PluginReleaseContents.Type
export const McpReleaseContents = Schema.Struct({ type: Schema.Literal("mcp"), service: ServiceId, contract: ContractDigest })
export type McpReleaseContents = typeof McpReleaseContents.Type
export const ReleaseContents = Schema.Union([
  PluginReleaseContents,
  McpReleaseContents
]).pipe(Schema.toTaggedUnion("type"))
export type ReleaseContents = typeof ReleaseContents.Type

export const Release = Schema.Struct({ key: ReleaseKey, version: Schema.NonEmptyString, origin: ReleaseOrigin, contents: ReleaseContents })
export type Release = typeof Release.Type
export const PluginRelease = Schema.Struct({ ...Release.fields, contents: PluginReleaseContents })
export type PluginRelease = typeof PluginRelease.Type
export const McpRelease = Schema.Struct({ ...Release.fields, contents: McpReleaseContents })
export type McpRelease = typeof McpRelease.Type
export const ReleaseLedger = Schema.Array(Release)
export type ReleaseLedger = typeof ReleaseLedger.Type

export const Registration = Schema.Union([
  Schema.Struct({ type: Schema.Literal("registered"), ledger: ReleaseLedger }),
  Schema.Struct({ type: Schema.Literal("unchanged") }),
  Schema.Struct({ type: Schema.Literal("conflict") })
]).pipe(Schema.toTaggedUnion("type"))
export type Registration = typeof Registration.Type

export const ReleaseTarget = Schema.Union([
  Schema.Struct({ type: Schema.Literal("plugin"), format: Format }),
  Schema.Struct({ type: Schema.Literal("mcp") })
]).pipe(Schema.toTaggedUnion("type"))
export type ReleaseTarget = typeof ReleaseTarget.Type
export const SelectedArtifact = Schema.Union([
  Schema.Struct({ type: Schema.Literal("plugin"), plugin: PluginId, format: Format, digest: BundleDigest }),
  Schema.Struct({ type: Schema.Literal("mcp"), service: ServiceId, contract: ContractDigest })
]).pipe(Schema.toTaggedUnion("type"))
export type SelectedArtifact = typeof SelectedArtifact.Type

export const Resolution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("resolved"), release: Release, artifact: SelectedArtifact }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Schema.Literals(["release_missing", "release_conflict", "kind_mismatch", "format_unavailable"]) })
]).pipe(Schema.toTaggedUnion("type"))
export type Resolution = typeof Resolution.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("catalog_register"), input: Schema.Struct({ ledger: ReleaseLedger, release: Release }) }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("catalog_resolve"), input: Schema.Struct({ ledger: ReleaseLedger, key: ReleaseKey, target: ReleaseTarget }) })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("catalog_register"), output: Registration }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("catalog_resolve"), output: Resolution })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
