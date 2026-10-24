import { Schema } from "effect"

export const PluginId = Schema.String.check(
  Schema.isBetweenLength(1, 64),
  Schema.isPattern(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
).pipe(Schema.brand("pluginsdk/PluginId"))
export type PluginId = typeof PluginId.Type

export const Directory = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/Directory"))
export type Directory = typeof Directory.Type

export const PackagePath = Schema.String.check(
  Schema.isPattern(/^(?![A-Za-z]:)[^/\\\u0000]+(?:\/[^/\\\u0000]+)*$/),
  Schema.makeFilter(
    (path) => path.isWellFormed() && path.split("/").every((segment) => segment !== "." && segment !== ".."),
    { expected: "a valid Unicode package path without dot segments" }
  )
).pipe(Schema.brand("pluginsdk/PackagePath"))
export type PackagePath = typeof PackagePath.Type

export const ProcessText = Schema.String.check(Schema.makeFilter(
  (value) => value.isWellFormed() && !value.includes("\0"),
  { expected: "valid Unicode process text without NUL" }
)).pipe(Schema.brand("pluginsdk/ProcessText"))
export type ProcessText = typeof ProcessText.Type

export const ExecutableName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_.+-]+$/),
  Schema.makeFilter(
    (value) => value !== "." && value !== ".." && !value.startsWith("-"),
    { expected: "a bare executable name" }
  )
).pipe(Schema.brand("pluginsdk/ExecutableName"))
export type ExecutableName = typeof ExecutableName.Type

export const HeaderName = Schema.String.check(
  Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)
).pipe(Schema.brand("pluginsdk/HeaderName"))
export type HeaderName = typeof HeaderName.Type

export const HeaderText = Schema.String.check(Schema.isPattern(/^[\t\x20-\x7e\x80-\xff]*$/))
export type HeaderText = typeof HeaderText.Type

export const EnvironmentName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)
).pipe(Schema.brand("pluginsdk/EnvironmentName"))
export type EnvironmentName = typeof EnvironmentName.Type

export const McpName = Schema.NonEmptyString.check(Schema.makeFilter(
  (name) => name.isWellFormed(),
  { expected: "a nonempty Unicode MCP server name" }
))
export type McpName = typeof McpName.Type

export const EnvironmentReference = Schema.Struct({
  type: Schema.Literal("environment"),
  name: EnvironmentName
})
export type EnvironmentReference = typeof EnvironmentReference.Type

export const EnvironmentHeader = Schema.Struct({
  ...EnvironmentReference.fields,
  prefix: HeaderText
})
export type EnvironmentHeader = typeof EnvironmentHeader.Type

export const HeaderValue = Schema.Union([HeaderText, EnvironmentHeader])
export type HeaderValue = typeof HeaderValue.Type

export const RemoteMcp = Schema.Struct({
  url: Schema.URLFromString.check(
    Schema.makeFilter(
      (url) => url.username === "" && url.password === "" && !url.href.includes("#") && !url.href.includes("${"),
      { expected: "a literal endpoint without credentials or a fragment" }
    ),
    Schema.makeFilter(
      (url) => url.protocol === "https:" || (url.protocol === "http:" && (
        url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
      )),
      { expected: "an HTTPS or loopback HTTP URL" }
    ),
  ),
  headers: Schema.Record(HeaderName, HeaderValue)
})
export type RemoteMcp = typeof RemoteMcp.Type

export const FileReference = Schema.Struct({ file: PackagePath })
export type FileReference = typeof FileReference.Type

const processFields = {
  command: Schema.Union([ExecutableName, FileReference]),
  args: Schema.optionalKey(Schema.Array(Schema.Union([ProcessText, FileReference]))),
  cwd: Schema.optionalKey(PackagePath),
  env: Schema.optionalKey(Schema.Record(EnvironmentName, Schema.Union([ProcessText, EnvironmentReference])))
}

export const StdioMcp = Schema.Struct({ type: Schema.Literal("stdio"), ...processFields })
export type StdioMcp = typeof StdioMcp.Type

export const HookName = Schema.NonEmptyString.check(Schema.makeFilter(
  (name) => name.isWellFormed(),
  { expected: "a nonempty Unicode hook name" }
)).pipe(Schema.brand("pluginsdk/HookName"))
export type HookName = typeof HookName.Type

export const HookEvent = Schema.Literals(["SessionStart", "UserPromptSubmit"])
export type HookEvent = typeof HookEvent.Type

export const HookTimeout = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 600 })
).pipe(Schema.brand("pluginsdk/HookTimeout"))
export type HookTimeout = typeof HookTimeout.Type

export const CommandHook = Schema.Struct({
  ...processFields,
  event: HookEvent,
  timeout: Schema.optionalKey(HookTimeout)
})
export type CommandHook = typeof CommandHook.Type

export const McpServer = Schema.Union([RemoteMcp, StdioMcp])
export type McpServer = typeof McpServer.Type

export const AgentName = Schema.String.check(
  Schema.isBetweenLength(1, 64), Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
).pipe(Schema.brand("pluginsdk/AgentName"))
export type AgentName = typeof AgentName.Type

export const AgentText = Schema.NonEmptyString.check(Schema.makeFilter(
  (text) => text.isWellFormed() && !text.includes("\0") && text.trim() === text,
  { expected: "nonempty canonical Unicode agent text without NUL or outer whitespace" }
))
export type AgentText = typeof AgentText.Type

export const AgentModel = AgentText.check(Schema.makeFilter(
  (model) => model !== "inherit", { expected: "an explicit model identifier, with omission selecting the host default" }
))
export type AgentModel = typeof AgentModel.Type

export const ShellPolicy = Schema.Literals(["host_default", "deny"])
export type ShellPolicy = typeof ShellPolicy.Type

export const AgentDefinition = Schema.Struct({
  description: AgentText,
  prompt: PackagePath,
  models: Schema.optionalKey(Schema.Struct({ claude_code: AgentModel, codex: AgentModel })),
  shell: Schema.optionalKey(ShellPolicy)
})
export type AgentDefinition = typeof AgentDefinition.Type

export const Plugin = Schema.Struct({
  id: PluginId,
  version: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  skills: Schema.Array(PackagePath),
  assets: Schema.optionalKey(Schema.Array(PackagePath)),
  executables: Schema.optionalKey(Schema.Array(PackagePath)),
  mcp: Schema.Record(McpName, McpServer),
  hooks: Schema.optionalKey(Schema.Record(HookName, CommandHook)),
  agents: Schema.optionalKey(Schema.Record(AgentName, AgentDefinition))
})
export type Plugin = typeof Plugin.Type
export type PluginDefinition = typeof Plugin.Encoded
