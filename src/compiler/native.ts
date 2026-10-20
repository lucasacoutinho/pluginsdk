import { Ajv2020 } from "ajv/dist/2020.js"
import { Schema } from "effect"
import { BundleRejected, type Bundle, type Format } from "../../contracts/Compiler.ts"
import { checkBundle } from "../model/compiler.ts"
import { bundleDigest } from "../internal/identity.ts"
import { parseJsonBytes } from "../internal/json.ts"
import { HeaderName, HeaderText, PluginId, RemoteMcp } from "../../contracts/Plugin.ts"
import { SkillName } from "../../contracts/CompilerModel.ts"
import { skillName } from "./skill.ts"
import pluginSchema from "../../schemas/plugin.schema.json" with { type: "json" }
import mcpSchema from "../../schemas/mcp.schema.json" with { type: "json" }

const ajv = new Ajv2020({ allErrors: true, strict: true })
const portablePlugin = ajv.compile(pluginSchema)
const portableMcp = ajv.compile(mcpSchema)
export const isNativeVersion = (version: string): boolean =>
  version.length > 0 && version !== "." && version !== ".." && !version.includes("/") && !version.includes("\\") && !version.includes("\0")

const NativeVersion = Schema.NonEmptyString.check(Schema.makeFilter(isNativeVersion, { expected: "a single native cache path component" }))
const pluginFields = { name: PluginId, version: NativeVersion, description: Schema.NonEmptyString }
const ClaudeManifest = Schema.Struct(pluginFields)
const PortableManifest = Schema.Struct({ $schema: Schema.Literal(pluginSchema.$id), ...pluginFields })
const NativeServer = Schema.Struct({
  type: Schema.Literals(["http", "streamable-http"]),
  url: RemoteMcp.fields.url,
  headers: Schema.Record(HeaderName, HeaderText)
})
const ClaudeMcp = Schema.Struct({ mcpServers: Schema.Record(Schema.NonEmptyString, NativeServer) })
const PortableMcp = Schema.Struct({ $schema: Schema.Literal(mcpSchema.$id), ...ClaudeMcp.fields })
const locations: Record<Format, { manifest: string; mcp: string; transport: string }> = {
  agent_plugins_v1: { manifest: "plugin.json", mcp: "mcp.json", transport: "streamable-http" },
  claude_code_v1: { manifest: ".claude-plugin/plugin.json", mcp: ".mcp.json", transport: "http" }
}

export const nativeLocations = (format: Format) => locations[format]

const validateNative = (bundle: Bundle): void => {
  const paths = locations[bundle.format]
  const files = new Map(bundle.files.map((file) => [String(file.path), file]))
  const manifest = files.get(paths.manifest)
  if (manifest === undefined) throw new Error("Native manifest is missing")
  if (manifest.executable) throw new Error("Native JSON documents cannot be executable")
  const value = parseJsonBytes(manifest.content)
  const metadata = bundle.format === "agent_plugins_v1"
    ? Schema.decodeUnknownSync(PortableManifest)(value, { onExcessProperty: "error" })
    : Schema.decodeUnknownSync(ClaudeManifest)(value, { onExcessProperty: "error" })
  if (metadata.name !== bundle.plugin) throw new Error("Native manifest name differs from bundle plugin")
  if (bundle.format === "agent_plugins_v1" && !portablePlugin(value)) throw new Error(ajv.errorsText(portablePlugin.errors))
  const mcp = files.get(paths.mcp)
  if (mcp !== undefined) {
    if (mcp.executable) throw new Error("Native JSON documents cannot be executable")
    const value = parseJsonBytes(mcp.content)
    const document = bundle.format === "agent_plugins_v1"
      ? Schema.decodeUnknownSync(PortableMcp)(value, { onExcessProperty: "error" })
      : Schema.decodeUnknownSync(ClaudeMcp)(value, { onExcessProperty: "error" })
    if (bundle.format === "agent_plugins_v1" && !portableMcp(value)) throw new Error(ajv.errorsText(portableMcp.errors))
    for (const server of Object.values(document.mcpServers)) {
      if (server.type !== paths.transport) throw new Error("Native MCP transport differs from format")
      const headers = Object.keys(server.headers).map((header) => header.toLowerCase())
      if (new Set(headers).size !== headers.length) throw new Error("MCP headers collide under ASCII case folding")
    }
  }
  const skills = new Set<string>()
  for (const file of bundle.files) {
    if (file.path === paths.manifest || file.path === paths.mcp) continue
    const [directory, name, ...rest] = file.path.split("/")
    if (directory !== "skills" || name === undefined || rest.length === 0) throw new Error(`Unsupported native package file: ${file.path}`)
    Schema.decodeSync(SkillName)(name)
    skills.add(name)
  }
  for (const name of skills) {
    const entry = files.get(`skills/${name}/SKILL.md`)
    if (entry === undefined) throw new Error(`Missing SKILL.md for ${name}`)
    skillName(name, entry.content)
  }
}

export const validateBundle = (bundle: Bundle): void => {
  const [head, ...tail] = bundle.files
  const checked = checkBundle({
    digest: bundle.digest,
    computed: bundleDigest(bundle),
    paths: [head.path, ...tail.map((file) => file.path)]
  })
  if (checked.type === "rejected") throw new BundleRejected({ issues: checked.issues })
  try {
    validateNative(bundle)
  } catch (cause) {
    throw new BundleRejected({ issues: [{ type: "invalid_native_package", detail: cause instanceof Error ? cause.message : "Native package failed validation" }] })
  }
}
