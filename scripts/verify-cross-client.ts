import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, FileSystem, Layer, Match, Schema } from "effect"
import { Bundle, Compiler, PackageFile, type Format } from "../contracts/Compiler.ts"
import { ApplyOutcome, Installer, type Destination, type Host, type Planning, type ReadyPlan } from "../contracts/Installer.ts"
import { Directory, Plugin } from "../contracts/Plugin.ts"
import { PluginSdkLive } from "../src/node.ts"
import { discoverCodexSkills } from "./pilot/app-server.ts"

type Client = { readonly host: Extract<Host, "claude_code" | "codex">; readonly format: Format }
const clients: ReadonlyArray<Client> = [
  { host: "claude_code", format: "claude_code" },
  { host: "codex", format: "codex" }
]
const sameFiles = Schema.toEquivalence(Schema.Array(PackageFile))
const sameOutcome = Schema.toEquivalence(ApplyOutcome)
const allowedEnvironment = new Set(["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ"])
for (const key of Object.keys(process.env)) if (!allowedEnvironment.has(key)) delete process.env[key]

class ExampleFailed extends Schema.TaggedError<ExampleFailed, { readonly brand: unique symbol }>()("ExampleFailed", {
  message: Schema.NonEmptyString,
  cause: Schema.optionalKey(Schema.Defect())
}) {}

const io = <A>(message: string, run: () => Promise<A>) => Effect.tryPromise({
  try: run, catch: (cause) => new ExampleFailed({ message, cause })
})
const ready = (planning: Planning): Effect.Effect<ReadyPlan, ExampleFailed> => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => Effect.succeed(plan),
    repair_ready: () => Effect.fail(new ExampleFailed({ message: "Unexpected repair in an isolated example" })),
    unchanged: () => Effect.fail(new ExampleFailed({ message: "Expected a new installation plan" })),
    blocked: ({ reason }) => Effect.fail(new ExampleFailed({ message: `Example plan blocked: ${reason}` })),
    pending: () => Effect.fail(new ExampleFailed({ message: "Unexpected pending operation in an isolated example" }))
  })
)

const installedReceipt = (outcome: ApplyOutcome) => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    uncertain: () => assert.fail("Installation outcome is uncertain"),
    completed: ({ result }) => Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
      installed: ({ receipt }) => receipt,
      removed: () => assert.fail("Installation returned a removal"),
      not_applied: () => assert.fail("Installation did not apply")
    }))
  })
)

const ClaudePlugins = Schema.Array(Schema.Struct({
  id: Schema.String, enabled: Schema.Boolean, readFromFolder: Schema.String, scope: Schema.String
}))

const claude = Effect.fn("Example.claude")(function*(args: ReadonlyArray<string>, cwd: string, env: NodeJS.ProcessEnv) {
  return yield* Effect.try({
    try: () => {
      const result = spawnSync("claude", [...args], { cwd, env, encoding: "utf8", timeout: 30_000 })
      if (result.error !== undefined) throw result.error
      if (result.status !== 0) throw new Error(`Claude command failed: ${result.stderr}`)
      return result.stdout
    },
    catch: (cause) => new ExampleFailed({ message: `Claude ${args.join(" ")} failed`, cause })
  })
})

const claudeInventory = (cwd: string, env: NodeJS.ProcessEnv) => claude(["plugin", "list", "--json"], cwd, env).pipe(
  Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ClaudePlugins)))
)

