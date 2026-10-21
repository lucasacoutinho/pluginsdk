import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { parse as parseToml } from "smol-toml"
import { Match, Schema } from "effect"
import { Destination } from "../../contracts/Installer.ts"
import type { Destination as NativeDestination } from "../../contracts/Installer.ts"
import type { Bundle } from "../../contracts/Compiler.ts"
import type { SourceSnapshot } from "./source.js"
import { verifyPayload } from "./source.js"
import { discoverCodexSkills } from "./app-server.js"

export type PilotScenario =
  | { readonly name: "claude-user"; readonly host: "claude_code"; readonly scope: "user" }
  | { readonly name: "claude-project"; readonly host: "claude_code"; readonly scope: "project" }
  | { readonly name: "codex-user"; readonly host: "codex"; readonly scope: "user" }
export type NativeContext = {
  readonly scenario: PilotScenario
  readonly homeRoot: string
  readonly claudeHome: string
  readonly codexHome: string
  readonly nativeHome: string
  readonly projectRoot: string
  readonly sourceRoot: string
  readonly sentinelPath: string
  readonly destination: NativeDestination
  readonly env: NodeJS.ProcessEnv
}
type PluginInventory = { readonly inventoryId: string; readonly pluginVersion: string; readonly sourcePath: string; readonly loadedPath: string; readonly active: boolean }
export type InstalledPlugin = PluginInventory & { readonly discoveredSkills: number }

const ClaudeRow = Schema.Struct({ id: Schema.NonEmptyString, version: Schema.NonEmptyString, scope: Schema.String, enabled: Schema.Boolean, installPath: Schema.NonEmptyString, readFromFolder: Schema.NonEmptyString })
const ClaudeInventory = Schema.Array(ClaudeRow)
const CodexRow = Schema.Struct({
  pluginId: Schema.NonEmptyString, name: Schema.NonEmptyString, marketplaceName: Schema.NonEmptyString,
  version: Schema.NonEmptyString, installed: Schema.Boolean, enabled: Schema.Boolean,
  source: Schema.Struct({ source: Schema.Literal("local"), path: Schema.NonEmptyString })
})
const CodexInventory = Schema.Struct({ installed: Schema.Array(CodexRow), available: Schema.Array(Schema.JsonObject) })
const ClaudeSentinel = Schema.Struct({ theme: Schema.Literal("dark"), pilotSentinel: Schema.Literal("pluginsdk-lstack") })
const CodexSentinel = Schema.Struct({ model: Schema.Literal("gpt-5.1-codex"), pilot_sentinel: Schema.Literal("pluginsdk-lstack") })

const claudeSkillNames = (details: string, expected: readonly string[]): readonly string[] => {
  const inventory = /^ {2}Skills \(([0-9]+)\)[ \t]*(.*)$/mu.exec(details)
  assert.ok(inventory, `Claude Code details has no skill inventory:\n${details}`)
  const names = (inventory[2] ?? "").split(",").map((name) => name.trim()).filter((name) => name !== "")
  assert.equal(names.length, Number(inventory[1]), "Claude Code skill count differs from its listed names")
  assert.deepEqual([...names].sort(), [...expected].sort(), "Claude Code discovered skill inventory differs")
  return names
}

const nativeDirectory = (host: PilotScenario["host"]): string => Match.value(host).pipe(
  Match.when("claude_code", () => ".claude"),
  Match.when("codex", () => ".codex"),
  Match.exhaustive
)
const sentinelPathFor = (scenario: PilotScenario, projectRoot: string, nativeHome: string): string => Match.value(scenario).pipe(
  Match.when({ name: "claude-user", host: "claude_code", scope: "user" }, () => join(nativeHome, "settings.json")),
  Match.when({ name: "claude-project", host: "claude_code", scope: "project" }, () => join(projectRoot, ".claude", "settings.json")),
  Match.when({ name: "codex-user", host: "codex", scope: "user" }, () => join(nativeHome, "config.toml")),
  Match.exhaustive
)
const destinationFor = (scenario: PilotScenario, nativeHome: string, projectRoot: string): NativeDestination => Schema.decodeUnknownSync(Destination)(Match.value(scenario).pipe(
  Match.when({ name: "claude-user", host: "claude_code", scope: "user" }, () => ({ type: "user", host: scenario.host, home: nativeHome })),
  Match.when({ name: "claude-project", host: "claude_code", scope: "project" }, () => ({ type: "project", host: scenario.host, home: nativeHome, root: projectRoot })),
  Match.when({ name: "codex-user", host: "codex", scope: "user" }, () => ({ type: "user", host: scenario.host, home: nativeHome })),
  Match.exhaustive
))
const cwdFor = (scenario: PilotScenario, homeRoot: string, projectRoot: string): string => Match.value(scenario).pipe(
  Match.when({ name: "claude-project", host: "claude_code", scope: "project" }, () => projectRoot),
  Match.when({ name: "claude-user", host: "claude_code", scope: "user" }, () => homeRoot),
  Match.when({ name: "codex-user", host: "codex", scope: "user" }, () => homeRoot),
  Match.exhaustive
)

