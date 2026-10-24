import { Schema } from "effect"
import { McpInput } from "./Mcp.ts"
import { McpName } from "./Plugin.ts"
import { Issue as LauncherIssue } from "./PortableLauncher.ts"
import { FilePlan } from "./PortableProcess.ts"

export { FilePlan, ProcessData } from "./PortableProcess.ts"

export const Input = McpInput
export type Input = typeof Input.Type

export const Issue = Schema.Struct({ server: McpName, reason: LauncherIssue })
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
  type: Schema.Literal("render_portable_mcp"),
  input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_portable_mcp"),
  output: Result
})
export type OracleResponse = typeof OracleResponse.Type

export { renderPortableMcp } from "../src/compiler/mcp/portable.ts"
