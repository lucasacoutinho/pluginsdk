import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import { BuildRequest, Compiler, Format, type Bundle } from "../../contracts/Compiler.ts"
import { Destination, Installer, type ApplyOutcome, type Destination as DestinationType, type Planning, type ReadyPlan } from "../../contracts/Installer.ts"
import { PluginSdkLive } from "../../src/node.ts"

type SupportedHost = "claude_code" | "codex"
type Scope = "user" | "project"
type Scenario =
  | { readonly host: "claude_code"; readonly scope: Scope }
  | { readonly host: "codex"; readonly scope: "user" }

type Variant = {
  readonly label: string
  readonly bytes: Uint8Array
}

type Fixture = {
  readonly root: string
  readonly processHome: string
  readonly home: string
  readonly homeAlias: string
  readonly projectRoot: string
  readonly sourceRoot: string
  readonly host: SupportedHost
  readonly scope: Scope
  readonly destination: DestinationType
}

type NativeLocation = {
  readonly source: string
  readonly loaded: string
}

const pluginId = "native-fixture"
const pluginVersion = "1.0.0"
const skillName = "review"
const binaryPath = `skills/${skillName}/bin/runner`
const initial: Variant = { label: "first payload", bytes: new Uint8Array([0, 255, 128, 1, 13]) }
const changed: Variant = { label: "replacement payload", bytes: new Uint8Array([9, 0, 64, 255, 2]) }
const damaged = new Uint8Array([7, 7, 7, 7])

const scenarios: ReadonlyArray<Scenario> = [
  { host: "claude_code", scope: "user" },
  { host: "claude_code", scope: "project" },
  { host: "codex", scope: "user" }
]

const nativeHosts: ReadonlyArray<SupportedHost> = ["claude_code", "codex"]

const ClaudePlugin = Schema.Struct({
  id: Schema.NonEmptyString,
  scope: Schema.String,
  enabled: Schema.Boolean,
  installPath: Schema.NonEmptyString,
  readFromFolder: Schema.NonEmptyString
})

const ClaudeInventory = Schema.Array(ClaudePlugin)

const CodexPlugin = Schema.Struct({
  pluginId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  marketplaceName: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  installed: Schema.Boolean,
  enabled: Schema.Boolean,
  source: Schema.Struct({
    source: Schema.Literal("local"),
    path: Schema.NonEmptyString
  })
})

const CodexInventory = Schema.Struct({
  installed: Schema.Array(CodexPlugin),
  available: Schema.Array(Schema.JsonObject)
})

const ClaudeSettings = Schema.Struct({ theme: Schema.Literal("dark") })
const CodexSettings = Schema.Struct({ model: Schema.Literal("gpt-5.1-codex") })
const PluginSdkTestLive = Layer.provideMerge(PluginSdkLive, NodeServices.layer)

class NativeCommandFailed extends Schema.TaggedError<NativeCommandFailed, { readonly brand: unique symbol }>()("NativeCommandFailed", {
  command: Schema.NonEmptyString,
  cause: Schema.Defect()
}) {}

class NativeInventoryInvalid extends Schema.TaggedError<NativeInventoryInvalid, { readonly brand: unique symbol }>()("NativeInventoryInvalid", {
  detail: Schema.NonEmptyString
}) {}

const formatFor = (host: SupportedHost): Format => Match.value(host).pipe(
  Match.when("claude_code", (): Format => "claude_code"),
  Match.when("codex", (): Format => "codex"),
  Match.exhaustive
)

const toolPath = (root: string): string => join(root, binaryPath)

const skillMarkdown = (variant: Variant): string => [
  "---",
  `name: ${skillName}`,
  "description: Native lifecycle integration fixture.",
  "---",
  `# ${skillName}`,
  variant.label,
  ""
].join("\n")

const makeDestination = (host: SupportedHost, scope: Scope, home: string, projectRoot: string) =>
  Schema.decodeUnknownSync(Destination)(scope === "user"
    ? { type: "user", host, home }
    : { type: "project", host, home, root: projectRoot })

