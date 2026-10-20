import { constants } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { Effect, Exit, Match, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import { PackageFile } from "../../contracts/Compiler.ts"
import { PlanId, ReadyPlan, Target, type Observation } from "../../contracts/Installer.ts"
import { PackagePath } from "../../contracts/Plugin.ts"
import { inside } from "../compiler/capture.ts"
import { validateBundle } from "../compiler/native.ts"
import { bundleDigest, commitment, fileDigest, fingerprint, planId } from "../internal/identity.ts"
import { canonicalJson, parseJson, type Json } from "../internal/json.ts"
import { profiles, runHost, supportedHost } from "./host.ts"
import { Installed } from "./records.ts"
import { catalogFor } from "./recipe.ts"
import { readRecord } from "./storage.ts"
import { targetPaths } from "./target.ts"

class InspectionUnavailable extends Schema.TaggedError<InspectionUnavailable, { readonly brand: unique symbol }>()("InspectionUnavailable", { cause: Schema.Defect() }) {}

type Facts = Schema.JsonObject
type NativeState =
  | { type: "absent" }
  | { type: "unverified"; facts: Facts }
  | { type: "candidate"; facts: Facts; source: string; loaded: string }

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
const sameTarget = Schema.toEquivalence(Target)
const sameBundle = Schema.toEquivalence(Installed.fields.bundle)
const sameFiles = Schema.toEquivalence(Schema.Array(PackageFile))
const decodeObject = Schema.decodeUnknownSync(Schema.JsonObject)
const decodeRows = Schema.decodeUnknownSync(ObjectRows)
const encodeTarget = Schema.encodeSync(Target)
const bareName = (selector: string) => selector.split("@")[0]
const stable = (row: Facts): Facts => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "installedAt" && key !== "lastUpdated"))
const sameJson = (left: Json, right: Json) => canonicalJson(left) === canonicalJson(right)
const inspectIO = <A>(operation: () => Promise<A>) => Effect.tryPromise({ try: operation, catch: (cause) => new InspectionUnavailable({ cause }) })

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

const nativeState = (target: Target, pluginText: string, marketText: string) => inspectIO(async (): Promise<NativeState> => {
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
  const markets = allMarkets.filter((row) => Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }))(row).name === paths.marketName)
  const configPath = claude
    ? target.destination.type === "user" ? join(target.destination.home, "settings.json") : join(target.destination.root, ".claude/settings.json")
    : join(target.destination.home, "config.toml")
  const text = await optionalText(configPath)
  const configValue: unknown = text === null ? {} : claude ? parseJson(text) : parseToml(text)
  const config = Schema.decodeUnknownSync(Settings)(configValue)
  const pluginSettings = claude ? config.enabledPlugins ?? {} : config.plugins ?? {}
  const marketSettings = claude ? config.extraKnownMarketplaces ?? {} : config.marketplaces ?? {}
  const entries = Object.fromEntries(Object.entries(pluginSettings).filter(([key]) => bareName(key) === target.plugin))
  const declaration = marketSettings[paths.marketName] ?? null
  if (related.length === 0 && markets.length === 0 && Object.keys(entries).length === 0 && declaration === null) return { type: "absent" }
  const sourceText = await optionalText(join(paths.market, claude ? ".claude-plugin/marketplace.json" : ".agents/plugins/marketplace.json"))
  const catalog = sourceText === null ? null : parseJson(sourceText)
  const facts: Facts = { plugins: related.map(stable), marketplaces: markets.map(stable), config: { plugins: entries, marketplace: declaration }, catalog }
  const row = related[0]
  const market = markets[0]
  if (related.length !== 1 || markets.length !== 1 || row === undefined || market === undefined) return { type: "unverified", facts }
  const selector = `${target.plugin}@${paths.marketName}`
  if (claude) {
    const selected = Schema.decodeUnknownSync(ClaudeSelector)(row)
    if (selected.id !== selector) return { type: "unverified", facts }
    const installed = Schema.decodeUnknownSync(ClaudeInstallation)(row)
    const registered = Schema.decodeUnknownSync(Schema.Struct({ source: Schema.String, path: Schema.String, installLocation: Schema.String }))(market)
    const declared = declaration === null ? null : decodeObject(declaration).source ?? null
    if (!installed.enabled || entries[selector] !== true || registered.source !== "directory" ||
      registered.path !== paths.market || registered.installLocation !== paths.market ||
      !sameJson(declared, { source: "directory", path: paths.market })) return { type: "unverified", facts }
    return { type: "candidate", facts, source: installed.readFromFolder, loaded: installed.readFromFolder }
  }
  const selected = Schema.decodeUnknownSync(CodexSelector)(row)
  if (selected.pluginId !== selector) return { type: "unverified", facts }
  const installed = Schema.decodeUnknownSync(CodexInstallation)(row)
  const registered = Schema.decodeUnknownSync(Schema.Struct({ root: Schema.String, marketplaceSource: Schema.Struct({ sourceType: Schema.String, source: Schema.String }) }))(market)
  const enabled = entries[selector] === undefined ? null : decodeObject(entries[selector])
  if (!installed.installed || !installed.enabled || installed.marketplaceName !== paths.marketName || enabled?.enabled !== true ||
    installed.marketplaceSource.source !== paths.market || registered.root !== paths.market ||
    registered.marketplaceSource.sourceType !== "local" || registered.marketplaceSource.source !== paths.market ||
    declaration === null || !sameJson(declaration, { source_type: "local", source: paths.market })) return { type: "unverified", facts }
  const cacheRoot = join(target.destination.home, "plugins/cache", paths.marketName, target.plugin)
  const loaded = resolve(cacheRoot, installed.version)
  if (!inside(cacheRoot, loaded) || basename(loaded) !== installed.version) return { type: "unverified", facts }
  return { type: "candidate", facts, source: installed.source.path, loaded }
})

