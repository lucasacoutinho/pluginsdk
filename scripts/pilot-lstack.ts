import assert from "node:assert/strict"
import { inspect } from "node:util"
import { Effect, Match, Schema } from "effect"
import { BuildRequest, Compiler, type Bundle } from "../contracts/Compiler.ts"
import { ApplyOutcome, Installer, type PlanRequest as PlanRequestType, type Planning as PlanningType, type ReadyPlan as ReadyPlanType } from "../contracts/Installer.ts"
import { PluginSdkLive } from "../src/node.ts"
import { assertSameInventory, copySource, formatFor, inspectSource, inventoryDigest, inventorySource, updateSkill, verifyBundle, verifyOnlySkillChanged, type BundleProof, type SourceInventory, type SourceSnapshot } from "./pilot/source.js"
import { createNativeContext, verifyInstalled, verifyRemoved, verifySentinel, type NativeContext, type PilotScenario } from "./pilot/native.js"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { mkdtemp, mkdir, realpath, rm, writeFile, lstat } from "node:fs/promises"

const workspaceRoot = resolve(process.cwd())
const allowedEnvironment = new Set(["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ"])
for (const key of Object.keys(process.env)) if (!allowedEnvironment.has(key)) delete process.env[key]
class PilotFailure extends Schema.TaggedError<PilotFailure, { readonly brand: unique symbol }>()("PilotFailure", {
  operation: Schema.NonEmptyString,
  cause: Schema.Defect()
}) {}
const io = <A>(operation: string, attempt: () => Promise<A>) => Effect.tryPromise({
  try: attempt,
  catch: (cause) => new PilotFailure({ operation, cause })
})
const inside = (root: string, path: string): boolean => {
  const part = relative(root, path)
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}
const scenarios: readonly PilotScenario[] = [
  { name: "claude-user", host: "claude_code", scope: "user" },
  { name: "claude-project", host: "claude_code", scope: "project" },
  { name: "codex-user", host: "codex", scope: "user" }
]

const buildBundle = (source: SourceSnapshot, root: string, host: PilotScenario["host"], version: string) => {
  const request = Schema.decodeSync(BuildRequest)({
    root, format: formatFor(host), plugin: {
      id: source.id, version, description: source.description,
      skills: source.skills.map((skill) => `skills/${skill}`), assets: [...source.assets], mcp: {}
    }
  })
  return Compiler.use((compiler) => compiler.build(request))
}

const ready = (planning: PlanningType, context: string): Effect.Effect<ReadyPlanType, PilotFailure> => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => Effect.succeed(plan),
    unchanged: () => Effect.fail(new PilotFailure({ operation: context, cause: "unexpectedly planned no change" })),
    blocked: ({ reason }) => Effect.fail(new PilotFailure({ operation: context, cause: `blocked: ${reason}` })),
    pending: () => Effect.fail(new PilotFailure({ operation: context, cause: "unexpectedly has a pending plan" }))
  })
)

const review = (plan: ReadyPlanType, context: NativeContext, change: "install" | "replace" | "remove", bundle?: Bundle): ReadyPlanType => {
  assert.equal(plan.target.plugin, "lstack")
  assert.equal(plan.target.destination.host, context.scenario.host)
  assert.equal(plan.target.destination.type, context.scenario.scope)
  assert.equal(plan.before.observed.type, change === "install" ? "absent" : "present")
  Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
    install: ({ bundle: planned }) => { assert.equal(change, "install"); assert.equal(planned.digest, bundle?.digest) },
    replace: ({ bundle: planned }) => { assert.equal(change, "replace"); assert.equal(planned.digest, bundle?.digest) },
    remove: () => assert.equal(change, "remove")
  }))
  return plan
}

const installedDigest = (outcome: ApplyOutcome): Effect.Effect<string, PilotFailure> => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    uncertain: () => Effect.fail(new PilotFailure({ operation: "install receipt", cause: "native apply returned an uncertain outcome" })),
    completed: ({ result }) => Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
      installed: ({ receipt }) => Effect.succeed(receipt.identity.bundle),
      removed: () => Effect.fail(new PilotFailure({ operation: "install receipt", cause: "expected an install receipt" })),
      not_applied: () => Effect.fail(new PilotFailure({ operation: "install receipt", cause: "native apply did not install" }))
    }))
  })
)

const removed = (outcome: ApplyOutcome): Effect.Effect<void, PilotFailure> => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    uncertain: () => Effect.fail(new PilotFailure({ operation: "removal receipt", cause: "native removal returned an uncertain outcome" })),
    completed: ({ result }) => Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
      installed: () => Effect.fail(new PilotFailure({ operation: "removal receipt", cause: "expected a removal result" })),
      removed: () => Effect.void,
      not_applied: () => Effect.fail(new PilotFailure({ operation: "removal receipt", cause: "native removal did not complete" }))
    }))
  })
)

