import { Schema } from "effect"
import { RenderInput } from "./CompilerModel.ts"
import { McpName, PackagePath, ProcessText, RemoteMcp } from "./Plugin.ts"
import { ProcessPlan } from "./Process.ts"

export const McpInput = Schema.Struct({
  format: RenderInput.fields.format,
  remote: Schema.Record(McpName, Schema.toEncoded(RemoteMcp)),
  local: Schema.Record(McpName, ProcessPlan)
}).check(Schema.makeFilter(
  (input) => Object.keys(input.remote).every((name) => !Object.hasOwn(input.local, name)),
  { expected: "distinct remote and local MCP server names" }
))
export type McpInput = typeof McpInput.Type

export const GeneratedFile = Schema.Struct({
  path: PackagePath,
  content: ProcessText,
  executable: Schema.Literal(true)
})
export type GeneratedFile = typeof GeneratedFile.Type

export const McpResult = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("rendered"),
    document: Schema.NullOr(Schema.JsonObject),
    files: Schema.Array(GeneratedFile)
  }),
  Schema.Struct({
    type: Schema.Literal("rejected"),
    issues: Schema.NonEmptyArray(Schema.Struct({
      type: Schema.Literal("unsupported_launcher"),
      server: Schema.NonEmptyString
    }))
  })
]).pipe(Schema.toTaggedUnion("type"))
export type McpResult = typeof McpResult.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_mcp"),
  input: McpInput
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_mcp"),
  output: McpResult
})
export type OracleResponse = typeof OracleResponse.Type

export { renderMcp } from "../src/compiler/mcp/model.ts"
