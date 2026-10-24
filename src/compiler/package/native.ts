import { Ajv2020 } from "ajv/dist/2020.js"
import { Match, Schema } from "effect"
import { BundleRejected, type Bundle, type Format } from "../../../contracts/Compiler.ts"
import { checkBundle } from "./model.ts"
import { reservedAssetPath } from "./assembly.ts"
import { bundleDigest } from "../../internal/identity.ts"
import { parseJsonBytes } from "../../internal/json.ts"
import { asciiFold, compareUtf8 } from "../../internal/paths.ts"
import { EnvironmentName, HeaderName, HeaderText, PluginId, ProcessText, RemoteMcp } from "../../../contracts/Plugin.ts"
import { SkillName } from "../../../contracts/CompilerModel.ts"
import type { RenderInput } from "../../../contracts/CompilerModel.ts"
import type { ProcessInput } from "../../../contracts/Process.ts"
import { skillName } from "../source/skill.ts"
import { validateNativeHooks } from "../hooks/native.ts"
import { validateNativeAgents } from "../agents/native.ts"
import { validatePortableMcp } from "../mcp/portable-native.ts"
import { validatePortableHooks } from "../hooks/portable-native.ts"
import { PackagedProcess } from "../process/portable-native.ts"
import type { ProcessEncoding } from "../process/materialize.ts"
import pluginSchema from "../../../schemas/plugin.schema.json" with { type: "json" }
import mcpSchema from "../../../schemas/mcp.schema.json" with { type: "json" }

const ajv = new Ajv2020({ allErrors: true, strict: true })
const portablePlugin = ajv.compile(pluginSchema)
const portableMcp = ajv.compile(mcpSchema)
export const isNativeVersion = (version: string): boolean =>
  version.length > 0 && version !== "." && version !== ".." && !version.includes("/") && !version.includes("\\") && !version.includes("\0")

const NativeVersion = Schema.NonEmptyString.check(Schema.makeFilter(isNativeVersion, { expected: "a single native cache path component" }))
const pluginFields = { name: PluginId, version: NativeVersion, description: Schema.NonEmptyString }
const ClaudeManifest = Schema.Struct(pluginFields)
const BundleMetadata = Schema.Struct({ version: NativeVersion, processes: Schema.Array(PackagedProcess) })
export type BundleMetadata = typeof BundleMetadata.Type
const PortableManifest = Schema.Struct({ $schema: Schema.Literal(pluginSchema.$id), ...pluginFields })
const NativeServer = Schema.Struct({
  type: Schema.Literals(["http", "streamable-http"]),
  url: RemoteMcp.fields.url,
  headers: Schema.Record(HeaderName, HeaderText)
})
const NativeStdio = Schema.Struct({
  type: Schema.Literal("stdio"),
  command: ProcessText,
  args: Schema.Array(ProcessText),
  env: Schema.Record(EnvironmentName, ProcessText),
  cwd: Schema.optionalKey(ProcessText)
})
const ClaudeMcp = Schema.Struct({ mcpServers: Schema.Record(Schema.NonEmptyString, NativeServer) })
const PortableMcp = Schema.Struct({ $schema: Schema.Literal(mcpSchema.$id), ...ClaudeMcp.fields })
const ClaudeMcpV3 = Schema.Struct({ mcpServers: Schema.Record(Schema.NonEmptyString, Schema.Union([NativeServer, NativeStdio])) })
const PortableMcpV3 = Schema.Struct({ $schema: Schema.Literal(mcpSchema.$id), ...ClaudeMcpV3.fields })
const CodexRemoteServer = Schema.Struct({
  url: RemoteMcp.fields.url,
  http_headers: Schema.Record(HeaderName, HeaderText)
})
const CodexStdio = Schema.Struct({
  command: Schema.Literal("/bin/sh"),
  args: Schema.Array(ProcessText),
  env: Schema.Record(EnvironmentName, ProcessText),
  cwd: Schema.Literal(".")
})
const CodexMcp = Schema.Struct({
  mcpServers: Schema.Record(Schema.NonEmptyString, Schema.Union([CodexRemoteServer, CodexStdio]))
})
type LegacyNativeFormat = Extract<RenderInput["format"], "agent_plugins_v1" | "claude_code_v1">
const portable = { base: "agent_plugins_v1", host: "codex", manifest: "plugin.json", mcp: "mcp.json", transport: "streamable-http" } as const
const claude = { base: "claude_code_v1", host: "claude_code", manifest: ".claude-plugin/plugin.json", mcp: ".mcp.json", transport: "http" } as const
const codex = { base: "codex_plugin_v1", host: "codex", manifest: ".codex-plugin/plugin.json", mcp: ".mcp.json", transport: "http" } as const
const locations: Record<Format, { base: RenderInput["format"]; host: ProcessInput["host"]; manifest: string; mcp: string; transport: string; assets: boolean; processes: ProcessEncoding; hooks: boolean; agents: boolean }> = {
  agent_plugins_v1: { ...portable, assets: false, processes: false, hooks: false, agents: false },
  claude_code_v1: { ...claude, assets: false, processes: false, hooks: false, agents: false },
  agent_plugins_v2: { ...portable, assets: true, processes: false, hooks: false, agents: false },
  claude_code_v2: { ...claude, assets: true, processes: false, hooks: false, agents: false },
  agent_plugins_v3: { ...portable, assets: true, processes: "posix", hooks: false, agents: false },
  claude_code_v3: { ...claude, assets: true, processes: "posix", hooks: false, agents: false },
  claude_code_v4: { ...claude, assets: true, processes: "posix", hooks: true, agents: false },
  codex_plugin_v1: { ...codex, assets: true, processes: "posix", hooks: true, agents: false },
  claude_code_v5: { ...claude, base: "claude_code_v1", assets: true, processes: "posix", hooks: true, agents: true },
  codex_plugin_v2: { ...codex, base: "codex_plugin_v1", assets: true, processes: "posix", hooks: true, agents: true },
  claude_code_portable_v1: { ...claude, assets: true, processes: "portable", hooks: false, agents: false },
  codex_plugin_portable_v1: { ...codex, assets: true, processes: "portable", hooks: false, agents: false },
  claude_code_portable_v2: { ...claude, assets: true, processes: "portable_features", hooks: true, agents: true },
  codex_plugin_portable_v2: { ...codex, assets: true, processes: "portable_features", hooks: true, agents: true }
}

