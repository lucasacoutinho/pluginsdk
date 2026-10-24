import { Schema } from "effect"
import { AgentModel, AgentName, AgentText, PackagePath, PluginId, ShellPolicy } from "./Plugin.ts"
export { AgentDefinition, AgentModel, AgentName, AgentText, ShellPolicy } from "./Plugin.ts"

export const RoleName = Schema.NonEmptyString.check(Schema.makeFilter(
  (name) => name.isWellFormed() && !name.includes("\0"), { expected: "a Unicode role identity without NUL" }
)).pipe(Schema.brand("pluginsdk/RoleName"))
export type RoleName = typeof RoleName.Type

export const Agent = Schema.Struct({
  name: AgentName,
  description: AgentText,
  prompt: AgentText,
  model: Schema.NullOr(AgentModel),
  shell: ShellPolicy
})
export type Agent = typeof Agent.Type

export const AgentsInput = Schema.Struct({
  host: Schema.Literals(["claude_code", "codex"]),
  plugin: PluginId,
  agents: Schema.Array(Agent)
})
export type AgentsInput = typeof AgentsInput.Type

export const AgentEntry = Schema.Struct({
  name: AgentName,
  qualified: RoleName,
  path: PackagePath,
  document: Schema.JsonObject,
  prompt: Schema.NullOr(AgentText)
})
export type AgentEntry = typeof AgentEntry.Type

export const AgentIssue = Schema.Struct({ type: Schema.Literal("duplicate_agent"), name: AgentName })
export type AgentIssue = typeof AgentIssue.Type

export const AgentsResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("rendered"), entries: Schema.Array(AgentEntry) }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(AgentIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type AgentsResult = typeof AgentsResult.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("render_agents"), input: AgentsInput })
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("render_agents"), output: AgentsResult })
export type OracleResponse = typeof OracleResponse.Type
