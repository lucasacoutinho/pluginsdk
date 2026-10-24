import { Schema } from "effect"
import { Format } from "./Compiler.ts"
import { Host } from "./Installer.ts"

const identityText = Schema.NonEmptyString.check(Schema.makeFilter((value) => value.isWellFormed(), {
  expected: "a nonempty Unicode native profile identity"
}))
export const RuntimePlatform = identityText.pipe(Schema.brand("pluginsdk/RuntimePlatform"))
export type RuntimePlatform = typeof RuntimePlatform.Type
export const RuntimeVersion = identityText.pipe(Schema.brand("pluginsdk/RuntimeVersion"))
export type RuntimeVersion = typeof RuntimeVersion.Type
export const AdapterRevision = identityText.pipe(Schema.brand("pluginsdk/AdapterRevision"))
export type AdapterRevision = typeof AdapterRevision.Type
export const Scope = Schema.Literals(["user", "project"])
export type Scope = typeof Scope.Type

export const ProfileIdentity = Schema.Struct({
  host: Host,
  platform: RuntimePlatform,
  version: RuntimeVersion,
  scope: Scope,
  revision: AdapterRevision
})
export type ProfileIdentity = typeof ProfileIdentity.Type
export const NativeProfile = Schema.Struct({
  ...ProfileIdentity.fields,
  formats: Schema.NonEmptyArray(Format)
})
export type NativeProfile = typeof NativeProfile.Type
export const ProfileQuery = Schema.Struct({
  host: Host,
  platform: RuntimePlatform,
  version: RuntimeVersion,
  scope: Scope,
  format: Schema.NullOr(Format)
})
export type ProfileQuery = typeof ProfileQuery.Type
export const SelectionInput = Schema.Struct({ query: ProfileQuery, profiles: Schema.Array(NativeProfile) })
export type SelectionInput = typeof SelectionInput.Type
export const Selection = Schema.Union([
  Schema.Struct({ type: Schema.Literal("selected"), profile: NativeProfile }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Schema.Literals(["unqualified", "ambiguous"]) })
]).pipe(Schema.toTaggedUnion("type"))
export type Selection = typeof Selection.Type
export const OwnershipInput = Schema.Struct({
  current: ProfileIdentity,
  retained: ProfileIdentity,
  profiles: Schema.Array(NativeProfile)
})
export type OwnershipInput = typeof OwnershipInput.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("select_native_profile"), input: SelectionInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("native_ownership_compatible"), input: OwnershipInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("select_native_profile"), output: Selection }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("native_ownership_compatible"), output: Schema.Boolean })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
