import { Schema } from "effect"

export const NativeLayerSource = Schema.Union([
  Schema.Struct({ type: Schema.Literal("packagedDefaults"), file: Schema.String }),
  Schema.Struct({ type: Schema.Literal("mdm"), domain: Schema.String, key: Schema.String }),
  Schema.Struct({ type: Schema.Literal("system"), file: Schema.String }),
  Schema.Struct({ type: Schema.Literal("enterpriseManaged"), id: Schema.String, name: Schema.String }),
  Schema.Struct({ type: Schema.Literal("user"), file: Schema.String, profile: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
  Schema.Struct({ type: Schema.Literal("project"), dotCodexFolder: Schema.String }),
  Schema.Struct({ type: Schema.Literal("sessionFlags") }),
  Schema.Struct({ type: Schema.Literal("legacyManagedConfigTomlFromFile"), file: Schema.String }),
  Schema.Struct({ type: Schema.Literal("legacyManagedConfigTomlFromMdm") })
]).pipe(Schema.toTaggedUnion("type"))
export type NativeLayerSource = typeof NativeLayerSource.Type

export const NativeLayer = Schema.Struct({
  name: NativeLayerSource,
  config: Schema.JsonObject,
  disabledReason: Schema.optionalKey(Schema.String)
})
export type NativeLayer = typeof NativeLayer.Type

export const NativeRoleDeclaration = Schema.Struct({
  description: Schema.NullOr(Schema.String),
  config_file: Schema.NullOr(Schema.String),
  nickname_candidates: Schema.NullOr(Schema.Array(Schema.String))
})
export type NativeRoleDeclaration = typeof NativeRoleDeclaration.Type

export const ConfigRead = Schema.Struct({
  config: Schema.JsonObject,
  origins: Schema.JsonObject,
  layers: Schema.Array(NativeLayer)
})
export type ConfigRead = typeof ConfigRead.Type
