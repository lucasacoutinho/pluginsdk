import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { Effect, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import type { Target } from "../../contracts/Installer.ts"
import { inside } from "../compiler/capture.ts"
import { canonicalJson, parseJson, type Json } from "../internal/json.ts"
import { runHost } from "./host.ts"
import { targetPaths } from "./target.ts"

export class InspectionUnavailable extends Schema.TaggedError<InspectionUnavailable, { readonly brand: unique symbol }>()("InspectionUnavailable", { cause: Schema.Defect() }) {}
export const inspectIO = <A>(operation: () => Promise<A>) => Effect.tryPromise({ try: operation, catch: (cause) => new InspectionUnavailable({ cause }) })
export const sameJson = (left: Json, right: Json): boolean => canonicalJson(left) === canonicalJson(right)

type Facts = Schema.JsonObject
export type NativeState =
  | { readonly type: "absent" }
  | { readonly type: "unverified"; readonly facts: Facts }
  | { readonly type: "candidate"; readonly facts: Facts; readonly source: string; readonly loaded: string }

export type NativeInventory = {
  readonly related: readonly Facts[]
  readonly markets: readonly Facts[]
  readonly entries: Facts
  readonly declaration: Json
  readonly consumers: readonly Facts[]
  readonly configuredConsumers: Facts
}

const ObjectRows = Schema.Array(Schema.JsonObject)
const Settings = Schema.Struct({
  enabledPlugins: Schema.optionalKey(Schema.JsonObject),
  extraKnownMarketplaces: Schema.optionalKey(Schema.JsonObject),
  plugins: Schema.optionalKey(Schema.JsonObject),
  marketplaces: Schema.optionalKey(Schema.JsonObject)
})
const ClaudeSelector = Schema.Struct({ id: Schema.String, scope: Schema.String, projectPath: Schema.optionalKey(Schema.String) })
const ClaudeInstallation = Schema.Struct({ enabled: Schema.Boolean, readFromFolder: Schema.NonEmptyString })
const CodexSelector = Schema.Struct({ pluginId: Schema.String, name: Schema.String })
const CodexInstallation = Schema.Struct({
  installed: Schema.Boolean,
  enabled: Schema.Boolean,
  version: Schema.NonEmptyString,
  marketplaceName: Schema.String,
  source: Schema.Struct({ source: Schema.Literal("local"), path: Schema.NonEmptyString }),
  marketplaceSource: Schema.Struct({ sourceType: Schema.Literal("local"), source: Schema.NonEmptyString })
})
const decodeObject = Schema.decodeUnknownSync(Schema.JsonObject)
const decodeRows = Schema.decodeUnknownSync(ObjectRows)
const bareName = (selector: string) => selector.split("@")[0]
const stable = (row: Facts): Facts => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "installedAt" && key !== "lastUpdated"))

const optionalText = async (path: string): Promise<string | null> => {
  let file
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return null
    throw cause
  }
  try {
    if (!(await file.stat()).isFile() || await realpath(path) !== path) throw new Error("Native metadata must be a physical regular file")
    return await file.readFile("utf8")
  } finally { await file.close() }
}

export const readInventory = Effect.fnUntraced(function*(target: Target) {
  const pluginText = yield* runHost(target.destination, ["plugin", "list", "--json"])
  const marketText = yield* runHost(target.destination, ["plugin", "marketplace", "list", "--json"])
  return yield* inspectIO(async (): Promise<NativeInventory> => {
    const paths = targetPaths(target)
    const claude = target.destination.host === "claude_code"
    const inventory = parseJson(pluginText)
    const catalogList = parseJson(marketText)
    const allPlugins = decodeRows(claude ? inventory : decodeObject(inventory).installed)
    const allMarkets = decodeRows(claude ? catalogList : decodeObject(catalogList).marketplaces)
    const related = allPlugins.filter((row) => {
      if (!claude) return Schema.decodeUnknownSync(CodexSelector)(row).name === target.plugin
      const selected = Schema.decodeUnknownSync(ClaudeSelector)(row)
      return bareName(selected.id) === target.plugin && selected.scope === target.destination.type &&
        (target.destination.type === "user" || selected.projectPath === target.destination.root)
    })
    const usesMarket = (selector: string) => selector.endsWith(`@${paths.marketName}`)
    const consumers = allPlugins.filter((row) => usesMarket(claude
      ? Schema.decodeUnknownSync(ClaudeSelector)(row).id
      : Schema.decodeUnknownSync(CodexSelector)(row).pluginId))
    const markets = allMarkets.filter((row) => Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }))(row).name === paths.marketName)
    const configPath = claude
      ? target.destination.type === "user" ? join(target.destination.home, "settings.json") : join(target.destination.root, ".claude/settings.json")
      : join(target.destination.home, "config.toml")
    const text = await optionalText(configPath)
    const configValue: unknown = text === null ? {} : claude ? parseJson(text) : parseToml(text)
    const config = Schema.decodeUnknownSync(Settings)(configValue)
    const pluginSettings = claude ? config.enabledPlugins ?? {} : config.plugins ?? {}
    const marketSettings = claude ? config.extraKnownMarketplaces ?? {} : config.marketplaces ?? {}
    return {
      related, markets,
      entries: Object.fromEntries(Object.entries(pluginSettings).filter(([key]) => bareName(key) === target.plugin)),
      declaration: marketSettings[paths.marketName] ?? null,
      consumers,
      configuredConsumers: Object.fromEntries(Object.entries(pluginSettings).filter(([key]) => usesMarket(key)))
    }
  })
})

