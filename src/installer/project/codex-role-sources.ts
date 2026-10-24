import { lstat, realpath } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { Match, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import { RoleName } from "../../../contracts/Agents.ts"
import type { RoleName as RoleNameType } from "../../../contracts/Agents.ts"
import type { NativeLayerSource } from "../hosts/codex-config.ts"

export const roleLimits = { files: 4096, bytes: 2 * 1024 * 1024 } as const

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"

export const parseRoleIdentity = (bytes: Uint8Array, hint?: string): RoleNameType | null => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    const parsed: unknown = parseToml(text)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const rawName = Reflect.get(parsed, "name")
    if (rawName !== undefined && typeof rawName !== "string") return null
    const explicitName = typeof rawName === "string" ? rawName.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "") : ""
    const name = explicitName.length > 0 ? explicitName : hint
    if (name === undefined) return null
    return RoleName.make(name)
  } catch {
    return null
  }
}

export const physicalDirectory = async (path: string): Promise<boolean> => {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("Role inventory path is not canonical")
  let info
  try {
    info = await lstat(path)
  } catch (cause) {
    if (isMissing(cause)) return false
    throw cause
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Role inventory requires physical directories")
  if (await realpath(path) !== path) throw new Error("Role inventory path crosses a symbolic link")
  return true
}

export const configFolder = (source: NativeLayerSource): string | null => Match.value(source).pipe(
  Match.discriminatorsExhaustive("type")({
    packagedDefaults: () => null,
    mdm: () => null,
    system: ({ file }) => dirname(absolutePath(file)),
    enterpriseManaged: () => null,
    user: ({ file }) => dirname(absolutePath(file)),
    project: ({ dotCodexFolder }) => absolutePath(dotCodexFolder),
    sessionFlags: () => null,
    legacyManagedConfigTomlFromFile: () => null,
    legacyManagedConfigTomlFromMdm: () => null
  })
)

export const absolutePath = (path: string): string => {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("Native config path is not absolute and canonical")
  return path
}

export const sourceLabel = (source: NativeLayerSource): string => Match.value(source).pipe(
  Match.discriminatorsExhaustive("type")({
    packagedDefaults: ({ file }) => `packagedDefaults:${file}`,
    mdm: () => "mdm",
    system: ({ file }) => `system:${file}`,
    enterpriseManaged: ({ id }) => `enterpriseManaged:${id}`,
    user: ({ file, profile }) => `user:${file}${profile === null || profile === undefined ? "" : `#${profile}`}`,
    project: ({ dotCodexFolder }) => `project:${dotCodexFolder}`,
    sessionFlags: () => "sessionFlags",
    legacyManagedConfigTomlFromFile: ({ file }) => `legacyManagedConfigTomlFromFile:${file}`,
    legacyManagedConfigTomlFromMdm: () => "legacyManagedConfigTomlFromMdm"
  })
)

export const roleDeclarations = (config: Schema.JsonObject): ReadonlyArray<readonly [string, Schema.JsonObject]> => {
  const agents = Reflect.get(config, "agents")
  if (agents === undefined || agents === null) return []
  if (typeof agents !== "object" || Array.isArray(agents)) throw new Error("Unsupported Codex agents config")
  const reserved = new Set([
    "enabled", "max_threads", "max_concurrent_threads_per_session", "max_depth",
    "default_subagent_model", "default_subagent_reasoning_effort", "job_max_runtime_seconds", "interrupt_message"
  ])
  const declarations: Array<readonly [string, Schema.JsonObject]> = []
  for (const [key, value] of Object.entries(agents)) {
    if (reserved.has(key)) continue
    const declaration = Schema.decodeUnknownSync(Schema.JsonObject)(value)
    declarations.push([key, declaration])
  }
  return declarations
}