export const nativeLocations = (format: Format) => locations[format]

const validateCaptures = (env: typeof NativeStdio.Type["env"]): void => {
  const bindings = new Map(Object.entries(env))
  for (const name of Object.keys(env)) {
    const capture = /^(PSDK_[_]*)([AB])_([A-Za-z_][A-Za-z0-9_]*)$/.exec(name)
    const prefix = capture?.[1]
    const source = capture?.[3]
    if (prefix === undefined || source === undefined ||
      bindings.get(prefix + "A_" + source) !== "${" + source + "}" ||
      bindings.get(prefix + "B_" + source) !== "${" + source + ":-PSDK_ABSENT}") {
      throw new Error("Native stdio environment must contain paired source captures")
    }
  }
}

const validateStdio = (server: typeof NativeStdio.Type, base: LegacyNativeFormat, path: string, files: ReadonlyMap<string, Bundle["files"][number]>): void => {
  const reference = Match.value(base).pipe(
    Match.when("agent_plugins_v1", () => ({ command: "./" + path, root: "${PLUGIN_ROOT}", cwd: "${PLUGIN_ROOT}", captures: false })),
    Match.when("claude_code_v1", () => ({ command: "${CLAUDE_PLUGIN_ROOT}/" + path, root: "${CLAUDE_PLUGIN_ROOT}", cwd: undefined, captures: true })),
    Match.exhaustive
  )
  if (server.command !== reference.command || server.args.length !== 1 || server.args[0] !== reference.root) {
    throw new Error("Native stdio launcher differs from its canonical package reference")
  }
  if (server.cwd !== reference.cwd) throw new Error("Native stdio working directory differs from its launcher profile")
  if (reference.captures) validateCaptures(server.env)
  else if (Object.keys(server.env).length !== 0) throw new Error("Codex stdio cannot preserve native environment bindings")
  const launcher = files.get(path)
  if (launcher === undefined || !launcher.executable) throw new Error("Native stdio launcher must name a packaged executable file")
}

const validateRemote = (server: typeof NativeServer.Type, transport: string): void => {
  if (server.type !== transport) throw new Error("Native MCP transport differs from format")
  const headers = Object.keys(server.headers).map((header) => header.toLowerCase())
  if (new Set(headers).size !== headers.length) throw new Error("MCP headers collide under ASCII case folding")
}

const validateCodexRemote = (server: typeof CodexRemoteServer.Type): void => {
  const headers = Object.keys(server.http_headers).map(asciiFold)
  if (new Set(headers).size !== headers.length) throw new Error("MCP headers collide under ASCII case folding")
}

const validateCodexStdio = (server: typeof CodexStdio.Type, ordinal: number, files: ReadonlyMap<string, Bundle["files"][number]>): void => {
  const path = `.psdk/mcp/${ordinal}.sh`
  if (server.args.length !== 1 || server.args[0] !== path) {
    throw new Error("Codex stdio launcher differs from its canonical package reference")
  }
  if (Object.keys(server.env).length !== 0) throw new Error("Codex stdio cannot preserve native environment bindings")
  const launcher = files.get(path)
  if (launcher === undefined || !launcher.executable) throw new Error("Native stdio launcher must name a packaged executable file")
}

const validateCodexMcp = (value: unknown, files: ReadonlyMap<string, Bundle["files"][number]>): void => {
  const document = Schema.decodeUnknownSync(CodexMcp)(value, { onExcessProperty: "error" })
  let ordinal = 0
  const servers = Object.entries(document.mcpServers).sort(([left], [right]) => compareUtf8(left, right))
  for (const [, server] of servers) {
    if ("command" in server) {
      validateCodexStdio(server, ordinal, files)
      ordinal += 1
    } else {
      validateCodexRemote(server)
    }
  }
}