const program = Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const compiler = yield* Compiler
  const installer = yield* Installer
  const source = resolve("examples/release-notes")
  const definition = yield* fs.readFileString(join(source, "definition.json"))
  const plugin = yield* Schema.decodeEffect(Schema.fromJsonString(Plugin), { onExcessProperty: "error" })(definition)
  const output = resolve(".pluginsdk/cross-client")
  yield* fs.makeDirectory(output, { recursive: true })
  yield* fs.remove(join(output, "report.json"), { force: true })
  const isolated = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-cross-client-" })
  const report: Array<{ host: Client["host"]; version: string; format: Format; digest: string; discovered: string; removed: boolean }> = []
  let sharedFiles: ReadonlyArray<PackageFile> | undefined

  for (const client of clients) {
    yield* Console.log(`Building ${plugin.id} for ${client.host} from examples/release-notes/definition.json`)
    const bundle = yield* compiler.build({ root: Directory.make(source), plugin, format: client.format })
    const skills = bundle.files.filter((file) => file.path.startsWith("skills/"))
    if (sharedFiles !== undefined) assert.ok(sameFiles(sharedFiles, skills), "Clients received different shared skill bytes")
    sharedFiles = skills
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Bundle, { space: 2 }))(bundle)
    yield* fs.writeFileString(join(output, `${client.host}.bundle.json`), encoded + "\n")

    const homeRoot = join(isolated, client.host)
    const home = join(homeRoot, "config")
    yield* fs.makeDirectory(home, { recursive: true })
    const destination: Destination = { type: "user", host: client.host, home: Directory.make(home) }
    const install = yield* ready(yield* installer.plan({ destination, intent: { type: "present", bundle } }))
    const installed = yield* installer.apply(install)
    assert.equal(installedReceipt(installed).identity.bundle, bundle.digest)
    assert.ok(sameOutcome(installed, yield* installer.apply(install)), "Install replay changed its outcome")

    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH, HOME: homeRoot, CODEX_HOME: home, CLAUDE_CONFIG_DIR: home,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CI: "1", NO_COLOR: "1", TERM: "dumb"
    }
    const discovered = yield* Match.value(client.host).pipe(
      Match.when("claude_code", () => Effect.gen(function*() {
        const row = (yield* claudeInventory(homeRoot, env)).find((entry) => entry.id.startsWith(`${plugin.id}@pluginsdk-`))
        assert.ok(row, "Claude did not discover the installed plugin")
        assert.equal(row.enabled, true)
        assert.equal(row.scope, "user")
        assert.match(yield* claude(["plugin", "details", row.id], homeRoot, env), /Skills \(1\)\s+release-notes/u)
        return join(row.readFromFolder, "skills/release-notes/SKILL.md")
      })),
      Match.when("codex", () => io("Discover the installed Codex skill", async () => {
        const skills = await discoverCodexSkills(homeRoot, env)
        const skill = skills.find((entry) => entry.pluginId?.startsWith(`${plugin.id}@pluginsdk-`) && entry.name.endsWith(":release-notes"))
        assert.ok(skill, "Codex did not discover the installed plugin skill")
        assert.equal(skill.enabled, true)
        return skill.path
      })),
      Match.exhaustive
    )
    for (const file of skills) {
      const installedPath = join(dirname(discovered), file.path.slice("skills/release-notes/".length))
      assert.ok(Buffer.from(yield* fs.readFile(installedPath)).equals(Buffer.from(file.content)), `Installed bytes differ at ${file.path}`)
    }
    yield* Console.log(`${client.host}: discovered release-notes; shared skill bytes match; replay passed`)

    const removal = yield* ready(yield* installer.plan({ destination, intent: { type: "absent", plugin: plugin.id } }))
    const removed = yield* installer.apply(removal)
    assert.deepEqual(yield* Schema.encodeEffect(ApplyOutcome)(removed), { type: "completed", result: { type: "removed" } })
    yield* Match.value(client.host).pipe(
      Match.when("claude_code", () => Effect.gen(function*() {
        assert.equal((yield* claudeInventory(homeRoot, env)).some((row) => row.id.startsWith(`${plugin.id}@pluginsdk-`)), false)
      })),
      Match.when("codex", () => io("Verify Codex removal", async () => {
        assert.equal((await discoverCodexSkills(homeRoot, env)).some((row) => row.pluginId?.startsWith(`${plugin.id}@pluginsdk-`)), false)
      })),
      Match.exhaustive
    )
    report.push({ host: client.host, version: install.target.version, format: client.format, digest: bundle.digest, discovered: "release-notes", removed: true })
    yield* Console.log(`${client.host}: removal verified`)
  }
  yield* fs.writeFileString(join(output, "report.json"), JSON.stringify({ definition: "examples/release-notes/definition.json", sharedSkillBytesEqual: true, clients: report }, null, 2) + "\n")
  yield* Console.log(`One maintained definition; both native clients verified. Bundles and report: ${output}`)
})).pipe(Effect.provide(Layer.provideMerge(PluginSdkLive, NodeServices.layer)))

NodeRuntime.runMain(program)
