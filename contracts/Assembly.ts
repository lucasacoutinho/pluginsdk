import { Schema } from "effect"
import { PathCollision, ReservedAsset } from "./Compiler.ts"
import { Asset } from "./CompilerModel.ts"

export const ReservedAssetRoot = Schema.Literals([
  "plugin.json", "mcp.json", ".mcp.json", ".lsp.json", ".claude-plugin", ".codex-plugin",
  ".claude", ".codex", "skills", "commands", "agents", "hooks"
])

export const AssemblyInput = Schema.Struct({
  base: Schema.NonEmptyArray(Asset),
  assets: Schema.Array(Asset)
})
export type AssemblyInput = typeof AssemblyInput.Type

export const AssemblyIssue = Schema.Union([PathCollision, ReservedAsset]).pipe(Schema.toTaggedUnion("type"))
export type AssemblyIssue = typeof AssemblyIssue.Type

export const AssemblyResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("assembled"), files: Schema.NonEmptyArray(Asset) }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(AssemblyIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type AssemblyResult = typeof AssemblyResult.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("assemble"),
  input: AssemblyInput
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("assemble"),
  output: AssemblyResult
})
export type OracleResponse = typeof OracleResponse.Type