const validateNative = (bundle: Bundle): BundleMetadata => {
  const paths = locations[bundle.format]
  const files = new Map(bundle.files.map((file) => [String(file.path), file]))
  const manifest = files.get(paths.manifest)
  if (manifest === undefined) throw new Error("Native manifest is missing")
  if (manifest.executable) throw new Error("Native JSON documents cannot be executable")
  const value = parseJsonBytes(manifest.content)
  const metadata = paths.base === "agent_plugins_v1"
    ? Schema.decodeUnknownSync(PortableManifest)(value, { onExcessProperty: "error" })
    : Schema.decodeUnknownSync(ClaudeManifest)(value, { onExcessProperty: "error" })
  if (metadata.name !== bundle.plugin) throw new Error("Native manifest name differs from bundle plugin")
  if (paths.base === "agent_plugins_v1" && !portablePlugin(value)) throw new Error(ajv.errorsText(portablePlugin.errors))
  const mcp = files.get(paths.mcp)
  let processPaths: ReadonlySet<string> = new Set()
  let processes: ReadonlyArray<PackagedProcess> = []
  const portableProcesses = Match.value(paths.processes).pipe(
    Match.whenOr(false, "posix", () => false),
    Match.whenOr("portable", "portable_features", () => true),
    Match.exhaustive
  )
  if (mcp !== undefined) {
    if (mcp.executable) throw new Error("Native JSON documents cannot be executable")
    const value = parseJsonBytes(mcp.content)
    const base = paths.base
    if (portableProcesses) {
      const portable = validatePortableMcp(paths.host, value, files)
      processPaths = portable.paths
      processes = portable.processes
    } else if (base === "codex_plugin_v1") {
      validateCodexMcp(value, files)
    } else {
      const schema = Match.value(base).pipe(
        Match.when("agent_plugins_v1", () => paths.processes ? PortableMcpV3 : PortableMcp),
        Match.when("claude_code_v1", () => paths.processes ? ClaudeMcpV3 : ClaudeMcp),
        Match.exhaustive
      )
      const document = Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" })
      if (paths.base === "agent_plugins_v1" && !portableMcp(value)) throw new Error(ajv.errorsText(portableMcp.errors))
      let ordinal = 0
      for (const [, server] of Object.entries(document.mcpServers).sort(([left], [right]) => compareUtf8(left, right))) {
        Match.value(server).pipe(Match.discriminatorsExhaustive("type")({
          http: (server) => validateRemote(server, paths.transport),
          "streamable-http": (server) => validateRemote(server, paths.transport),
          stdio: (server) => { validateStdio(server, base, `.psdk/mcp/${ordinal}.sh`, files); ordinal++ }
        }))
      }
    }
  }
  const hooks = paths.hooks
    ? Match.value(paths.processes).pipe(
      Match.whenOr(false, "posix", "portable", () => ({ paths: validateNativeHooks(paths.host, files), processes: [] })),
      Match.when("portable_features", () => validatePortableHooks(paths.host, files)),
      Match.exhaustive
    )
    : { paths: new Set<string>(), processes: [] }
  processes = [...processes, ...hooks.processes]
  const agentPaths = paths.agents
    ? validateNativeAgents(paths.host, bundle.plugin, files)
    : new Set<string>()
  const skills = new Set<string>()
  for (const file of bundle.files) {
    if (file.path === paths.manifest || file.path === paths.mcp || processPaths.has(file.path) || hooks.paths.has(file.path) || agentPaths.has(file.path)) continue
    const [directory, name, ...rest] = file.path.split("/")
    if (directory !== "skills") {
      if (!paths.assets || reservedAssetPath(file.path)) throw new Error(`Unsupported native package file: ${file.path}`)
      continue
    }
    if (name === undefined || rest.length === 0) throw new Error(`Invalid skill path: ${file.path}`)
    Schema.decodeSync(SkillName)(name)
    skills.add(name)
  }
  for (const name of skills) {
    const entry = files.get(`skills/${name}/SKILL.md`)
    if (entry === undefined) throw new Error(`Missing SKILL.md for ${name}`)
    skillName(name, entry.content, bundle.format)
  }
  return { version: metadata.version, processes }
}

export const validateBundle = (bundle: Bundle): BundleMetadata => {
  const [head, ...tail] = bundle.files
  const checked = checkBundle({
    digest: bundle.digest,
    computed: bundleDigest(bundle),
    paths: [head.path, ...tail.map((file) => file.path)]
  })
  if (checked.type === "rejected") throw new BundleRejected({ issues: checked.issues })
  try {
    return validateNative(bundle)
  } catch (cause) {
    throw new BundleRejected({ issues: [{ type: "invalid_native_package", detail: cause instanceof Error ? cause.message : "Native package failed validation" }] })
  }
}
