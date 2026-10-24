import { Match, Schema } from "effect"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"
import { parseDocument, stringify as stringifyYaml } from "yaml"
import { RoleName, type Agent as AgentValue, type AgentEntry, type AgentsInput } from "../../../contracts/Agents.ts"
import { AgentModel, AgentName, AgentText, PackagePath } from "../../../contracts/Plugin.ts"
import type { PackageFile } from "../../../contracts/Compiler.ts"
import { renderAgents } from "./model.ts"

const ClaudeDocument = Schema.Struct({
  name: AgentName,
  description: AgentText,
  model: Schema.optionalKey(AgentModel),
  disallowedTools: Schema.optionalKey(Schema.Tuple([Schema.Literal("Bash")]))
})

const CodexDocument = Schema.Struct({
  name: RoleName,
  description: AgentText,
  developer_instructions: AgentText,
  model: Schema.optionalKey(AgentModel),
  features: Schema.optionalKey(Schema.Struct({ shell_tool: Schema.Literal(false) }))
})

type ClaudeDocument = typeof ClaudeDocument.Type
type CodexDocument = typeof CodexDocument.Type

const safeDecode = <A>(decode: () => A, message: string): A => {
  try {
    return decode()
  } catch {
    throw new Error(message)
  }
}

const canonicalClaudeDocument = (value: unknown): ClaudeDocument => safeDecode(
  () => Schema.decodeUnknownSync(ClaudeDocument)(value, { onExcessProperty: "error" }),
  "Claude agent frontmatter is not supported"
)

const canonicalCodexDocument = (value: unknown): CodexDocument => safeDecode(
  () => Schema.decodeUnknownSync(CodexDocument)(value, { onExcessProperty: "error" }),
  "Codex agent document is not supported"
)

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index])

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

const claudePath = (name: AgentName): PackagePath => PackagePath.make(`agents/${name}.md`)
const codexPath = (name: AgentName): PackagePath => PackagePath.make(`agents/${name}.toml`)

export const materializeAgentEntry = (host: AgentsInput["host"], entry: AgentEntry): PackageFile => {
  const contents = Match.value(host).pipe(
    Match.when("claude_code", () => {
      if (entry.prompt === null || entry.path !== claudePath(entry.name)) {
        throw new Error("Claude agent entry differs from its canonical path or prompt")
      }
      const document = canonicalClaudeDocument(entry.document)
      if (document.name !== entry.name) throw new Error("Claude agent identity differs from its path")
      return encode(`---\n${stringifyYaml(document, { lineWidth: 0 })}---\n${entry.prompt}\n`)
    }),
    Match.when("codex", () => {
      if (entry.prompt !== null || entry.path !== codexPath(entry.name)) {
        throw new Error("Codex agent entry differs from its canonical path or prompt")
      }
      const document = canonicalCodexDocument(entry.document)
      if (document.name !== entry.qualified) throw new Error("Codex agent identity differs from its plugin scope")
      return encode(stringifyToml(document))
    }),
    Match.exhaustive
  )
  return { path: entry.path, content: contents, executable: false }
}

const decodeNativeAgentText = (bytes: Uint8Array): string => safeDecode(
  () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  "Native agent document is not valid UTF-8"
)

const parseClaude = (text: string): { readonly document: ClaudeDocument; readonly prompt: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  const frontmatter = match?.[1]
  const body = match?.[2]
  if (frontmatter === undefined || body === undefined || !body.endsWith("\n")) {
    throw new Error("Claude agent Markdown must contain frontmatter and a prompt")
  }
  const yaml = safeDecode(
    () => parseDocument(frontmatter, { uniqueKeys: true, strict: true }),
    "Claude agent frontmatter is invalid"
  )
  if (yaml.errors.length > 0 || yaml.warnings.length > 0) throw new Error("Claude agent frontmatter is invalid")
  const value = safeDecode(() => yaml.toJS({ maxAliasCount: 0 }), "Claude agent aliases are unsupported")
  const document = canonicalClaudeDocument(value)
  return { document, prompt: body.slice(0, -1) }
}

