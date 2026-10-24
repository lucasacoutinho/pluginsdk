import { Schema } from "effect"
import { PluginId } from "./Plugin.ts"

export const ReleaseDigest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(
  Schema.brand("pluginsdk/ReleaseDigest")
)
export type ReleaseDigest = typeof ReleaseDigest.Type

export const Publication = Schema.Struct({
  plugin: PluginId,
  version: Schema.NonEmptyString,
  digest: ReleaseDigest
})
export type Publication = typeof Publication.Type

export const PublishInput = Schema.Struct({ history: Schema.Array(Publication), desired: Publication })
export type PublishInput = typeof PublishInput.Type

export const PublishReason = Schema.Literals(["duplicate", "version_conflict"])
export type PublishReason = typeof PublishReason.Type

export const PublishResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("published"), history: Schema.Array(Publication) }),
  Schema.Struct({ type: Schema.Literal("unchanged"), history: Schema.Array(Publication) }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: PublishReason })
]).pipe(Schema.toTaggedUnion("type"))
export type PublishResult = typeof PublishResult.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("publish_release"), input: PublishInput })
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("publish_release"), output: PublishResult })
