import { Schema } from "effect"
import { LocalClient } from "./Clients.ts"
import { InheritedPreviewClient, LocalPreviewStatus } from "./Project.ts"

export const Desired = Schema.Literals(["present", "absent"])
export type Desired = typeof Desired.Type

export const Provider = Schema.Literals(["none", "qualified", "unqualified"])
export type Provider = typeof Provider.Type

export const RouteInput = Schema.Struct({ client: LocalClient, desired: Desired, provider: Provider })
export type RouteInput = typeof RouteInput.Type

export const Route = Schema.Union([
  Schema.Struct({ type: Schema.Literal("direct"), client: LocalClient, desired: Desired }),
  Schema.Struct({
    type: Schema.Literal("inherited"), client: Schema.Literal("cursor"),
    provider: Schema.Literal("claude_code"), desired: Schema.Literal("absent")
  }),
  Schema.Struct({ type: Schema.Literal("blocked"), client: Schema.Literal("cursor"), reason: Schema.Literal("import_unsupported") })
]).pipe(Schema.toTaggedUnion("type"))
export type Route = typeof Route.Type

export const LocalStatus = LocalPreviewStatus
export type LocalStatus = typeof LocalStatus.Type

export const Completion = Schema.Union([LocalStatus, InheritedPreviewClient.fields.status])
export type Completion = typeof Completion.Type

export const ApplyInput = Schema.Struct({ provider: LocalStatus })
export type ApplyInput = typeof ApplyInput.Type

export const CompletionInput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("direct"), status: LocalStatus }),
  Schema.Struct({ type: Schema.Literal("inherited"), provider: LocalStatus, local: LocalStatus })
]).pipe(Schema.toTaggedUnion("type"))
export type CompletionInput = typeof CompletionInput.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("preview_route"), input: RouteInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("preview_apply"), input: ApplyInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("preview_finish"), input: CompletionInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("preview_route"), output: Route }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("preview_apply"), output: Schema.Boolean }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("preview_finish"), output: Completion })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