const makeFixture = Effect.fnUntraced(function*(scenario: Scenario) {
  const fs = yield* FileSystem.FileSystem
  const temporaryBase = join(homedir(), ".cache")
  yield* fs.makeDirectory(temporaryBase, { recursive: true })
  const root = yield* fs.makeTempDirectoryScoped({ directory: temporaryBase, prefix: "pluginsdk-native-" })
  const processHome = join(root, "home")
  const hostDirectory = Match.value(scenario.host).pipe(
    Match.when("claude_code", () => ".claude"),
    Match.when("codex", () => ".codex"),
    Match.exhaustive
  )
  const home = join(processHome, hostDirectory)
  const homeAlias = join(root, "aliases", hostDirectory)
  const projectRoot = join(root, "project")
  const sourceRoot = join(root, "source")
  yield* fs.makeDirectory(home, { recursive: true })
  yield* fs.makeDirectory(projectRoot, { recursive: true })
  yield* fs.makeDirectory(sourceRoot, { recursive: true })
  return {
    root,
    processHome,
    home,
    homeAlias,
    projectRoot,
    sourceRoot,
    host: scenario.host,
    scope: scenario.scope,
    destination: makeDestination(scenario.host, scenario.scope, home, projectRoot)
  } satisfies Fixture
})

const settingsPath = (fixture: Fixture): string => Match.value(fixture.host).pipe(
  Match.when("claude_code", () => fixture.scope === "project"
    ? join(fixture.projectRoot, ".claude", "settings.json")
    : join(fixture.home, "settings.json")),
  Match.when("codex", () => join(fixture.home, "config.toml")),
  Match.exhaustive
)

const seedSettings = Effect.fnUntraced(function*(fixture: Fixture) {
  const fs = yield* FileSystem.FileSystem
  const path = settingsPath(fixture)
  yield* fs.makeDirectory(dirname(path), { recursive: true })
  const contents = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => JSON.stringify({ theme: "dark" })),
    Match.when("codex", () => 'model = "gpt-5.1-codex"\n'),
    Match.exhaustive
  )
  yield* fs.writeFileString(path, contents)
})

const writeSource = Effect.fnUntraced(function*(sourceRoot: string, variant: Variant) {
  const fs = yield* FileSystem.FileSystem
  const skillRoot = join(sourceRoot, "skills", skillName)
  const executable = toolPath(sourceRoot)
  yield* fs.makeDirectory(dirname(executable), { recursive: true })
  yield* fs.writeFileString(join(skillRoot, "SKILL.md"), skillMarkdown(variant))
  yield* fs.writeFile(executable, variant.bytes)
  yield* fs.chmod(executable, 0o755)
})

const buildBundle = (fixture: Fixture, sourceRoot: string) => Compiler.use((compiler) => compiler.build(
  Schema.decodeSync(BuildRequest)({
    root: sourceRoot,
    format: formatFor(fixture.host),
    plugin: {
      id: pluginId,
      version: pluginVersion,
      description: "Native lifecycle fixture",
      skills: [`skills/${skillName}`],
      mcp: {}
    }
  })
))

const nativeRun = (fixture: Fixture, args: ReadonlyArray<string>) => {
  const binary = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => "claude"),
    Match.when("codex", () => "codex"),
    Match.exhaustive
  )
  const cwd = fixture.scope === "project" ? fixture.projectRoot : fixture.processHome
  return Effect.tryPromise({
    try: () => new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd,
        env: {
          ...process.env,
          HOME: fixture.processHome,
          CLAUDE_CONFIG_DIR: fixture.home,
          CODEX_HOME: fixture.home,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      })
      let stdout = ""
      let stderr = ""
      child.stdout?.setEncoding("utf8")
      child.stderr?.setEncoding("utf8")
      child.stdout?.on("data", (chunk: string) => { stdout += chunk })
      child.stderr?.on("data", (chunk: string) => { stderr += chunk })
      child.once("error", reject)
      child.once("close", (code) => {
        if (code === 0) resolve(stdout)
        else reject(new Error(`${binary} exited with code ${String(code)}: ${stderr}`))
      })
    }),
    catch: (cause) => new NativeCommandFailed({ command: `${binary} ${args.join(" ")}`, cause })
  })
}