const parseCodex = (text: string): CodexDocument => {
  const value: unknown = safeDecode(() => parseToml(text), "Codex agent TOML is invalid")
  return canonicalCodexDocument(value)
}

const parseAgent = (
  host: AgentsInput["host"],
  plugin: AgentsInput["plugin"],
  name: AgentName,
  file: PackageFile
): AgentValue => {
  const text = Match.value(host).pipe(
    Match.when("claude_code", () => decodeNativeAgentText(file.content)),
    Match.when("codex", () => decodeNativeAgentText(file.content)),
    Match.exhaustive
  )
  const parsed: AgentValue = Match.value(host).pipe(
    Match.when("claude_code", () => {
      const { document, prompt } = parseClaude(text)
      if (document.name !== name) throw new Error("Claude agent name differs from its filename")
      const shell: AgentsInput["agents"][number]["shell"] = document.disallowedTools === undefined ? "host_default" : "deny"
      const promptText = safeDecode(
        () => Schema.decodeSync(AgentText)(prompt),
        "Claude agent prompt is unsupported"
      )
      return {
        name,
        description: document.description,
        prompt: promptText,
        model: document.model ?? null,
        shell
      }
    }),
    Match.when("codex", () => {
      const document = parseCodex(text)
      if (document.name !== `${plugin}:${name}`) throw new Error("Codex agent name differs from its plugin scope")
      const shell: AgentsInput["agents"][number]["shell"] = document.features === undefined ? "host_default" : "deny"
      return {
        name,
        description: document.description,
        prompt: document.developer_instructions,
        model: document.model ?? null,
        shell
      }
    }),
    Match.exhaustive
  )
  return parsed
}

const renderOne = (host: AgentsInput["host"], plugin: AgentsInput["plugin"], agent: AgentValue): AgentEntry =>
  Match.value(renderAgents({ host, plugin, agents: [agent] })).pipe(
    Match.discriminatorsExhaustive("type")({
      rendered: ({ entries }) => {
        const [entry, ...rest] = entries
        if (entry === undefined || rest.length > 0) throw new Error("Agent renderer returned an invalid entry count")
        return entry
      },
      rejected: () => { throw new Error("Agent renderer rejected a unique native role") }
    })
  )

const validateFile = (host: AgentsInput["host"], plugin: AgentsInput["plugin"], path: string, file: PackageFile): void => {
  if (file.executable) throw new Error("Native agent documents must not be executable")
  const parts = path.split("/")
  const [root, filename, ...extra] = parts
  if (root !== "agents" || filename === undefined || extra.length !== 0) {
    throw new Error("Native agent files must be direct children of agents/")
  }
  const extension = Match.value(host).pipe(
    Match.when("claude_code", () => ".md"),
    Match.when("codex", () => ".toml"),
    Match.exhaustive
  )
  if (!filename.endsWith(extension)) throw new Error("Native agent file extension differs from its host")
  const name = Schema.decodeSync(AgentName)(filename.slice(0, -extension.length))
  const agent = parseAgent(host, plugin, name, file)
  const entry = renderOne(host, plugin, agent)
  const expected = materializeAgentEntry(host, entry)
  if (expected.path !== file.path || expected.executable !== file.executable || !bytesEqual(expected.content, file.content)) {
    throw new Error("Native agent document is not canonical")
  }
}

export const validateNativeAgents = (
  host: AgentsInput["host"],
  plugin: AgentsInput["plugin"],
  files: ReadonlyMap<string, PackageFile>
): ReadonlySet<string> => {
  const agentPaths = new Set<string>()
  for (const [path, file] of files) {
    if (path !== "agents" && !path.startsWith("agents/")) continue
    validateFile(host, plugin, path, file)
    agentPaths.add(path)
  }
  return agentPaths
}
