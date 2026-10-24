import { Schema } from "effect"
import { RenderInput } from "./CompilerModel.ts"
import { McpName, RemoteMcp } from "./Plugin.ts"
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