const decodedJson = (text: string) => {
  const value: unknown = JSON.parse(text)
  return Schema.decodeUnknownSync(Schema.Json)(value)
}

const nativeLocation = Effect.fnUntraced(function*(fixture: Fixture) {
  const text = yield* nativeRun(fixture, ["plugin", "list", "--json"])
  return yield* Match.value(fixture.host).pipe(
    Match.when("claude_code", () => Effect.gen(function*() {
      const inventory = yield* Schema.decodeUnknownEffect(ClaudeInventory)(decodedJson(text))
      const rows = inventory.filter((row) => row.id.split("@")[0] === pluginId && row.scope === fixture.scope)
      const row = rows[0]
      if (rows.length !== 1 || row === undefined || !row.enabled) return yield* new NativeInventoryInvalid({ detail: "Expected exactly one enabled Claude plugin row" })
      return { source: row.readFromFolder, loaded: row.readFromFolder }
    })),
    Match.when("codex", () => Effect.gen(function*() {
      const inventory = yield* Schema.decodeUnknownEffect(CodexInventory)(decodedJson(text))
      const rows = inventory.installed.filter((row) => row.name === pluginId)
      const row = rows[0]
      if (rows.length !== 1 || row === undefined || !row.installed || !row.enabled) return yield* new NativeInventoryInvalid({ detail: "Expected exactly one enabled Codex plugin row" })
      return {
        source: row.source.path,
        loaded: join(fixture.home, "plugins", "cache", row.marketplaceName, row.name, row.version)
      }
    })),
    Match.exhaustive
  )
})

const assertPayloadAt = Effect.fnUntraced(function*(root: string, variant: Variant) {
  const fs = yield* FileSystem.FileSystem
  expect(yield* fs.readFileString(join(root, "skills", skillName, "SKILL.md"))).toBe(skillMarkdown(variant))
  expect(Array.from(yield* fs.readFile(join(root, binaryPath)))).toEqual(Array.from(variant.bytes))
  const info = yield* fs.stat(join(root, binaryPath))
  expect(info.type).toBe("File")
  expect((info.mode & 0o111) !== 0).toBe(true)
})

const assertPayload = Effect.fnUntraced(function*(location: NativeLocation, variant: Variant) {
  yield* assertPayloadAt(location.source, variant)
  if (location.loaded !== location.source) yield* assertPayloadAt(location.loaded, variant)
})

const planReason = (planning: Planning): string => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: () => "ready",
    repair_ready: () => "repair_ready",
    unchanged: () => "unchanged",
    blocked: ({ reason }) => reason,
    pending: () => "pending"
  })
)

const requireReady = (planning: Planning): ReadyPlan => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => plan,
    repair_ready: () => { throw new Error("Expected an ordinary ready plan, received repair") },
    unchanged: () => { throw new Error("Expected a ready plan, received unchanged") },
    blocked: ({ reason }) => { throw new Error(`Expected a ready plan, received blocked: ${reason}`) },
    pending: () => { throw new Error("Expected a ready plan, received pending") }
  })
)

const outcomeType = (outcome: ApplyOutcome): string => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    uncertain: () => "uncertain",
    completed: ({ result }) => Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
      installed: () => "installed",
      removed: () => "removed",
      not_applied: () => "not_applied"
    }))
  })
)

const targetKey = (planning: Planning): string => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => String(plan.target.key),
    repair_ready: (plan) => String(plan.target.key),
    unchanged: ({ target }) => String(target.key),
    blocked: ({ target }) => String(target.key),
    pending: ({ plan }) => String(plan.target.key)
  })
)

const stalePlanReason = Effect.fnUntraced(function*(installer: typeof Installer.Service, plan: ReadyPlan) {
  const result = yield* Effect.result(installer.apply(plan))
  return Match.value(result).pipe(Match.tagsExhaustive({
    Failure: ({ failure }) => Match.value(failure).pipe(Match.tagsExhaustive({
      DestinationUnsupported: () => "destination_unsupported",
      HostUnavailable: () => "host_unavailable",
      StateUnavailable: () => "state_unavailable",
      PlanRejected: ({ reason }) => reason
    })),
    Success: () => "succeeded"
  }))
})

