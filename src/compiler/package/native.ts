import { Schema } from "effect"
import { BundleRejected, Capability, type Bundle } from "../../../contracts/Compiler.ts"
import { PluginId } from "../../../contracts/Plugin.ts"
import { SkillName } from "../../../contracts/CompilerModel.ts"
import { bundleDigest } from "../../internal/identity.ts"
import { parseJsonBytes } from "../../internal/json.ts"
import { skillName } from "../source/skill.ts"
import { validateNativeAgents } from "../agents/native.ts"
import { validatePortableHooks } from "../hooks/portable-native.ts"
import { validatePortableMcp } from "../mcp/portable-native.ts"
import { PackagedProcess } from "../process/portable-native.ts"
import { checkBundle, nativeLocations } from "./model.ts"
import { reservedAssetPath } from "./assembly.ts"

export const isNativeVersion = (version: string): boolean =>
  version.length > 0 && version !== "." && version !== ".." && !version.includes("/") && !version.includes("\\") && !version.includes("\0")

const NativeVersion = Schema.NonEmptyString.check(Schema.makeFilter(isNativeVersion, {
  expected: "a single native cache path component"
}))
const NativeManifest = Schema.Struct({
  name: PluginId,
  version: NativeVersion,
  description: Schema.NonEmptyString
})
export const BundleMetadata = Schema.Struct({
  version: NativeVersion,
  processes: Schema.Array(PackagedProcess),
  requirements: Schema.Array(Capability)
})
export type BundleMetadata = typeof BundleMetadata.Type

const validateNative = (bundle: Bundle): BundleMetadata => {
  const locations = nativeLocations(bundle.format)
  const files = new Map(bundle.files.map((file) => [String(file.path), file]))
  const manifest = files.get(locations.manifest)
  if (manifest === undefined) throw new Error("Native manifest is missing")
  if (manifest.executable) throw new Error("Native JSON documents cannot be executable")
  const metadata = Schema.decodeUnknownSync(NativeManifest)(parseJsonBytes(manifest.content), { onExcessProperty: "error" })
  if (metadata.name !== bundle.plugin) throw new Error("Native manifest name differs from bundle plugin")

  const mcpFile = files.get(locations.mcp)
  const mcp = mcpFile === undefined
    ? { paths: new Set<string>(), processes: [] }
    : (() => {
      if (mcpFile.executable) throw new Error("Native JSON documents cannot be executable")
      return validatePortableMcp(locations.host, parseJsonBytes(mcpFile.content), files)
    })()
  const hooks = validatePortableHooks(locations.host, files)
  const agentPaths = validateNativeAgents(locations.host, bundle.plugin, files)

  const skills = new Set<string>()
  for (const file of bundle.files) {
    if (file.path === locations.manifest || file.path === locations.mcp || mcp.paths.has(file.path) ||
      hooks.paths.has(file.path) || agentPaths.has(file.path)) continue
    const [directory, name, ...rest] = file.path.split("/")
    if (directory !== "skills") {
      if (reservedAssetPath(file.path)) throw new Error(`Unsupported native package file: ${file.path}`)
      continue
    }
    if (name === undefined || rest.length === 0) throw new Error(`Invalid skill path: ${file.path}`)
    Schema.decodeSync(SkillName)(name)
    skills.add(name)
  }
  for (const name of skills) {
    const entry = files.get(`skills/${name}/SKILL.md`)
    if (entry === undefined) throw new Error(`Missing SKILL.md for ${name}`)
    skillName(name, entry.content)
  }

  const requirements: Capability[] = []
  if (mcp.processes.length > 0) requirements.push("stdio")
  if (hooks.processes.length > 0) requirements.push("hooks")
  if (agentPaths.size > 0) requirements.push("agents")
  return { version: metadata.version, processes: [...mcp.processes, ...hooks.processes], requirements }
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