const nextVersion = (version: string): string => {
  const parts = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-[A-Za-z0-9.-]+)?$/u)
  assert.ok(parts, `Cannot create pilot update from ${version}`)
  return `${parts[1]}.${parts[2]}.${Number(parts[3]) + 1}-pilot`
}

type ScenarioReport = {
  readonly name: string
  readonly host: PilotScenario["host"]
  readonly scope: PilotScenario["scope"]
  readonly format: string
  readonly authoredVersion: string
  readonly updatedAuthoredVersion: string
  readonly bundle: { readonly digest: string; readonly files: number; readonly skillFiles: number; readonly assetFiles: number; readonly executables: number }
  readonly initialReceiptBundle: string
  readonly initialHostCliVersion: string
  readonly initialPluginVersion: string
  readonly initialDiscoveredSkills: number
  readonly updated: { readonly digest: string; readonly files: number; readonly executables: number; readonly hostCliVersion: string; readonly pluginVersion: string; readonly discoveredSkills: number }
  readonly removedDiscoveredSkills: number
  readonly replayEqual: boolean
  readonly configSentinelPreserved: boolean
}

const runScenario = (scenario: PilotScenario, tempRoot: string, source: SourceSnapshot, inventory: SourceInventory) => Effect.gen(function*() {
  const scenarioRoot = join(tempRoot, scenario.name)
  const sourceRoot = join(scenarioRoot, "source")
  yield* io(`copy source for ${scenario.name}`, () => copySource(inventory, sourceRoot))
  const context = yield* io(`prepare isolated ${scenario.name}`, () => createNativeContext(scenarioRoot, scenario, sourceRoot))
  const initialInventory = yield* io(`inventory copied source for ${scenario.name}`, () => inventorySource(context.sourceRoot))
  assertSameInventory(inventory, initialInventory)
  const initialBundle: Bundle = yield* buildBundle(source, context.sourceRoot, scenario.host, source.version)
  const initialProof: BundleProof = verifyBundle(initialBundle, source, scenario.host, source.version)
  assertSameInventory(initialInventory, yield* io(`check source after build for ${scenario.name}`, () => inventorySource(context.sourceRoot)))

  const installRequest: PlanRequestType = { destination: context.destination, intent: { type: "present", bundle: initialBundle } }
  const installPlan = review(yield* ready(yield* Installer.use((installer) => installer.plan(installRequest)), scenario.name), context, "install", initialBundle)
  const installOutcome = yield* Installer.use((installer) => installer.apply(installPlan))
  assert.equal(yield* installedDigest(installOutcome), initialBundle.digest)
  const replay = yield* Installer.use((installer) => installer.apply(installPlan))
  assert.deepEqual(replay, installOutcome, "Reviewed install replay changed its result")
  const installedState = yield* io(`fresh ${scenario.name} discovery`, () => verifyInstalled(context, source, initialBundle, source.version))
  yield* io(`verify ${scenario.name} config sentinel`, () => verifySentinel(context))

  const update = yield* io(`update isolated skill for ${scenario.name}`, () => updateSkill(context.sourceRoot))
  const updatedInventory = yield* io(`inventory updated source for ${scenario.name}`, () => inventorySource(context.sourceRoot))
  verifyOnlySkillChanged(initialInventory, updatedInventory, update)
  const updatedVersion = nextVersion(source.version)
  const updatedBundle: Bundle = yield* buildBundle(source, context.sourceRoot, scenario.host, updatedVersion)
  const updatedProof = verifyBundle(updatedBundle, source, scenario.host, updatedVersion, updatedInventory.files)
  assert.notEqual(updatedBundle.digest, initialBundle.digest)
  assertSameInventory(updatedInventory, yield* io(`check source after update build for ${scenario.name}`, () => inventorySource(context.sourceRoot)))

  const updateRequest: PlanRequestType = { destination: context.destination, intent: { type: "present", bundle: updatedBundle } }
  const updatePlan = review(yield* ready(yield* Installer.use((installer) => installer.plan(updateRequest)), scenario.name), context, "replace", updatedBundle)
  const updateOutcome = yield* Installer.use((installer) => installer.apply(updatePlan))
  assert.equal(yield* installedDigest(updateOutcome), updatedBundle.digest)
  const updatedState = yield* io(`fresh ${scenario.name} update discovery`, () => verifyInstalled(context, source, updatedBundle, updatedVersion))
  yield* io(`verify ${scenario.name} config sentinel after update`, () => verifySentinel(context))

  const removeRequest: PlanRequestType = { destination: context.destination, intent: { type: "absent", plugin: initialBundle.plugin } }
  const removePlan = review(yield* ready(yield* Installer.use((installer) => installer.plan(removeRequest)), scenario.name), context, "remove")
  yield* removed(yield* Installer.use((installer) => installer.apply(removePlan)))
  const removedSkillCount = yield* io(`fresh ${scenario.name} removal inventory`, () => verifyRemoved(context, source.id))
  yield* io(`verify ${scenario.name} config sentinel after removal`, () => verifySentinel(context))
  return {
    name: scenario.name, host: scenario.host, scope: scenario.scope, format: initialBundle.format,
    authoredVersion: source.version, updatedAuthoredVersion: updatedVersion,
    bundle: { digest: initialBundle.digest, files: initialProof.files, skillFiles: initialProof.skillFiles, assetFiles: initialProof.assetFiles, executables: initialProof.executables },
    initialHostCliVersion: installPlan.target.version,
    initialPluginVersion: installedState.pluginVersion,
    initialDiscoveredSkills: installedState.discoveredSkills,
    updated: { digest: updatedBundle.digest, files: updatedProof.files, executables: updatedProof.executables, hostCliVersion: updatePlan.target.version, pluginVersion: updatedState.pluginVersion, discoveredSkills: updatedState.discoveredSkills },
    initialReceiptBundle: yield* installedDigest(installOutcome), removedDiscoveredSkills: removedSkillCount,
    replayEqual: true, configSentinelPreserved: true
  }
})