export const createNativeContext = async (root: string, scenario: PilotScenario, sourceRoot: string): Promise<NativeContext> => {
  const homeRoot = join(root, "home")
  const claudeHome = join(homeRoot, ".claude")
  const codexHome = join(homeRoot, ".codex")
  const nativeHome = join(homeRoot, nativeDirectory(scenario.host))
  const projectRoot = join(root, "project")
  const sentinelPath = sentinelPathFor(scenario, projectRoot, nativeHome)
  for (const directory of [homeRoot, claudeHome, codexHome, nativeHome, projectRoot, dirname(sentinelPath)]) await mkdir(directory, { recursive: true })
  await Match.value(scenario.host).pipe(
    Match.when("claude_code", () => writeFile(sentinelPath, JSON.stringify({ theme: "dark", pilotSentinel: "pluginsdk-lstack" }, null, 2))),
    Match.when("codex", () => writeFile(sentinelPath, 'model = "gpt-5.1-codex"\npilot_sentinel = "pluginsdk-lstack"\n')),
    Match.exhaustive
  )
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: homeRoot, XDG_CONFIG_HOME: join(homeRoot, ".config"),
    CLAUDE_CONFIG_DIR: claudeHome, CODEX_HOME: codexHome, TMPDIR: "/tmp", TMP: "/tmp", TEMP: "/tmp",
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", CI: "1", NO_COLOR: "1", TERM: "dumb",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
  }
  return { scenario, homeRoot, claudeHome, codexHome, nativeHome, projectRoot, sourceRoot, sentinelPath, destination: destinationFor(scenario, nativeHome, projectRoot), env }
}

const run = (binary: string, args: readonly string[], context: NativeContext): Promise<string> => new Promise((resolveOutput, reject) => {
  const child = spawn(binary, [...args], { cwd: cwdFor(context.scenario, context.homeRoot, context.projectRoot), env: context.env, stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", (chunk: string) => { stdout += chunk })
  child.stderr?.on("data", (chunk: string) => { stderr += chunk })
  child.once("error", reject)
  child.once("close", (code, signal) => code === 0 ? resolveOutput(stdout) : reject(new Error(`${binary} ${args.join(" ")} exited ${String(code)} (${String(signal)}): ${stderr}`)))
})

const installedPlugins = async (context: NativeContext): Promise<readonly PluginInventory[]> => {
  const binary = Match.value(context.scenario.host).pipe(
    Match.when("claude_code", () => "claude"), Match.when("codex", () => "codex"), Match.exhaustive
  )
  const text = await run(binary, ["plugin", "list", "--json"], context)
  const raw: unknown = JSON.parse(text)
  return Match.value(context.scenario.host).pipe(
    Match.when("claude_code", () => Schema.decodeUnknownSync(ClaudeInventory)(raw)
      .filter((row) => row.id.split("@")[0] === "lstack" && row.scope === context.scenario.scope)
      .map((row) => ({ inventoryId: row.id, pluginVersion: row.version, sourcePath: row.readFromFolder, loadedPath: row.readFromFolder, active: row.enabled }))),
    Match.when("codex", () => Schema.decodeUnknownSync(CodexInventory)(raw).installed
      .filter((row) => row.name === "lstack")
      .map((row) => ({
        inventoryId: row.pluginId, pluginVersion: row.version,
        sourcePath: resolve(context.projectRoot, row.source.path),
        loadedPath: join(context.codexHome, "plugins", "cache", row.marketplaceName, row.name, row.version),
        active: row.installed && row.enabled
      }))),
    Match.exhaustive
  )
}

const codexSkillNames = async (context: NativeContext, pluginId: string): Promise<readonly string[]> => {
  const entries = await discoverCodexSkills(context.projectRoot, context.env)
  return entries.filter((entry) => entry.pluginId?.startsWith(`${pluginId}@pluginsdk-`)).map((entry) => ({
    name: entry.name.slice(entry.name.lastIndexOf(":") + 1), enabled: entry.enabled
  })).map((entry) => {
    assert.equal(entry.enabled, true, `Codex disabled skill ${entry.name}`)
    return entry.name
  }).sort()
}

export const verifyInstalled = async (context: NativeContext, source: SourceSnapshot, bundle: Bundle, version: string): Promise<InstalledPlugin> => {
  const rows = await installedPlugins(context)
  assert.equal(rows.length, 1, `Expected one native lstack entry in ${context.scenario.name}`)
  const row = rows[0]
  assert.ok(row)
  assert.equal(row.active, true, `Native inventory disabled lstack in ${context.scenario.name}`)
  assert.equal(row.pluginVersion, version, `Native inventory reports the wrong lstack version in ${context.scenario.name}`)
  await verifyPayload(row.sourcePath, bundle)
  if (row.loadedPath !== row.sourcePath) await verifyPayload(row.loadedPath, bundle)
  const discoveredSkills = await Match.value(context.scenario.host).pipe(
    Match.when("claude_code", async () => {
      const details = await run("claude", ["plugin", "details", row.inventoryId], context)
      return claudeSkillNames(details, source.skills).length
    }),
    Match.when("codex", async () => {
      const names = await codexSkillNames(context, source.id)
      assert.deepEqual(names, source.skills)
      return names.length
    }),
    Match.exhaustive
  )
  return { ...row, discoveredSkills }
}

export const verifyRemoved = async (context: NativeContext, pluginId: string): Promise<number> => {
  assert.deepEqual(await installedPlugins(context), [], `Native inventory still lists lstack in ${context.scenario.name}`)
  await Match.value(context.scenario.host).pipe(
    Match.when("claude_code", () => Promise.resolve()),
    Match.when("codex", async () => assert.deepEqual(await codexSkillNames(context, pluginId), [], "Codex app-server still discovers lstack skills")),
    Match.exhaustive
  )
  return 0
}

export const verifySentinel = async (context: NativeContext): Promise<void> => {
  const contents = await readFile(context.sentinelPath, "utf8")
  await Match.value(context.scenario.host).pipe(
    Match.when("claude_code", () => Schema.decodeUnknownSync(ClaudeSentinel)(JSON.parse(contents))),
    Match.when("codex", () => Schema.decodeUnknownSync(CodexSentinel)(parseToml(contents))),
    Match.exhaustive
  )
}
