import { Context, Effect, Schema } from "effect"
import { PackageSetIssue } from "./Artifacts.ts"
import { McpRelease, PluginRelease, Release, ReleaseKey, ReleaseOrigin, ReleaseTarget, Resolution } from "./Catalog.ts"
import { Bundle, BundleRejected } from "./Compiler.ts"
import { Directory } from "./Plugin.ts"
import { ContractRejected, McpContract } from "./ToolContract.ts"

export { McpRelease, PluginRelease, Release, ReleaseKey, ReleaseTarget } from "./Catalog.ts"
export { ContractRejected, McpContract, McpProtocol, McpTool } from "./ToolContract.ts"

export const ArtifactRelease = Schema.Struct({ ...Release.fields, origin: ReleaseOrigin.members[1] })
export type ArtifactRelease = typeof ArtifactRelease.Type
export const ArtifactPluginRelease = Schema.Struct({ ...PluginRelease.fields, origin: ReleaseOrigin.members[1] })
export type ArtifactPluginRelease = typeof ArtifactPluginRelease.Type
export const ArtifactMcpRelease = Schema.Struct({ ...McpRelease.fields, origin: ReleaseOrigin.members[1] })
export type ArtifactMcpRelease = typeof ArtifactMcpRelease.Type
export const PackageArchive = Schema.Struct({ schema: Schema.Literal(1), bundles: Schema.NonEmptyArray(Bundle) })
export type PackageArchive = typeof PackageArchive.Type
export const McpArchive = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("mcp"), contract: McpContract })
export type McpArchive = typeof McpArchive.Type

export const PluginAdmissionRequest = Schema.Struct({ type: Schema.Literal("plugin"), release: PluginRelease, bundles: Schema.Array(Bundle) })
export type PluginAdmissionRequest = typeof PluginAdmissionRequest.Type
export const McpAdmissionRequest = Schema.Struct({ type: Schema.Literal("mcp"), release: McpRelease, contract: McpContract })
export type McpAdmissionRequest = typeof McpAdmissionRequest.Type
export const AdmissionRequest = Schema.Union([PluginAdmissionRequest, McpAdmissionRequest]).pipe(Schema.toTaggedUnion("type"))
export type AdmissionRequest = typeof AdmissionRequest.Type
export const Admission = Schema.Struct({ type: Schema.Literals(["admitted", "unchanged", "conflict"]) })
export type Admission = typeof Admission.Type
export const AcquisitionRequest = Schema.Struct({ key: ReleaseKey, target: ReleaseTarget })
export type AcquisitionRequest = typeof AcquisitionRequest.Type
export const Acquisition = Schema.Union([
  Schema.Struct({ type: Schema.Literal("plugin"), release: PluginRelease, bundle: Bundle }),
  Schema.Struct({ type: Schema.Literal("mcp"), release: McpRelease, contract: McpContract }),
  Resolution.members[1]
]).pipe(Schema.toTaggedUnion("type"))
export type Acquisition = typeof Acquisition.Type

export class CatalogUnavailable extends Schema.TaggedError<CatalogUnavailable, { readonly brand: unique symbol }>()("CatalogUnavailable", {
  directory: Directory,
  cause: Schema.Defect()
}) {}
export class CatalogInputRejected extends Schema.TaggedError<CatalogInputRejected, { readonly brand: unique symbol }>()("CatalogInputRejected", {
  cause: Schema.Defect()
}) {}
export class PackageSetRejected extends Schema.TaggedError<PackageSetRejected, { readonly brand: unique symbol }>()("PackageSetRejected", {
  issues: Schema.NonEmptyArray(PackageSetIssue)
}) {}
export class ArtifactUnavailable extends Schema.TaggedError<ArtifactUnavailable, { readonly brand: unique symbol }>()("ArtifactUnavailable", {
  location: Schema.NonEmptyString,
  cause: Schema.Defect()
}) {}
export class ArtifactRejected extends Schema.TaggedError<ArtifactRejected, { readonly brand: unique symbol }>()("ArtifactRejected", {
  reason: Schema.Literals(["digest_mismatch", "invalid_archive", "too_large"])
}) {}

export class ReleaseCatalog extends Context.Service<ReleaseCatalog, {
  readonly initialize: Effect.Effect<void, CatalogUnavailable>
  readonly admit: (request: AdmissionRequest) => Effect.Effect<Admission, CatalogUnavailable | CatalogInputRejected | PackageSetRejected | BundleRejected | ContractRejected>
  readonly import: (release: ArtifactRelease) => Effect.Effect<Admission, CatalogUnavailable | CatalogInputRejected | PackageSetRejected | BundleRejected | ContractRejected | ArtifactUnavailable | ArtifactRejected>
  readonly acquire: (request: AcquisitionRequest) => Effect.Effect<Acquisition, CatalogUnavailable | CatalogInputRejected>
}>()("pluginsdk/ReleaseCatalog") {}