const replacementSource = (fixture: Fixture): string => join(fixture.root, "replacement-source")

const lifecycle = (scenario: Scenario) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const fixture = yield* makeFixture(scenario)
  yield* seedSettings(fixture)
  yield* writeSource(fixture.sourceRoot, initial)
  const bundle = yield* buildBundle(fixture, fixture.sourceRoot)
  const installer = yield* Installer

  const installPlan = requireReady(yield* installer.plan({
    destination: fixture.destination,
    intent: { type: "present", bundle }
  }))
  expect(installPlan.change.type).toBe("install")
  const installed = yield* installer.apply(installPlan)
  expect(outcomeType(installed)).toBe("installed")
  const location = yield* nativeLocation(fixture)
  yield* assertPayload(location, initial)

  const replay = yield* installer.apply(installPlan)
  expect(replay).toStrictEqual(installed)
  const noOp = yield* installer.plan({ destination: fixture.destination, intent: { type: "present", bundle } })
  expect(planReason(noOp)).toBe("unchanged")

  const damagedPath = join(location.loaded, binaryPath)
  yield* fs.writeFile(damagedPath, damaged)
  yield* writeSource(replacementSource(fixture), changed)
  const replacement = yield* buildBundle(fixture, replacementSource(fixture))
  expect(replacement.digest).not.toBe(bundle.digest)
  const driftedUpdate = yield* installer.plan({ destination: fixture.destination, intent: { type: "present", bundle: replacement } })
  expect(planReason(driftedUpdate)).toBe("drift")
  const driftedRemoval = yield* installer.plan({ destination: fixture.destination, intent: { type: "absent", plugin: bundle.plugin } })
  expect(planReason(driftedRemoval)).toBe("drift")

  yield* fs.writeFile(damagedPath, initial.bytes)
  yield* fs.chmod(damagedPath, 0o755)
  const restored = yield* installer.plan({ destination: fixture.destination, intent: { type: "present", bundle } })
  expect(planReason(restored)).toBe("unchanged")

  yield* fs.makeDirectory(dirname(fixture.homeAlias), { recursive: true })
  yield* fs.symlink(fixture.home, fixture.homeAlias)
  const aliasDestination = makeDestination(fixture.host, fixture.scope, fixture.homeAlias, fixture.projectRoot)
  const aliased = yield* installer.plan({ destination: aliasDestination, intent: { type: "present", bundle } })
  expect(planReason(aliased)).toBe("unchanged")
  expect(targetKey(aliased)).toBe(installPlan.target.key)

  const replacePlan = requireReady(yield* installer.plan({
    destination: fixture.destination,
    intent: { type: "present", bundle: replacement }
  }))
  expect(replacePlan.change.type).toBe("replace")
  yield* fs.writeFile(damagedPath, damaged)
  expect(yield* stalePlanReason(installer, replacePlan)).toBe("stale_plan")
  yield* fs.writeFile(damagedPath, initial.bytes)
  yield* fs.chmod(damagedPath, 0o755)
  const replaced = yield* installer.apply(replacePlan)
  expect(outcomeType(replaced)).toBe("installed")
  const replacedLocation = yield* nativeLocation(fixture)
  yield* assertPayload(replacedLocation, changed)
  expect(yield* stalePlanReason(installer, installPlan)).toBe("stale_plan")

  const removePlan = requireReady(yield* installer.plan({
    destination: fixture.destination,
    intent: { type: "absent", plugin: bundle.plugin }
  }))
  expect(removePlan.change.type).toBe("remove")
  expect(outcomeType(yield* installer.apply(removePlan))).toBe("removed")
  const absent = yield* installer.plan({ destination: fixture.destination, intent: { type: "absent", plugin: bundle.plugin } })
  expect(planReason(absent)).toBe("unchanged")
  expect(Match.value(absent).pipe(Match.discriminatorsExhaustive("type")({
    ready: () => "ready",
    repair_ready: () => "repair_ready",
    unchanged: ({ state }) => state.observed.type,
    blocked: ({ state }) => state.observed.type,
    pending: () => "pending"
  }))).toBe("absent")

  const configText = yield* fs.readFileString(settingsPath(fixture))
  const settingsValue: unknown = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => JSON.parse(configText)),
    Match.when("codex", () => parseToml(configText)),
    Match.exhaustive
  )
  const retained = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => Schema.decodeUnknownSync(ClaudeSettings)(settingsValue).theme),
    Match.when("codex", () => Schema.decodeUnknownSync(CodexSettings)(settingsValue).model),
    Match.exhaustive
  )
  expect(retained).toBe(fixture.host === "claude_code" ? "dark" : "gpt-5.1-codex")
}).pipe(Effect.provide(PluginSdkTestLive))

