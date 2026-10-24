import { Schema } from "effect"
import { HooksInput, HookName } from "./Hooks.ts"
import { Issue as LauncherIssue } from "./PortableLauncher.ts"
import { FilePlan } from "./PortableProcess.ts"

export const Input = HooksInput
export type Input = typeof Input.Type

export const Issue = Schema.Struct({ hook: HookName, reason: LauncherIssue })
export type Issue = typeof Issue.Type

export const Result = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("rendered"),
    document: Schema.NullOr(Schema.JsonObject),
    files: Schema.Array(FilePlan)
  }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(Issue) })
]).pipe(Schema.toTaggedUnion("type"))
export type Result = typeof Result.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_portable_hooks"),
  input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_portable_hooks"),
  output: Result
})
export type OracleResponse = typeof OracleResponse.Type

export { renderPortableHooks } from "../src/compiler/hooks/portable.ts"
