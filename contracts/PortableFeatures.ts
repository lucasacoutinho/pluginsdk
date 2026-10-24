import { Schema } from "effect"
import { HooksInput } from "./Hooks.ts"
import * as PortableHooks from "./PortableHooks.ts"
import * as PortableMcp from "./PortableMcp.ts"
import { FilePlan } from "./PortableProcess.ts"

export const Input = Schema.Struct({ mcp: PortableMcp.Input, hooks: HooksInput.fields.hooks })
export type Input = typeof Input.Type

export const Issue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("mcp"), issue: PortableMcp.Issue }),
  Schema.Struct({ type: Schema.Literal("hook"), issue: PortableHooks.Issue })
]).pipe(Schema.toTaggedUnion("type"))
export type Issue = typeof Issue.Type

export const Result = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("rendered"),
    mcpDocument: Schema.NullOr(Schema.JsonObject),
    hooksDocument: Schema.NullOr(Schema.JsonObject),
    files: Schema.Array(FilePlan)
  }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(Issue) })
]).pipe(Schema.toTaggedUnion("type"))
export type Result = typeof Result.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_portable_features"),
  input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_portable_features"),
  output: Result
})
export type OracleResponse = typeof OracleResponse.Type

export { renderPortableFeatures } from "../src/compiler/process/features.ts"