const writeBundle = Effect.fnUntraced(function*(root: string, bundle: Bundle) {
  const fs = yield* FileSystem.FileSystem
  for (const file of bundle.files) {
    const path = join(root, file.path)
    yield* fs.makeDirectory(dirname(path), { recursive: true })
    yield* fs.writeFile(path, file.content)
    yield* fs.chmod(path, file.executable ? 0o755 : 0o644)
  }
})

const makeForeignMarketplace = Effect.fnUntraced(function*(fixture: Fixture, bundle: Bundle) {
  const fs = yield* FileSystem.FileSystem
  const marketRoot = join(fixture.root, "foreign-marketplace")
  const pluginRoot = join(marketRoot, "plugins", bundle.plugin)
  yield* fs.makeDirectory(pluginRoot, { recursive: true })
  yield* writeBundle(pluginRoot, bundle)
  const catalogPath = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => join(marketRoot, ".claude-plugin", "marketplace.json")),
    Match.when("codex", () => join(marketRoot, ".agents", "plugins", "marketplace.json")),
    Match.exhaustive
  )
  yield* fs.makeDirectory(dirname(catalogPath), { recursive: true })
  const catalog = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => ({
      name: "foreign-fixture",
      owner: { name: "external test fixture" },
      plugins: [{ name: bundle.plugin, source: `./plugins/${bundle.plugin}` }]
    })),
    Match.when("codex", () => ({
      name: "foreign-fixture",
      plugins: [{
        name: bundle.plugin,
        source: { source: "local", path: `./plugins/${bundle.plugin}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity"
      }]
    })),
    Match.exhaustive
  )
  yield* fs.writeFileString(catalogPath, JSON.stringify(catalog))
  return marketRoot
})

const seedUnownedInstall = Effect.fnUntraced(function*(fixture: Fixture, marketRoot: string, bundle: Bundle) {
  const addMarketplace = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => ["plugin", "marketplace", "add", marketRoot, "--scope", "user", "--json"]),
    Match.when("codex", () => ["plugin", "marketplace", "add", marketRoot, "--json"]),
    Match.exhaustive
  )
  yield* nativeRun(fixture, addMarketplace)
  const install = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => ["plugin", "install", `${bundle.plugin}@foreign-fixture`, "--scope", "user", "--json"]),
    Match.when("codex", () => ["plugin", "add", `${bundle.plugin}@foreign-fixture`, "--json"]),
    Match.exhaustive
  )
  yield* nativeRun(fixture, install)
})

const unownedInstall = (host: SupportedHost) => Effect.gen(function*() {
  const fixture = yield* makeFixture({ host, scope: "user" })
  yield* seedSettings(fixture)
  yield* writeSource(fixture.sourceRoot, initial)
  const bundle = yield* buildBundle(fixture, fixture.sourceRoot)
  const marketRoot = yield* makeForeignMarketplace(fixture, bundle)
  yield* seedUnownedInstall(fixture, marketRoot, bundle)
  yield* assertPayload(yield* nativeLocation(fixture), initial)

  const installer = yield* Installer
  const planning = yield* installer.plan({
    destination: fixture.destination,
    intent: { type: "present", bundle }
  })
  expect(planReason(planning)).toBe("unowned")
}).pipe(Effect.provide(PluginSdkTestLive))

for (const scenario of scenarios) {
  it.live(`${scenario.host} ${scenario.scope} native lifecycle`, () => lifecycle(scenario), 240_000)
}

for (const host of nativeHosts) {
  it.live(`${host} same-name foreign installation remains unowned`, () => unownedInstall(host), 120_000)
}