export const nativeAbsent = (inventory: NativeInventory): boolean =>
  inventory.related.length === 0 && inventory.markets.length === 0 && Object.keys(inventory.entries).length === 0 &&
  inventory.declaration === null && inventory.consumers.length === 0 && Object.keys(inventory.configuredConsumers).length === 0

export const readCatalog = (target: Target) => inspectIO(async () => {
  const text = await optionalText(join(targetPaths(target).market, target.destination.host === "claude_code" ? ".claude-plugin/marketplace.json" : ".agents/plugins/marketplace.json"))
  return text === null ? null : parseJson(text)
})

export const inventoryFacts = (inventory: NativeInventory, catalog: Json): Facts => ({
  plugins: inventory.related.map(stable),
  marketplaces: inventory.markets.map(stable),
  config: { plugins: inventory.entries, marketplace: inventory.declaration },
  catalog
})

export const marketplaceMatches = (target: Target, inventory: NativeInventory): boolean => {
  const market = inventory.markets[0]
  if (inventory.markets.length !== 1 || market === undefined || inventory.declaration === null) return false
  const paths = targetPaths(target)
  if (target.destination.host === "claude_code") {
    const registered = Schema.decodeUnknownSync(Schema.Struct({ source: Schema.String, path: Schema.String, installLocation: Schema.String }))(market)
    const declared = decodeObject(inventory.declaration).source ?? null
    return registered.source === "directory" && registered.path === paths.market && registered.installLocation === paths.market &&
      sameJson(declared, { source: "directory", path: paths.market })
  }
  const registered = Schema.decodeUnknownSync(Schema.Struct({ root: Schema.String, marketplaceSource: Schema.Struct({ sourceType: Schema.String, source: Schema.String }) }))(market)
  return registered.root === paths.market && registered.marketplaceSource.sourceType === "local" && registered.marketplaceSource.source === paths.market &&
    sameJson(inventory.declaration, { source_type: "local", source: paths.market })
}

export const nativeState = Effect.fnUntraced(function*(target: Target, inventory: NativeInventory) {
  if (nativeAbsent(inventory)) return { type: "absent" } satisfies NativeState
  const facts = inventoryFacts(inventory, yield* readCatalog(target))
  return yield* inspectIO(async (): Promise<NativeState> => {
    const row = inventory.related[0]
    if (inventory.related.length !== 1 || row === undefined || !marketplaceMatches(target, inventory)) return { type: "unverified", facts }
    const paths = targetPaths(target)
    const selector = `${target.plugin}@${paths.marketName}`
    if (target.destination.host === "claude_code") {
      const selected = Schema.decodeUnknownSync(ClaudeSelector)(row)
      const installed = Schema.decodeUnknownSync(ClaudeInstallation)(row)
      if (selected.id !== selector || !installed.enabled || inventory.entries[selector] !== true) return { type: "unverified", facts }
      return { type: "candidate", facts, source: installed.readFromFolder, loaded: installed.readFromFolder }
    }
    const selected = Schema.decodeUnknownSync(CodexSelector)(row)
    const installed = Schema.decodeUnknownSync(CodexInstallation)(row)
    const enabled = inventory.entries[selector] === undefined ? null : decodeObject(inventory.entries[selector])
    if (selected.pluginId !== selector || !installed.installed || !installed.enabled || installed.marketplaceName !== paths.marketName ||
      enabled?.enabled !== true || installed.marketplaceSource.source !== paths.market) return { type: "unverified", facts }
    const cacheRoot = join(target.destination.home, "plugins/cache", paths.marketName, target.plugin)
    const loaded = resolve(cacheRoot, installed.version)
    if (!inside(cacheRoot, loaded) || basename(loaded) !== installed.version) return { type: "unverified", facts }
    return { type: "candidate", facts, source: installed.source.path, loaded }
  })
})
