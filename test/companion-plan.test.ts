import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { delimiter, dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { NodeServices } from "@effect/platform-node"
import { Array as EffectArray, Effect, Layer, Match, Schema } from "effect"
import { expect, it } from "vitest"
import { Bundle as BundleSchema, BundleBody, BuildRequest, Compiler, type Bundle, type PackageFile } from "../contracts/Compiler.ts"
import { RoleName } from "../contracts/Agents.ts"
import type { CompanionCapture, RoleFile } from "../contracts/Companions.ts"
import {
  Fingerprint,
  InstallationKey,
  PlanBody,
  ReadyPlan,
  StateUnavailable,
  Target,
  type Observation,
  type Identity,
  type PlanChange,
  type ReadyPlan as ReadyPlanValue,
  type Receipt,
  type Snapshot,
  type Target as TargetValue
} from "../contracts/Installer.ts"
import { AgentDefinition, Directory, PluginId } from "../contracts/Plugin.ts"
import { bundleDigest, fileDigest, planId } from "../src/internal/identity.ts"
import { parseJson } from "../src/internal/json.ts"
import { begin, settle } from "../src/installer/lifecycle/model.ts"
import { bundleRoles, captureCompanions, inspectCompanions } from "../src/installer/companions/capture.ts"
import { loadState, savePlan, saveState, snapshotPlan } from "../src/installer/lifecycle/plans.ts"
import { Installed } from "../src/installer/lifecycle/records.ts"
import { roleFilePath } from "../src/installer/companions/files.ts"
import { durableWrite } from "../src/installer/storage.ts"
import { targetPaths } from "../src/installer/target/resolve.ts"
import { CompilerLive } from "../src/compiler/index.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

type Fixture = {
  readonly root: string
  readonly source: string
  readonly home: string
  readonly target: TargetValue
  readonly oldBundle: Bundle
  readonly newBundle: Bundle
}

type AgentInput = Readonly<Record<string, typeof AgentDefinition.Encoded>>

const buildRequest = (root: string, agents: AgentInput) => Schema.decodeSync(BuildRequest)({
  root,
  format: "codex_plugin_v2",
  plugin: {
    id: "companion-kit",
    version: "1.0.0",
    description: "Companion lifecycle fixture",
    skills: [],
    mcp: {},
    agents
  }
})

const buildBundle = (root: string, agents: AgentInput) =>
  Compiler.use((compiler) => compiler.build(buildRequest(root, agents))).pipe(Effect.provide(CompilerTest))

const withFixture = async <A>(run: (fixture: Fixture) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-companion-plan-"))
  try {
    const source = join(root, "source")
    const home = join(root, "codex-home")
    await mkdir(source)
    await mkdir(home)
    await mkdir(join(source, "prompts"))
    await writeFile(join(source, "prompts", "review.md"), "Review the supplied changes carefully.\n")
    const oldBundle = await Effect.runPromise(buildBundle(source, {
      auditor: { description: "Original review helper", prompt: "prompts/review.md" },
      retiring: { description: "Role pending removal", prompt: "prompts/review.md" }
    }))
    const newBundle = await Effect.runPromise(buildBundle(source, {
      auditor: { description: "Updated review helper", prompt: "prompts/review.md" },
      added: { description: "New review helper", prompt: "prompts/review.md" }
    }))
    const target: TargetValue = Schema.decodeSync(Target)({
      key: InstallationKey.make("companion-plan-target"),
      destination: { type: "user", host: "codex", home: Directory.make(home) },
      plugin: PluginId.make("companion-kit"),
      profile: "codex-local-marketplace:1",
      version: "0.163.0"
    })
    return await run({ root, source, home, target, oldBundle, newBundle })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const emptySnapshot: Snapshot = { revision: null, receipt: null, observed: { type: "absent" } }

const readyPlan = (
  target: TargetValue,
  before: Snapshot,
  change: PlanChange,
  companions?: CompanionCapture
): ReadyPlanValue => {
  const body = Schema.decodeSync(Schema.toType(PlanBody))({
    type: "ready",
    schema: 1,
    target,
    before,
    change,
    ...(companions === undefined ? {} : { companions })
  })
  return Schema.decodeSync(Schema.toType(ReadyPlan))({ ...body, id: planId(body) })
}

const withCapture = (plan: ReadyPlanValue, companions?: CompanionCapture): ReadyPlanValue =>
  readyPlan(plan.target, plan.before, plan.change, companions)

const capture = (previous: ReadonlyArray<RoleFile>, desired: ReadonlyArray<RoleFile>): CompanionCapture => ({
  previous: [...previous],
  desired: [...desired]
})

const role = (files: ReadonlyArray<RoleFile>, name: string): RoleFile => {
  const found = files.find((file) => file.name === name)
  if (found === undefined) throw new Error(`Missing role ${name}`)
  return found
}

const changeRoleBytes = (file: RoleFile): RoleFile => {
  const content = new Uint8Array(file.content)
  content.fill(0)
  return { ...file, content }
}

const priorInstall = (fixture: Fixture) => {
  const previousRoles = bundleRoles(fixture.oldBundle)
  const plan = readyPlan(fixture.target, emptySnapshot, { type: "install", bundle: fixture.oldBundle }, capture([], previousRoles))
  const receipt: Receipt = {
    identity: { plan: plan.id, bundle: fixture.oldBundle.digest },
    fingerprint: Fingerprint.make("a".repeat(64))
  }
  const observed: Observation = { type: "present", identity: receipt.identity, fingerprint: receipt.fingerprint }
  const before: Snapshot = { revision: plan.id, receipt, observed }
  return { plan, receipt, before }
}

const markerPath = (target: TargetValue, plan: ReadyPlanValue): string =>
  join(targetPaths(target).markers, `${plan.id}.json`)

const writeMarker = (target: TargetValue, plan: ReadyPlanValue, bundle: Bundle, identity?: Identity) => {
  const marker = Schema.encodeSync(Installed)({
    schema: 1,
    target,
    identity: identity ?? { plan: plan.id, bundle: bundle.digest },
    bundle
  })
  return durableWrite(target.key, markerPath(target, plan), marker)
}

const writeRole = async (target: TargetValue, file: RoleFile): Promise<void> => {
  const path = roleFilePath(target, file.name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, file.content, { mode: 0o600 })
  await chmod(path, 0o600)
}

const withFakeCodex = async <A>(fixture: Fixture, run: (requestsPath: string) => Promise<A>): Promise<A> => {
  const bin = join(fixture.root, "fake-bin")
  const requestsPath = join(fixture.root, "app-server-requests.jsonl")
  await mkdir(bin)
  const config = {
    config: {},
    origins: {},
    layers: [{
      name: { type: "user", file: join(fixture.home, "config.toml"), profile: null },
      config: {}
    }]
  }
  const source = `#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { createInterface } from "node:readline"

const requestsPath = ${JSON.stringify(requestsPath)}
const config = ${JSON.stringify(config)}
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n")

process.on("SIGTERM", () => process.exit(0))
input.on("line", (line) => {
  appendFileSync(requestsPath, line + "\\n")
  const request = JSON.parse(line)
  if (request.id === 1) send({ id: 1, result: { serverInfo: { name: "fixture" }, capabilities: {} } })
  if (request.id === 2) send({ id: 2, result: config })
})
`
  const executable = join(bin, "codex")
  await writeFile(executable, source, { mode: 0o700 })
  await chmod(executable, 0o700)
  const previousPath = process.env.PATH
  process.env.PATH = previousPath === undefined ? bin : `${bin}${delimiter}${previousPath}`
  try {
    return await run(requestsPath)
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
  }
}

const requestMessages = async (path: string): Promise<ReadonlyArray<Schema.JsonObject>> =>
  (await readFile(path, "utf8")).trim().split("\n").map((line) =>
    Schema.decodeUnknownSync(Schema.JsonObject)(parseJson(line))
  )

const roleFileInBundle = (bundle: Bundle, path: string): PackageFile => {
  const found = bundle.files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`Missing bundle file ${path}`)
  return found
}

const sharedBundleFile = (bundle: Bundle, path: string) => {
  const original = roleFileInBundle(bundle, path)
  const backing = new SharedArrayBuffer(original.content.byteLength)
  const content = new Uint8Array(backing)
  content.set(original.content)
  const files = EffectArray.map(bundle.files, (file) => file.path === path ? { ...file, content } : file)
  const body = Schema.decodeSync(Schema.toType(BundleBody))({
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files
  })
  const shared = Schema.decodeSync(Schema.toType(BundleSchema))({ ...body, digest: bundleDigest(body) })
  return { bundle: shared, content }
}

const bundleFromPlan = (plan: ReadyPlanValue): Bundle => Match.value(plan.change).pipe(
  Match.discriminatorsExhaustive("type")({
    install: (change) => change.bundle,
    replace: (change) => change.bundle,
    remove: () => { throw new Error("Expected a bundle change") }
  })
)

it("requires an exact complete capture for a canonical fresh Codex role plan", async () => {
  await withFixture(async (fixture) => {
    const desired = bundleRoles(fixture.newBundle)
    const plan = readyPlan(fixture.target, emptySnapshot, { type: "install", bundle: fixture.newBundle }, capture([], desired))
    expect(snapshotPlan(plan).id).toBe(plan.id)

    const added = role(desired, "companion-kit:added")
    const auditor = role(desired, "companion-kit:auditor")
    const wrongNamespace = capture([], [{ ...added, name: RoleName.make("other-plugin:added") }, auditor])
    const duplicated = capture([], [added, added])
    const outOfOrder = capture([], [auditor, added])
    const mismatchedBytes = capture([], desired.map((file) => file.name === added.name ? changeRoleBytes(file) : file))
    const invalidPlans = [
      withCapture(plan),
      withCapture(plan, wrongNamespace),
      withCapture(plan, duplicated),
      withCapture(plan, outOfOrder),
      withCapture(plan, mismatchedBytes)
    ]
    for (const invalid of invalidPlans) {
      expect(invalid.id).toBe(planId(invalid))
      expect(() => snapshotPlan(invalid)).toThrow()
    }
  })
})

it("commits prior and desired role bytes and snapshots SharedArrayBuffer-backed bytes", async () => {
  await withFixture(async (fixture) => {
    const prior = priorInstall(fixture)
    const previous = bundleRoles(fixture.oldBundle)
    const desired = bundleRoles(fixture.newBundle)
    const baselineCapture = capture(previous, desired)
    const baseline = readyPlan(fixture.target, prior.before, { type: "replace", bundle: fixture.newBundle }, baselineCapture)
    const changedPrevious = readyPlan(
      fixture.target,
      prior.before,
      { type: "replace", bundle: fixture.newBundle },
      capture(previous.map((file) => file.name === "companion-kit:auditor" ? changeRoleBytes(file) : file), desired)
    )
    const changedDesired = readyPlan(
      fixture.target,
      prior.before,
      { type: "replace", bundle: fixture.newBundle },
      capture(previous, desired.map((file) => file.name === "companion-kit:added" ? changeRoleBytes(file) : file))
    )
    expect(changedPrevious.id).not.toBe(baseline.id)
    expect(changedDesired.id).not.toBe(baseline.id)

    const sharedBundle = sharedBundleFile(fixture.newBundle, "agents/added.toml")
    const previousAuditor = role(previous, "companion-kit:auditor")
    const previousBacking = new SharedArrayBuffer(previousAuditor.content.byteLength)
    const previousContent = new Uint8Array(previousBacking)
    previousContent.set(previousAuditor.content)
    const sharedPrevious = previous.map((file) => file.name === previousAuditor.name
      ? { ...file, content: previousContent }
      : file)
    const sharedDesired = bundleRoles(sharedBundle.bundle)
    const sourcePlan = readyPlan(
      fixture.target,
      prior.before,
      { type: "replace", bundle: sharedBundle.bundle },
      capture(sharedPrevious, sharedDesired)
    )
    const snapshot = snapshotPlan(sourcePlan)
    const expectedBundleBytes = new Uint8Array(sharedBundle.content)
    const expectedPreviousBytes = new Uint8Array(previousContent)
    const bundleBytes = roleFileInBundle(bundleFromPlan(snapshot), "agents/added.toml").content
    const snapshotAdded = role(snapshot.companions?.desired ?? [], "companion-kit:added").content
    const snapshotPrevious = role(snapshot.companions?.previous ?? [], previousAuditor.name).content

    sharedBundle.content.fill(0)
    previousContent.fill(0)

    expect(bundleBytes).toEqual(expectedBundleBytes)
    expect(snapshotAdded).toEqual(expectedBundleBytes)
    expect(snapshotPrevious).toEqual(expectedPreviousBytes)
    expect(snapshot.id).toBe(sourcePlan.id)
    expect(planId(snapshot)).toBe(sourcePlan.id)
    expect(bundleDigest(bundleFromPlan(snapshot))).toBe(bundleFromPlan(snapshot).digest)
  })
})

it("captures prior roles only from a retained plan and matching Installed marker", async () => {
  await withFixture(async (fixture) => {
    const prior = priorInstall(fixture)
    await Effect.runPromise(savePlan(prior.plan))
    await Effect.runPromise(writeMarker(fixture.target, prior.plan, fixture.oldBundle))

    const captured = await Effect.runPromise(captureCompanions(
      fixture.target,
      prior.before,
      { type: "replace", bundle: fixture.newBundle }
    ))
    if (captured === undefined) throw new Error("Expected Codex role capture")
    expect(captured).toEqual(capture(bundleRoles(fixture.oldBundle), bundleRoles(fixture.newBundle)))

    const mismatchedIdentity: Identity = { plan: prior.plan.id, bundle: fixture.newBundle.digest }
    await Effect.runPromise(writeMarker(fixture.target, prior.plan, fixture.oldBundle, mismatchedIdentity))
    await expect(Effect.runPromise(captureCompanions(
      fixture.target,
      prior.before,
      { type: "replace", bundle: fixture.newBundle }
    ))).rejects.toBeInstanceOf(StateUnavailable)

    await writeFile(markerPath(fixture.target, prior.plan), "{")
    await expect(Effect.runPromise(captureCompanions(
      fixture.target,
      prior.before,
      { type: "replace", bundle: fixture.newBundle }
    ))).rejects.toBeInstanceOf(StateUnavailable)
  })
})

it("observes pending replacement bytes without treating stale or absent roles as completion", async () => {
  await withFixture(async (fixture) => {
    const prior = priorInstall(fixture)
    const previousRoles = bundleRoles(fixture.oldBundle)
    const desiredRoles = bundleRoles(fixture.newBundle)
    const replacement = readyPlan(
      fixture.target,
      prior.before,
      { type: "replace", bundle: fixture.newBundle },
      capture(previousRoles, desiredRoles)
    )
    const authorization = begin({
      journal: { type: "installed", receipt: prior.receipt },
      observed: prior.before.observed,
      plan: replacement.id,
      before: prior.before,
      change: { type: "replace", bundle: fixture.newBundle.digest }
    })
    const pending = Match.value(authorization).pipe(Match.discriminatorsExhaustive("type")({
      start: ({ journal }) => journal,
      resume: () => { throw new Error("A new replacement should start") },
      completed: () => { throw new Error("A new replacement cannot already be complete") },
      rejected: () => { throw new Error("The model rejected the reviewed replacement") }
    }))

    await Effect.runPromise(savePlan(prior.plan))
    await Effect.runPromise(savePlan(replacement))
    await Effect.runPromise(writeMarker(fixture.target, prior.plan, fixture.oldBundle))
    await Effect.runPromise(saveState(fixture.target, {
      schema: 1,
      type: "pending",
      journal: pending,
      plan: replacement,
      execution: { type: "prepared" }
    }))
    expect((await Effect.runPromise(loadState(fixture.target))).type).toBe("pending")

    await withFakeCodex(fixture, async (requestsPath) => {
      const inspect = (bundle: Bundle | null) =>
        Effect.runPromise(inspectCompanions(fixture.target, bundle).pipe(Effect.provide(NodeServices.layer)))
      const oldAuditor = role(previousRoles, "companion-kit:auditor")
      const oldRetiring = role(previousRoles, "companion-kit:retiring")
      const newAuditor = role(desiredRoles, "companion-kit:auditor")
      const newAdded = role(desiredRoles, "companion-kit:added")

      await writeRole(fixture.target, oldAuditor)
      await writeRole(fixture.target, oldRetiring)
      const beforeReplacement = await inspect(fixture.oldBundle)
      expect(beforeReplacement.matches).toBe(true)
      expect(beforeReplacement.facts?.["companion-kit:added"]).toBeUndefined()
      expect(Object.keys(beforeReplacement.facts ?? {}).toSorted()).toEqual([
        "companion-kit:auditor", "companion-kit:retiring"
      ])

      const staleReplacement = await inspect(fixture.newBundle)
      expect(staleReplacement.matches).toBe(false)
      expect(staleReplacement.facts?.["companion-kit:added"]).toBeUndefined()

      await rm(roleFilePath(fixture.target, oldRetiring.name))
      await writeRole(fixture.target, newAuditor)
      await writeRole(fixture.target, newAdded)
      const pendingInstalled = await inspect(fixture.newBundle)
      expect(pendingInstalled.matches).toBe(true)
      expect(pendingInstalled.unknown).toBe(false)
      expect(Object.keys(pendingInstalled.facts ?? {}).toSorted()).toEqual([
        "companion-kit:added", "companion-kit:auditor"
      ])
      expect(pendingInstalled.facts?.["companion-kit:auditor"]).toMatchObject({
        digest: fileDigest(newAuditor.content), mode: 0o600
      })

      const installedReceipt: Receipt = {
        identity: { plan: replacement.id, bundle: fixture.newBundle.digest },
        fingerprint: Fingerprint.make("b".repeat(64))
      }
      const afterObservation: Observation = {
        type: "present",
        identity: installedReceipt.identity,
        fingerprint: installedReceipt.fingerprint
      }
      const settlement = settle({ journal: pending, observed: afterObservation })
      const installedJournal = Match.value(settlement).pipe(Match.discriminatorsExhaustive("type")({
        completed: ({ journal, result }) => {
          expect(result.type).toBe("installed")
          return journal
        },
        uncertain: () => { throw new Error("The desired installed observation should settle") }
      }))
      expect(installedJournal.type).toBe("installed")
      await Effect.runPromise(writeMarker(fixture.target, replacement, fixture.newBundle, installedReceipt.identity))
      await Effect.runPromise(saveState(fixture.target, { schema: 1, type: "idle", journal: installedJournal }))
      expect((await Effect.runPromise(loadState(fixture.target))).type).toBe("idle")

      const idleInstalled = await inspect(fixture.newBundle)
      expect(idleInstalled.matches).toBe(true)
      expect(idleInstalled.facts).toEqual(pendingInstalled.facts)

      const unrelated = join(fixture.home, "agents", "nested", "unrelated.toml")
      await mkdir(dirname(unrelated), { recursive: true })
      await writeFile(unrelated, 'name = "different-plugin:helper"\ndescription = "Unrelated"\ndeveloper_instructions = "Unrelated content."\n', { mode: 0o600 })
      const afterUnrelatedChange = await inspect(fixture.newBundle)
      expect(afterUnrelatedChange.facts).toEqual(idleInstalled.facts)

      await chmod(roleFilePath(fixture.target, newAuditor.name), 0o644)
      const unsafeMode = await inspect(fixture.newBundle)
      expect(unsafeMode.unknown).toBe(true)
      expect(unsafeMode.matches).toBe(false)

      const messages = await requestMessages(requestsPath)
      expect(messages.length).toBeGreaterThan(0)
      expect(messages.length % 3).toBe(0)
      expect(messages.every((message) => !Object.hasOwn(message, "jsonrpc"))).toBe(true)
      expect(messages.map((message) => message.method)).toEqual(
        Array.from({ length: messages.length / 3 }, () => ["initialize", "initialized", "config/read"]).flat()
      )
    })
  })
})