const readTree = async (root: string): Promise<PackageFile[]> => {
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Payload root is not a physical directory")
  const files: PackageFile[] = []
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name)
      const logical = prefix === "" ? name : `${prefix}/${name}`
      const info = await lstat(path)
      if (info.isSymbolicLink()) throw new Error("Native payload contains a symbolic link")
      if (info.isDirectory()) { await walk(path, logical); continue }
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        if (!inside(root, await realpath(`/proc/self/fd/${file.fd}`))) throw new Error("Native payload escaped its root")
        const before = await file.stat({ bigint: true })
        if (!before.isFile()) throw new Error("Native payload contains a special file")
        const content = new Uint8Array(await file.readFile())
        const after = await file.stat({ bigint: true })
        if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Native payload changed during inspection")
        files.push({ path: PackagePath.make(logical), content, executable: (before.mode & 0o111n) !== 0n })
      } finally { await file.close() }
    }
  }
  await walk(root, "")
  return files.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
}

const verifyCandidate = Effect.fnUntraced(function*(target: Target, native: Extract<NativeState, { type: "candidate" }>) {
  const paths = targetPaths(target)
  const id = Schema.decodeExit(PlanId)(basename(native.source))
  if (Exit.isFailure(id) || native.source !== join(paths.market, "payloads", basename(native.source))) return { identity: null, facts: native.facts }
  const marker = yield* readRecord(target.key, join(paths.markers, `${id.value}.json`), Installed)
  const plan = yield* readRecord(target.key, join(paths.plans, `${id.value}.json`), ReadyPlan)
  const facts: Facts = { ...native.facts, candidate: id.value, marker: marker === null ? null : { target: encodeTarget(marker.target), identity: marker.identity, bundle: marker.bundle.digest }, retainedPlan: plan?.id ?? null }
  if (marker === null || plan === null || plan.change.type === "remove") return { identity: null, facts }
  const approvedBundle = plan.change.bundle
  const binding = yield* Effect.try({
    try: () => {
      validateBundle(marker.bundle)
      return plan.id === id.value && planId(plan) === id.value && sameTarget(plan.target, target) && sameTarget(marker.target, target) &&
        marker.identity.plan === id.value && marker.identity.bundle === marker.bundle.digest && sameBundle(approvedBundle, marker.bundle) &&
        sameJson(catalogFor(plan), native.facts.catalog ?? null)
    },
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  const actual = yield* inspectIO(async () => {
    const staged = await readTree(native.source)
    const loaded = native.loaded === native.source ? staged : await readTree(native.loaded)
    const treeIdentity = (files: PackageFile[]) => commitment("native-tree", files.map((file) => ({ path: file.path, digest: fileDigest(file.content), executable: file.executable })))
    const [head, ...tail] = loaded
    const digest = head === undefined ? null : bundleDigest({ ...marker.bundle, files: [head, ...tail] })
    return { matches: sameFiles(staged, marker.bundle.files) && sameFiles(loaded, marker.bundle.files) && digest === marker.bundle.digest, staged: treeIdentity(staged), loaded: treeIdentity(loaded) }
  })
  return { identity: binding && actual.matches ? marker.identity : null, facts: { ...facts, payload: { staged: actual.staged, loaded: actual.loaded } } }
})

export const observe = Effect.fnUntraced(function*(target: Target) {
  const host = supportedHost(target.destination.host)
  if (host === null || target.profile !== profiles[host].revision || target.version !== profiles[host].version) return { type: "unknown" } satisfies Observation
  return yield* Effect.gen(function*() {
    const plugins = yield* runHost(target.destination, ["plugin", "list", "--json"])
    const markets = yield* runHost(target.destination, ["plugin", "marketplace", "list", "--json"])
    const native = yield* nativeState(target, plugins, markets)
    return yield* Match.value(native).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => Effect.succeed<Observation>({ type: "absent" }),
      unverified: (native) => Effect.succeed<Observation>({ type: "present", identity: null, fingerprint: fingerprint(target.profile, native.facts) }),
      candidate: (native) => verifyCandidate(target, native).pipe(Effect.map((verified): Observation => ({ type: "present", identity: verified.identity, fingerprint: fingerprint(target.profile, verified.facts) })))
    }))
  }).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed<Observation>({ type: "unknown" }),
    HostUnavailable: () => Effect.succeed<Observation>({ type: "unknown" }),
    StateUnavailable: () => Effect.succeed<Observation>({ type: "unknown" })
  }))
})