const validateReportPath = (argument: string | undefined) => io("validate report path", async () => {
  if (argument === undefined) return undefined
  const audit = resolve(workspaceRoot, ".audit")
  const path = resolve(workspaceRoot, argument)
  assert.ok(inside(audit, path) && path !== audit, "Report path must be inside workspace .audit")
  await mkdir(audit, { recursive: true })
  assert.equal((await lstat(audit)).isSymbolicLink(), false, "Workspace .audit cannot be a symlink")
  const realAudit = await realpath(audit)
  assert.ok(inside(workspaceRoot, realAudit))
  await mkdir(dirname(path), { recursive: true })
  assert.ok(inside(realAudit, await realpath(dirname(path))), "Report parent must resolve inside workspace .audit")
  try { assert.equal((await lstat(path)).isFile(), true, "Report must be a regular file") } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause
  }
  return path
})

const program = Effect.scoped(Effect.gen(function*() {
  const args = process.argv.slice(2)
  assert.equal(process.platform, "linux", "Native pilot requires Linux")
  const sourceArgument = args[0]
  if (args.length < 1 || args.length > 2 || sourceArgument === undefined || sourceArgument === "") {
    return yield* new PilotFailure({ operation: "arguments", cause: "Usage: node dist/scripts/pilot-lstack.js <installed-lstack-source> [workspace-audit-report.json]" })
  }
  const reportPath = yield* validateReportPath(args[1])
  const { snapshot, inventory } = yield* io("inspect installed lstack source", () => inspectSource(sourceArgument))
  const root = yield* Effect.acquireRelease(io("create isolated pilot root", () => mkdtemp(join("/tmp", "pluginsdk-lstack-pilot-"))), (path) => Effect.promise(() => rm(path, { recursive: true, force: true })))
  const results: ScenarioReport[] = []
  for (const scenario of scenarios) results.push(yield* runScenario(scenario, root, snapshot, inventory))
  const sourceAfter = yield* io("inventory installed source after pilot", () => inventorySource(snapshot.root))
  assert.equal(inventoryDigest(sourceAfter), snapshot.digest, "Installed lstack source changed during pilot")
  const report = {
    source: { id: snapshot.id, authoredVersion: snapshot.version, description: snapshot.description, digestBefore: snapshot.digest, digestAfter: inventoryDigest(sourceAfter), filesBefore: inventory.files.length, filesAfter: sourceAfter.files.length, skillFiles: snapshot.files.filter((file) => file.path.startsWith("skills/")).length, executables: snapshot.files.filter((file) => file.executable).length, assets: snapshot.assets, retainedReceiptFields: snapshot.receiptFields, sourceManifestFields: snapshot.manifestFields, baselineMissingNoticeLinks: snapshot.brokenNoticeRefs },
    scenarios: results
  }
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (reportPath === undefined) process.stdout.write(text)
  else yield* io("write pilot report", () => writeFile(reportPath, text, "utf8"))
  return report
}).pipe(Effect.provide(PluginSdkLive)))

Effect.runPromise(program).catch((cause) => {
  process.stderr.write(`${inspect(cause, { depth: 6, maxArrayLength: 20 })}\n`)
  process.exitCode = 1
})
