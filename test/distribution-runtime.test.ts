import { readFileSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { afterAll, beforeAll } from "vitest"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Match, Schema } from "effect"
import {
  BundleDigest,
  BuildRequest,
  Compiler,
  type Bundle,
  type Format as PackageFormat
} from "../contracts/Compiler.ts"
import {
  Distribution,
  DistributionRejected,
  DistributionUnavailable,
  DistributionTarget,
  PlanRequest as DistributionPlanRequest,
  type ExecutionRecord as DistributionExecutionRecord,
  type Outcome as DistributionOutcome,
  type Planning as DistributionPlanning,
  type PlanningIssue as DistributionPlanningIssue,
  type ReadyPlan as DistributionReadyPlan,
  type DistributionTarget as DistributionTargetType,
  type Step as DistributionStep
} from "../contracts/Distribution.ts"
import { DistributionPlanId, StepDigest, TargetId } from "../contracts/DistributionModel.ts"
import {
  Fingerprint,
  HostUnavailable,
  InstallationKey,
  PlanId,
  PlanRejected,
  StateUnavailable,
  Installer,
  type ApplyOutcome as InstallationApplyOutcome,
  type Completion as InstallationCompletion,
  type PlanBody as InstallationPlanBodyType,
  type PlanChange,
  type InstallationKey as InstallationKeyType,
  type PlanRequest as InstallationPlanRequest,
  type Planning as InstallationPlanning,
  type ReadyPlan as InstallationReadyPlan,
  type ReviewedPlan as InstallationReviewedPlan,
  type Snapshot as InstallationSnapshot,
  type Receipt as InstallationReceipt,
  type Target as InstallationTarget
} from "../contracts/Installer.ts"
import { Directory, type PluginId } from "../contracts/Plugin.ts"
import {
  FormatDigests,
  McpRelease,
  PluginRelease,
  ReleaseKey,
  type McpRelease as McpReleaseType,
  type PluginRelease as PluginReleaseType,
  type ReleaseKey as ReleaseKeyType,
  type Release
} from "../contracts/Catalog.ts"
import { ReleaseCatalog } from "../contracts/Registry.ts"
import { McpContract } from "../contracts/ToolContract.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { ReleaseCatalogLive } from "../src/catalog/index.ts"
import { captureContract } from "../src/catalog/tools/contracts.ts"
import { planId } from "../src/internal/identity.ts"
import { DistributionLive } from "../src/distribution/index.ts"
import { StoredDistribution, type StoredDistribution as StoredDistributionType, type StoredJob } from "../src/distribution/storage.ts"

const compilerLayer = Layer.provideMerge(CompilerLive, NodeServices.layer)
const formats: ReadonlyArray<PackageFormat> = ["claude_code", "codex"]

type Fixture = {
  readonly root: string
  readonly catalogDirectory: string
  readonly bundles: ReadonlyArray<Bundle>
  readonly mainRelease: PluginReleaseType
  readonly claudeOnlyRelease: PluginReleaseType
  readonly codexOnlyRelease: PluginReleaseType
  readonly mcpRelease: McpReleaseType
}

let sharedFixture: Fixture | undefined

const currentFixture = (): Fixture => {
  if (sharedFixture === undefined) throw new Error("Distribution runtime fixture was not initialized")
  return sharedFixture
}

const catalogLayer = (directory: string) => Layer.provideMerge(
  ReleaseCatalogLive(Directory.make(directory)),
  NodeServices.layer
)

const makeKey = (integration: string, release: string) => Schema.decodeSync(ReleaseKey)({
  organization: "acme",
  integration,
  release
})

const bundleAt = (bundles: ReadonlyArray<Bundle>, format: PackageFormat): Bundle => {
  const found = bundles.find((bundle) => bundle.format === format)
  if (found === undefined) throw new Error(`Missing compiler package ${format}`)
  return found
}

const bundlesFor = (bundles: ReadonlyArray<Bundle>, selected: ReadonlyArray<PackageFormat>): ReadonlyArray<Bundle> =>
  selected.map((format) => bundleAt(bundles, format))

const digestsFor = (bundles: ReadonlyArray<Bundle>) => Schema.decodeSync(FormatDigests)(Object.fromEntries(
  bundles.map(({ format, digest }) => [format, digest])
))

const makePluginRelease = (
  key: ReleaseKeyType,
  bundles: ReadonlyArray<Bundle>
) => Schema.decodeSync(PluginRelease)({
  key,
  version: "1.0.0",
  origin: {
    type: "repository",
    repository: "https://example.test/acme/plugins",
    commit: "a".repeat(40),
    path: "."
  },
  contents: { type: "plugin", plugin: "distribution-helper", packages: digestsFor(bundles) }
})

const makeFixture = async (): Promise<Fixture> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-distribution-runtime-"))
  try {
    const source = join(root, "plugin-source")
    const skill = join(source, "skills", "overview")
    await mkdir(skill, { recursive: true })
    await writeFile(join(skill, "SKILL.md"), [
      "---", "name: overview", "description: Distribution runtime fixture.", "---",
      "# Distribution fixture", "A compiler-produced package for distribution acceptance.", ""
    ].join("\n"))
    const payload = join(source, "third_party", "tools", "payload.bin")
    await mkdir(join(source, "third_party", "tools"), { recursive: true })
    await writeFile(payload, new Uint8Array([0, 255, 128, 1, 42]))
    await chmod(payload, 0o755)

    const bundles = await Effect.runPromise(Effect.gen(function*() {
      const compiler = yield* Compiler
      const built: Array<Bundle> = []
      for (const format of formats) {
        const request = yield* Schema.decodeEffect(BuildRequest)({
          root: source,
          format,
          plugin: {
            id: "distribution-helper",
            version: "1.0.0",
            description: "Distribution runtime fixture.",
            skills: ["skills/overview"],
            assets: ["third_party"],
            mcp: {}
          }
        })
        built.push(yield* compiler.build(request))
      }
      return built
    }).pipe(Effect.provide(compilerLayer)))

    const mainBundles = bundlesFor(bundles, ["claude_code", "codex"])
    const claudeBundles = bundlesFor(bundles, ["claude_code"])
    const codexBundles = bundlesFor(bundles, ["codex"])
    const mainRelease = makePluginRelease(makeKey("distribution", "release-main"), mainBundles)
    const claudeOnlyRelease = makePluginRelease(makeKey("distribution", "release-claude-only"), claudeBundles)
    const codexOnlyRelease = makePluginRelease(makeKey("distribution", "release-codex-only"), codexBundles)
    const contract = Schema.decodeSync(McpContract)({
      schema: 1,
      organization: "acme",
      service: "distribution-service",
      protocol: "2026-07-28",
      tools: []
    })
    const captured = captureContract(contract)
    const mcpRelease = Schema.decodeSync(McpRelease)({
      key: makeKey("distribution", "release-mcp"),
      version: "1.0.0",
      origin: {
        type: "repository",
        repository: "https://example.test/acme/plugins",
        commit: "b".repeat(40),
        path: "."
      },
      contents: { type: "mcp", service: "distribution-service", contract: captured.digest }
    })

    const catalogDirectory = join(root, "catalog")
    await Effect.runPromise(Effect.gen(function*() {
      const catalog = yield* ReleaseCatalog
      yield* catalog.initialize
      expect(yield* catalog.admit({ type: "plugin", release: mainRelease, bundles: mainBundles })).toEqual({ type: "admitted" })
      expect(yield* catalog.admit({ type: "plugin", release: claudeOnlyRelease, bundles: claudeBundles })).toEqual({ type: "admitted" })
      expect(yield* catalog.admit({ type: "plugin", release: codexOnlyRelease, bundles: codexBundles })).toEqual({ type: "admitted" })
      expect(yield* catalog.admit({ type: "mcp", release: mcpRelease, contract: captured.contract })).toEqual({ type: "admitted" })
    }).pipe(Effect.provide(catalogLayer(catalogDirectory))))

    return { root, catalogDirectory, bundles, mainRelease, claudeOnlyRelease, codexOnlyRelease, mcpRelease }
  } catch (cause) {
    await rm(root, { recursive: true, force: true })
    throw cause
  }
}

beforeAll(async () => {
  sharedFixture = await makeFixture()
}, 30_000)

afterAll(async () => {
  if (sharedFixture !== undefined) await rm(sharedFixture.root, { recursive: true, force: true })
}, 30_000)

type InstallerSurface = typeof Installer.Service
type InstallerMock = Pick<InstallerSurface, "plan" | "apply">
type InstallerOverrides = {
  readonly keyFor?: (request: InstallationPlanRequest) => InstallationKeyType
  readonly plan?: InstallerSurface["plan"]
  readonly apply?: InstallerSurface["apply"]
}

const absentSnapshot = (): InstallationSnapshot => ({ revision: null, receipt: null, observed: { type: "absent" } })

const ownedSnapshot = (bundle: Bundle, fingerprintCharacter: string): InstallationSnapshot => {
  const nativePlan = PlanId.make("e".repeat(64))
  const fingerprint = Fingerprint.make(fingerprintCharacter.repeat(64))
  const identity = { plan: nativePlan, bundle: bundle.digest }
  const receipt = { identity, fingerprint }
  return { revision: nativePlan, receipt, observed: { type: "present", fingerprint, identity } }
}

const priorSnapshot = (): InstallationSnapshot => {
  const nativePlan = PlanId.make("c".repeat(64))
  const fingerprint = Fingerprint.make("d".repeat(64))
  const identity = { plan: nativePlan, bundle: BundleDigest.make("b".repeat(64)) }
  const receipt = { identity, fingerprint }
  return { revision: nativePlan, receipt, observed: { type: "present", fingerprint, identity } }
}

const nativePlanFor = (
  request: InstallationPlanRequest,
  key: InstallationKeyType
): InstallationReadyPlan => {
  const selected: {
    readonly plugin: PluginId
    readonly version: string
    readonly before: InstallationSnapshot
    readonly change: PlanChange
  } = Match.value(request.intent).pipe(Match.discriminatorsExhaustive("type")({
    absent: ({ plugin }) => {
      const change: PlanChange = { type: "remove" }
      return { plugin, version: "1.0.0", before: priorSnapshot(), change }
    },
    present: ({ bundle }) => {
      const change: PlanChange = { type: "install", bundle }
      return { plugin: bundle.plugin, version: "1.0.0", before: absentSnapshot(), change }
    },
    repair: () => { throw new Error("Distribution must not ask Installer to plan a repair") }
  }))
  const target: InstallationTarget = {
    key,
    destination: request.destination,
    plugin: selected.plugin,
    profile: "distribution-runtime-test",
    version: selected.version
  }
  const body: InstallationPlanBodyType = {
    type: "ready",
    schema: 1,
    target,
    before: selected.before,
    change: selected.change
  }
  return { ...body, id: planId(body) }
}

const readyPlanning = (request: InstallationPlanRequest, key: InstallationKeyType): InstallationPlanning =>
  nativePlanFor(request, key)

const asNativeReady = (plan: InstallationReviewedPlan): InstallationReadyPlan => Match.value(plan).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (ready) => ready,
    repair_ready: () => { throw new Error("Distribution must not return an Installer repair plan") }
  })
)

const completedApply = (reviewed: InstallationReviewedPlan): InstallationApplyOutcome => {
  const plan = asNativeReady(reviewed)
  const result: InstallationCompletion = Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
    install: ({ bundle }): Extract<InstallationCompletion, { readonly type: "installed" }> => ({
      type: "installed",
      receipt: {
        identity: { plan: plan.id, bundle: bundle.digest },
        fingerprint: Fingerprint.make("f".repeat(64))
      }
    }),
    replace: ({ bundle }): Extract<InstallationCompletion, { readonly type: "installed" }> => ({
      type: "installed",
      receipt: {
        identity: { plan: plan.id, bundle: bundle.digest },
        fingerprint: Fingerprint.make("f".repeat(64))
      }
    }),
    remove: (): Extract<InstallationCompletion, { readonly type: "removed" }> => ({ type: "removed" })
  }))
  return { type: "completed", result }
}

const makeInstaller = (overrides: InstallerOverrides = {}): InstallerMock => ({
  plan: overrides.plan ?? ((request) => Effect.succeed(readyPlanning(
    request,
    overrides.keyFor?.(request) ?? InstallationKey.make(`${request.destination.host}:${request.destination.home}`)
  ))),
  apply: overrides.apply ?? ((plan) => Effect.succeed(completedApply(plan)))
})

const distributionLayer = (catalogDirectory: string, installer: InstallerMock) => Layer.provideMerge(
  DistributionLive,
  Layer.merge(
    catalogLayer(catalogDirectory),
    Layer.succeed(Installer, Installer.of(installer))
  )
)

const runRuntime = <A, E>(
  installer: InstallerMock,
  action: (
    distribution: typeof Distribution.Service,
    catalog: typeof ReleaseCatalog.Service
  ) => Effect.Effect<A, E, ReleaseCatalog>
): Promise<A> => {
  const { catalogDirectory } = currentFixture()
  return Effect.runPromise(Effect.gen(function*() {
    const catalog = yield* ReleaseCatalog
    yield* catalog.initialize
    const distribution = yield* Distribution
    return yield* action(distribution, catalog)
  }).pipe(Effect.provide(distributionLayer(catalogDirectory, installer))))
}

const localTarget = (
  root: string,
  id: string,
  host: "claude_code" | "codex",
  homeLabel: string
) => Schema.decodeSync(DistributionTarget)({
  type: "local",
  id: TargetId.make(id),
  destination: { type: "user", host, home: Directory.make(join(root, `home-${homeLabel}`)) }
})

const workspaceTarget = (id: string) => Schema.decodeSync(DistributionTarget)({
  type: "workspace",
  id: TargetId.make(id),
  organization: "acme",
  workspace: "north-region",
  surface: "claude_code"
})

const requestFor = (
  release: Release,
  desired: "present" | "absent",
  targets: readonly [DistributionTargetType, ...Array<DistributionTargetType>]
) =>
  Schema.decodeSync(DistributionPlanRequest)({ release, desired, targets })

const expectReady = (planning: DistributionPlanning): DistributionReadyPlan => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => plan,
    blocked: ({ issues }) => { throw new Error(`Expected a ready distribution plan, received ${JSON.stringify(issues)}`) }
  })
)

const expectBlocked = (planning: DistributionPlanning): ReadonlyArray<DistributionPlanningIssue> => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    blocked: ({ issues }) => issues,
    ready: () => { throw new Error("Expected whole-plan blocking, received an executable subset") }
  })
)

const readStoredDistribution = (path: string): Promise<StoredDistributionType> => readFile(path, "utf8").then((encoded) =>
  Schema.decodeUnknownSync(StoredDistribution, { onExcessProperty: "error" })(JSON.parse(encoded))
)

const stepAt = (plan: DistributionReadyPlan, target: string): DistributionStep => {
  const found = plan.steps.find((step) => step.target === target)
  if (found === undefined) throw new Error(`Missing distribution step ${target}`)
  return found
}

const bundleFromNativePlan = (plan: InstallationReadyPlan): Bundle => Match.value(plan.change).pipe(
  Match.discriminatorsExhaustive("type")({
    install: ({ bundle }) => bundle,
    replace: ({ bundle }) => bundle,
    remove: () => { throw new Error("Expected a package installation") }
  })
)

const bundleFromApplyStep = (step: DistributionStep): Bundle => {
  const native = Match.value(step.operation).pipe(Match.discriminatorsExhaustive("type")({
    apply: ({ plan }) => plan,
    verify: () => { throw new Error("Expected an apply operation") }
  }))
  return bundleFromNativePlan(native)
}

const outcomeLabel = (outcome: DistributionOutcome): string => Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
    pending: () => "pending",
    installed: () => "installed",
    removed: () => "removed",
    not_applied: () => "not_applied",
    unchanged: () => "unchanged",
    blocked: ({ reason }) => `blocked:${reason}`,
    uncertain: () => "uncertain",
    unavailable: ({ reason }) => `unavailable:${reason}`
  }))

it("plans both local hosts from retained compiler packages and snapshots caller data", async () => {
  const fixture = currentFixture()
  const sourceClaude = bundleAt(fixture.bundles, "claude_code")
  const expectedClaude = structuredClone(sourceClaude)
  const sourceFile = sourceClaude.files.find((file) => file.path === "skills/overview/SKILL.md")
  if (sourceFile === undefined) throw new Error("Compiler package is missing the fixture skill")
  const originalBytes = sourceFile.content.slice()
  const changedByte = originalBytes[0]
  if (changedByte === undefined) throw new Error("Fixture skill unexpectedly has no bytes")
  sourceFile.content[0] = changedByte === 0 ? 1 : 0

  const requestRelease = structuredClone(fixture.mainRelease)
  const codex = localTarget(fixture.root, "alpha-codex", "codex", "alpha-codex")
  const claude = localTarget(fixture.root, "β-claude", "claude_code", "beta-claude")
  const request = requestFor(requestRelease, "present", [claude, codex])
  let planning: DistributionPlanning
  try {
    planning = await runRuntime(makeInstaller(), (distribution, catalog) => Effect.gen(function*() {
      const acquired = yield* catalog.acquire({
        key: fixture.mainRelease.key,
        target: { type: "plugin", format: "claude_code" }
      })
      expect(acquired).toEqual({
        type: "plugin",
        release: fixture.mainRelease,
        bundle: expectedClaude
      })
      return yield* distribution.plan(request)
    }))
  } finally {
    sourceFile.content.set(originalBytes)
  }

  const plan = expectReady(planning)
  expect(plan.release).toEqual(fixture.mainRelease)
  expect(plan.steps.map((step) => step.target)).toEqual(["alpha-codex", "β-claude"])
  expect(bundleFromApplyStep(stepAt(plan, "alpha-codex"))).toEqual(bundleAt(fixture.bundles, "codex"))
  expect(bundleFromApplyStep(stepAt(plan, "β-claude"))).toEqual(expectedClaude)
  expect(bundleFromApplyStep(stepAt(plan, "β-claude")).files[0].content).not.toBe(sourceClaude.files[0].content)

  Object.assign(requestRelease, { version: "9.9.9" })
  const originalFirstTarget = request.targets[0]
  Object.assign(originalFirstTarget, { id: TargetId.make("caller-mutated") })
  expect(plan.release).toEqual(fixture.mainRelease)
  expect(plan.steps.map((step) => step.target)).toEqual(["alpha-codex", "β-claude"])

  const reverse = expectReady(await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [
      localTarget(fixture.root, "β-claude", "claude_code", "beta-claude"),
      localTarget(fixture.root, "alpha-codex", "codex", "alpha-codex")
    ]
  ))))
  expect(reverse.id).toBe(plan.id)
})

it("retains a private multi-step snapshot across shared-buffer mutation and returned progress edits", async () => {
  const fixture = currentFixture()
  const stateDirectory = join(fixture.root, "shared-buffer-state")
  const reviewed = expectReady(await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [
      localTarget(fixture.root, "alpha", "codex", "alpha"),
      localTarget(fixture.root, "bravo", "claude_code", "bravo")
    ]
  ))))
  const expectedPlan = structuredClone(reviewed)
  const callerPlan = structuredClone(reviewed)
  const callerBundle = bundleFromApplyStep(stepAt(callerPlan, "bravo"))
  const callerFile = callerBundle.files.find((file) => file.path === "skills/overview/SKILL.md")
  if (callerFile === undefined) throw new Error("Reviewed package is missing the fixture skill")
  const expectedBytes = callerFile.content.slice()
  const sharedBuffer = new SharedArrayBuffer(expectedBytes.byteLength)
  const sharedBytes = new Uint8Array(sharedBuffer)
  sharedBytes.set(expectedBytes)
  Object.assign(callerFile, { content: sharedBytes })
  expect(callerFile.content).toEqual(expectedBytes)

  const storePath = join(stateDirectory, "distribution.json")
  const calls: Array<string> = []
  const installer = makeInstaller({
    apply: (childPlan) => Effect.gen(function*() {
      const native = asNativeReady(childPlan)
      const label = basename(native.target.destination.home).replace(/^home-/, "")
      calls.push(label)
      if (label === "alpha") sharedBytes.fill(0xff)
      if (label === "bravo") {
        const payload = bundleFromNativePlan(native).files.find((file) => file.path === "skills/overview/SKILL.md")
        if (payload === undefined) throw new Error("Later child package is missing the fixture skill")
        expect(payload.content).toEqual(expectedBytes)
        expect(payload.content).not.toBe(sharedBytes)
      }

      const stored = yield* Effect.promise(() => readStoredDistribution(storePath))
      const job = stored.jobs.find(({ plan }) => plan.id === expectedPlan.id)
      if (job === undefined) throw new Error("Reviewed plan was not retained before the first child completed")
      expect(job.plan).toEqual(expectedPlan)
      const retainedPayload = bundleFromApplyStep(stepAt(job.plan, "bravo")).files.find(
        (file) => file.path === "skills/overview/SKILL.md"
      )
      if (retainedPayload === undefined) throw new Error("Retained package is missing the fixture skill")
      expect(retainedPayload.content).toEqual(expectedBytes)
      expect(retainedPayload.content).not.toBe(sharedBytes)
      return completedApply(childPlan)
    })
  })

  const results = await runRuntime(installer, (distribution) => Effect.gen(function*() {
    const applied = yield* distribution.apply(callerPlan, Directory.make(stateDirectory))
    expect(applied.type).toBe("complete")
    const retainedRecord = structuredClone(applied.record)
    Object.assign(applied.record.entries[0], { outcome: { type: "pending" } })
    const replay = yield* distribution.apply(expectedPlan, Directory.make(stateDirectory))
    return { applied, replay, retainedRecord }
  }))

  expect([...sharedBytes]).not.toEqual([...expectedBytes])
  expect(calls).toEqual(["alpha", "bravo"])
  expect(results.replay.type).toBe("complete")
  expect(results.replay.record).toEqual(results.retainedRecord)
  const finalStore = await readStoredDistribution(storePath)
  const finalJob = finalStore.jobs.find(({ plan }) => plan.id === expectedPlan.id)
  if (finalJob === undefined) throw new Error("Completed plan disappeared after replay")
  expect(finalJob.plan).toEqual(expectedPlan)
  expect(finalJob.record).toEqual(results.retainedRecord)
})

it("blocks whole plans when a current client package is unavailable, and for collisions or unqualified targets", async () => {
  const fixture = currentFixture()
  const missing = await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.codexOnlyRelease,
    "present",
    [
      localTarget(fixture.root, "missing-claude", "claude_code", "missing-claude"),
      localTarget(fixture.root, "available-codex", "codex", "available-codex")
    ]
  )))
  expect(expectBlocked(missing)).toEqual([
    { type: "blocked", target: "missing-claude", reason: "package_unavailable" }
  ])

  const missingCodex = await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.claudeOnlyRelease,
    "present",
    [
      localTarget(fixture.root, "available-claude", "claude_code", "available-claude"),
      localTarget(fixture.root, "missing-codex", "codex", "missing-codex")
    ]
  )))
  expect(expectBlocked(missingCodex)).toEqual([
    { type: "blocked", target: "missing-codex", reason: "package_unavailable" }
  ])

  const mismatchedRelease = Schema.decodeSync(PluginRelease)({
    ...fixture.mainRelease,
    origin: {
      type: "repository",
      repository: "https://example.test/changed-source",
      commit: "c".repeat(40),
      path: "."
    }
  })
  const mismatch = await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    mismatchedRelease,
    "present",
    [localTarget(fixture.root, "metadata", "codex", "metadata")]
  )))
  expect(expectBlocked(mismatch)).toEqual([
    { type: "blocked", target: "metadata", reason: "release_mismatch" }
  ])

  const duplicateLabels = await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [
      localTarget(fixture.root, "same-label", "claude_code", "label-one"),
      localTarget(fixture.root, "same-label", "codex", "label-two")
    ]
  )))
  expect(expectBlocked(duplicateLabels)).toEqual([{ type: "duplicate_target", target: "same-label" }])

  const aliased = await runRuntime(makeInstaller({
    keyFor: () => InstallationKey.make("physical-installation-shared")
  }), (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [
      localTarget(fixture.root, "first-label", "claude_code", "physical-one"),
      localTarget(fixture.root, "second-label", "codex", "physical-two")
    ]
  )))
  expect(expectBlocked(aliased)).toEqual([{
    type: "duplicate_installation",
    installation: "physical-installation-shared"
  }])

  const workspace = await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [workspaceTarget("workspace-client")]
  )))
  expect(expectBlocked(workspace)).toEqual([
    { type: "blocked", target: "workspace-client", reason: "workspace_unqualified" }
  ])

  const mcp = await runRuntime(makeInstaller(), (distribution) => distribution.plan(requestFor(
    fixture.mcpRelease,
    "present",
    [localTarget(fixture.root, "mcp-client", "claude_code", "mcp-client")]
  )))
  expect(expectBlocked(mcp)).toEqual([
    { type: "blocked", target: "mcp-client", reason: "mcp_registration_unqualified" }
  ])

  const pendingMock = makeInstaller({
    plan: (request) => Effect.succeed({
      type: "pending",
      plan: nativePlanFor(request, InstallationKey.make(`${request.destination.host}:${request.destination.home}`))
    })
  })
  const pending = await runRuntime(pendingMock, (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [localTarget(fixture.root, "pending-client", "codex", "pending-client")]
  )))
  expect(expectBlocked(pending)).toEqual([
    { type: "blocked", target: "pending-client", reason: "pending_operation" }
  ])
})

it("forwards Cursor package selection to Installer before reporting host unavailability", async () => {
  const fixture = currentFixture()
  const cursor = Schema.decodeSync(DistributionTarget.cases.local)({
    type: "local",
    id: TargetId.make("cursor-user"),
    destination: {
      type: "user",
      host: "cursor",
      home: Directory.make(join(fixture.root, "home-cursor"))
    }
  })
  const expectedClaude = bundleAt(fixture.bundles, "claude_code")
  let planCalls = 0
  let capturedRequest: InstallationPlanRequest | undefined
  const installer = makeInstaller({
    plan: (request) => {
      planCalls += 1
      capturedRequest = request
      return Effect.fail(new HostUnavailable({
        host: request.destination.host,
        cause: new Error("Cursor host unavailable")
      }))
    }
  })

  const planning = await runRuntime(installer, (distribution) => distribution.plan(requestFor(
    fixture.mainRelease,
    "present",
    [cursor]
  )))

  expect(planCalls).toBe(1)
  if (capturedRequest === undefined) throw new Error("Distribution did not call Installer.plan")
  expect(capturedRequest.destination).toEqual(cursor.destination)
  const capturedBundle = Match.value(capturedRequest.intent).pipe(Match.discriminatorsExhaustive("type")({
    present: ({ bundle }) => bundle,
    absent: () => { throw new Error("Cursor forwarding request unexpectedly removes a package") },
    repair: () => { throw new Error("Cursor forwarding request unexpectedly repairs a package") }
  }))
  expect(capturedBundle).toEqual(expectedClaude)
  expect(capturedBundle.digest).toBe(expectedClaude.digest)
  expect(expectBlocked(planning)).toEqual([
    { type: "blocked", target: "cursor-user", reason: "host_unavailable" }
  ])
})

it("persists pending work, maps typed native failures, retries only incomplete targets, and replays terminal plans", async () => {
  const fixture = currentFixture()
  const partialState = join(fixture.root, "partial-state")
  const completedState = join(fixture.root, "completed-state")
  const counts = new Map<string, number>()
  const pendingChecked = new Set<string>()
  let activeState = ""
  let activePlan: DistributionReadyPlan | undefined

  const installer = makeInstaller({
    apply: (reviewed) => {
      const native = asNativeReady(reviewed)
      const label = basename(native.target.destination.home).replace(/^home-/, "")
      const attempt = (counts.get(label) ?? 0) + 1
      counts.set(label, attempt)

      if (activePlan === undefined) throw new Error("No distribution plan is active for the child call")
      if (!pendingChecked.has(activePlan.id)) {
        const stored = Schema.decodeUnknownSync(StoredDistribution, { onExcessProperty: "error" })(
          JSON.parse(readFileSync(join(activeState, "distribution.json"), "utf8"))
        )
        const job = stored.jobs.find(({ plan }) => plan.id === activePlan?.id)
        if (job === undefined) throw new Error("Distribution did not persist the reviewed plan before applying")
        expect(job.plan).toEqual(activePlan)
        expect(job.record.entries.map(({ outcome }) => outcome.type)).toEqual(
          activePlan.steps.map(() => "pending")
        )
        pendingChecked.add(activePlan.id)
      }

      if (attempt === 1 && label === "bravo") {
        return Effect.fail(new HostUnavailable({ host: native.target.destination.host, cause: new Error("host offline") }))
      }
      if (attempt === 1 && label === "charlie") {
        return Effect.fail(new StateUnavailable({ key: native.target.key, cause: new Error("state unavailable") }))
      }
      if (attempt === 1 && label === "delta") return Effect.fail(new PlanRejected({ reason: "stale_plan" }))
      if (attempt === 1 && label === "echo") {
        return Effect.succeed<InstallationApplyOutcome>({ type: "uncertain", observed: { type: "unknown" } })
      }
      return Effect.succeed(completedApply(reviewed))
    }
  })

  const result = await runRuntime(installer, (distribution) => Effect.gen(function*() {
    const request = requestFor(fixture.mainRelease, "present", [
      localTarget(fixture.root, "alpha", "codex", "alpha"),
      localTarget(fixture.root, "bravo", "claude_code", "bravo"),
      localTarget(fixture.root, "charlie", "codex", "charlie"),
      localTarget(fixture.root, "delta", "claude_code", "delta"),
      localTarget(fixture.root, "echo", "codex", "echo")
    ])
    const plan = expectReady(yield* distribution.plan(request))
    activePlan = plan
    activeState = partialState
    const first = yield* distribution.apply(plan, Directory.make(partialState))
    expect(first.type).toBe("partial")
    expect(first.record.entries.map(({ outcome }) => outcomeLabel(outcome))).toEqual([
      "installed",
      "unavailable:host_unavailable",
      "unavailable:installation_unavailable",
      "blocked:stale_plan",
      "uncertain"
    ])
    expectReceiptsBound(plan, first.record)

    const second = yield* distribution.apply(plan, Directory.make(partialState))
    expect(second.type).toBe("partial")
    expect(second.record.entries.map(({ outcome }) => outcomeLabel(outcome))).toEqual([
      "installed", "installed", "installed", "blocked:stale_plan", "installed"
    ])
    expectReceiptsBound(plan, second.record)

    const callsBeforeReplay = [...counts.entries()]
    const replay = yield* distribution.apply(plan, Directory.make(partialState))
    expect(replay.type).toBe("partial")
    expect([...counts.entries()]).toEqual(callsBeforeReplay)

    const terminal = expectReady(yield* distribution.plan(requestFor(
      fixture.mainRelease,
      "present",
      [localTarget(fixture.root, "terminal", "codex", "terminal")]
    )))
    activePlan = terminal
    activeState = completedState
    const completed = yield* distribution.apply(terminal, Directory.make(completedState))
    expect(completed.type).toBe("complete")
    const beforeCompletedReplay = [...counts.entries()]
    const completedReplay = yield* distribution.apply(terminal, Directory.make(completedState))
    expect(completedReplay.type).toBe("complete")
    expect([...counts.entries()]).toEqual(beforeCompletedReplay)
    return { plan, first, second, replay, terminal, completed, completedReplay }
  }))

  expect([...counts.entries()]).toEqual([
    ["alpha", 1], ["bravo", 2], ["charlie", 2], ["delta", 1], ["echo", 2], ["terminal", 1]
  ])
  expect(pendingChecked.size).toBe(2)
  expect(result.first.record.id).toBe(result.plan.id)
  expect(result.completedReplay.record.id).toBe(result.terminal.id)
})

const expectReceiptsBound = (
  plan: DistributionReadyPlan,
  record: DistributionExecutionRecord
): void => {
  for (const entry of record.entries) {
    Match.value(entry.outcome).pipe(Match.discriminatorsExhaustive("type")({
      installed: ({ receipt }) => {
        const step = stepAt(plan, entry.step.target)
        const native = Match.value(step.operation).pipe(Match.discriminatorsExhaustive("type")({
          apply: ({ plan }) => plan,
          verify: () => { throw new Error("An unchanged step cannot produce an installed receipt") }
        }))
        const bundle = Match.value(native.change).pipe(Match.discriminatorsExhaustive("type")({
          install: ({ bundle }) => bundle,
          replace: ({ bundle }) => bundle,
          remove: () => { throw new Error("A remove step cannot produce an installed receipt") }
        }))
        expect(receipt.identity.plan).toBe(native.id)
        expect(receipt.identity.bundle).toBe(bundle.digest)
      },
      pending: () => undefined,
      removed: () => undefined,
      not_applied: () => undefined,
      unchanged: () => undefined,
      blocked: () => undefined,
      uncertain: () => undefined,
      unavailable: () => undefined
    }))
  }
}

it("keeps an unchanged installation review valid after the observed client version changes", async () => {
  const fixture = currentFixture()
  let planningCalls = 0
  let applyCalls = 0
  const installer = makeInstaller({
    plan: (request) => {
      planningCalls += 1
      const native = nativePlanFor(request, InstallationKey.make(`${request.destination.host}:${request.destination.home}`))
      const bundle = Match.value(request.intent).pipe(Match.discriminatorsExhaustive("type")({
        present: ({ bundle }) => bundle,
        absent: () => { throw new Error("Version observation fixture requires a present package") },
        repair: () => { throw new Error("Version observation fixture cannot repair") }
      }))
      return Effect.succeed({
        type: "unchanged",
        target: { ...native.target, version: planningCalls === 1 ? "1.0.0" : "99.0.0" },
        state: ownedSnapshot(bundle, "f")
      } satisfies InstallationPlanning)
    },
    apply: (plan) => {
      applyCalls += 1
      return Effect.succeed(completedApply(plan))
    }
  })
  const result = await runRuntime(installer, (distribution) => Effect.gen(function*() {
    const plan = expectReady(yield* distribution.plan(requestFor(fixture.mainRelease, "present", [
      localTarget(fixture.root, "version-observation", "codex", "version-observation")
    ])))
    expect(stepAt(plan, "version-observation").operation.type).toBe("verify")
    return yield* distribution.apply(plan, Directory.make(join(fixture.root, "version-observation-state")))
  }))
  expect(result.type).toBe("complete")
  expect(result.record.entries.map(({ outcome }) => outcomeLabel(outcome))).toEqual(["unchanged"])
  expect(planningCalls).toBe(2)
  expect(applyCalls).toBe(0)
})

it("rejects unchanged-basis drift and applies native removal", async () => {
  const fixture = currentFixture()
  let planningCalls = 0
  let nativeApplyCalls = 0
  const unchangedMock = makeInstaller({
    plan: (request) => {
      planningCalls += 1
      const key = InstallationKey.make(`${request.destination.host}:${request.destination.home}`)
      const native = nativePlanFor(request, key)
      const bundle = Match.value(request.intent).pipe(Match.discriminatorsExhaustive("type")({
        present: ({ bundle }) => bundle,
        absent: () => { throw new Error("Unchanged verification fixture requires a present package") },
        repair: () => { throw new Error("Unchanged verification fixture cannot repair a pending package") }
      }))
      return Effect.succeed({
        type: "unchanged",
        target: native.target,
        state: ownedSnapshot(bundle, planningCalls === 1 ? "f" : "1")
      })
    },
    apply: (plan) => {
      nativeApplyCalls += 1
      return Effect.succeed(completedApply(plan))
    }
  })

  const verification = await runRuntime(unchangedMock, (distribution) => Effect.gen(function*() {
    const plan = expectReady(yield* distribution.plan(requestFor(
      fixture.mainRelease,
      "present",
      [localTarget(fixture.root, "unchanged", "codex", "unchanged")]
    )))
    const step = stepAt(plan, "unchanged")
    expect(step.operation.type).toBe("verify")
    const applied = yield* distribution.apply(plan, Directory.make(join(fixture.root, "changed-basis-state")))
    return applied
  }))
  expect(verification.type).toBe("partial")
  expect(verification.record.entries.map(({ outcome }) => outcomeLabel(outcome))).toEqual(["blocked:basis_changed"])
  expect(planningCalls).toBe(2)
  expect(nativeApplyCalls).toBe(0)

  let removeCalls = 0
  const removal = await runRuntime(makeInstaller({
    apply: (plan) => {
      removeCalls += 1
      return Effect.succeed(completedApply(plan))
    }
  }), (distribution) => Effect.gen(function*() {
    const plan = expectReady(yield* distribution.plan(requestFor(
      fixture.mainRelease,
      "absent",
      [localTarget(fixture.root, "remove", "claude_code", "remove")]
    )))
    const operation = stepAt(plan, "remove").operation
    expect(operation.type).toBe("apply")
    const applied = yield* distribution.apply(plan, Directory.make(join(fixture.root, "removal-state")))
    return { plan, applied }
  }))
  expect(removal.applied.type).toBe("complete")
  expect(removal.applied.record.entries.map(({ outcome }) => outcomeLabel(outcome))).toEqual(["removed"])
  expect(removeCalls).toBe(1)
})

const tamperPackagePayload = (input: DistributionReadyPlan): DistributionReadyPlan => {
  const plan = structuredClone(input)
  const first = plan.steps[0]
  Match.value(first.operation).pipe(Match.discriminatorsExhaustive("type")({
    apply: ({ plan: child }) => Match.value(child.change).pipe(Match.discriminatorsExhaustive("type")({
      install: ({ bundle }) => {
        const file = bundle.files[0]
        const byte = file.content[0]
        if (byte === undefined) throw new Error("Native package file is empty")
        file.content[0] = byte === 0 ? 1 : 0
      },
      replace: ({ bundle }) => {
        const file = bundle.files[0]
        const byte = file.content[0]
        if (byte === undefined) throw new Error("Native package file is empty")
        file.content[0] = byte === 0 ? 1 : 0
      },
      remove: () => { throw new Error("Payload binding test requires an installation") }
    })),
    verify: () => { throw new Error("Payload binding test requires an apply operation") }
  }))
  return plan
}

it("rejects changed plan identities and package bytes, and preserves missing or corrupt stores", async () => {
  const fixture = currentFixture()
  const missingDirectory = join(fixture.root, "existing-missing-store")
  const corruptDirectory = join(fixture.root, "existing-corrupt-store")
  await mkdir(missingDirectory)
  await mkdir(corruptDirectory)
  const corruptBytes = new Uint8Array([0x7b, 0x6e, 0x6f, 0x74, 0x2d, 0x6a, 0x73, 0x6f, 0x6e, 0x7d])
  await writeFile(join(corruptDirectory, "distribution.json"), corruptBytes)
  let childCalls = 0
  const installer = makeInstaller({
    apply: (plan) => {
      childCalls += 1
      return Effect.succeed(completedApply(plan))
    }
  })
  const result = await runRuntime(installer, (distribution) => Effect.gen(function*() {
    const plan = expectReady(yield* distribution.plan(requestFor(
      fixture.mainRelease,
      "present",
      [localTarget(fixture.root, "binding", "codex", "binding")]
    )))
    const invalidId = structuredClone(plan)
    Object.assign(invalidId, { id: DistributionPlanId.make("0".repeat(64)) })
    const badId = yield* Effect.flip(distribution.apply(invalidId, Directory.make(join(fixture.root, "invalid-id-state"))))
    expect(badId).toBeInstanceOf(DistributionRejected)
    expect(badId).toMatchObject({ reason: "invalid_plan" })

    const tampered = tamperPackagePayload(plan)
    const badPayload = yield* Effect.flip(distribution.apply(tampered, Directory.make(join(fixture.root, "invalid-payload-state"))))
    expect(badPayload).toBeInstanceOf(DistributionRejected)
    expect(badPayload).toMatchObject({ reason: "invalid_plan" })

    const missingStore = yield* Effect.flip(distribution.apply(plan, Directory.make(missingDirectory)))
    expect(missingStore).toBeInstanceOf(DistributionUnavailable)
    expect(missingStore).toMatchObject({ directory: missingDirectory })

    const corruptStore = yield* Effect.flip(distribution.apply(plan, Directory.make(corruptDirectory)))
    return { badId, badPayload, missingStore, corruptStore }
  }))
  expect(result.badId).toBeInstanceOf(Error)
  expect(result.badPayload).toBeInstanceOf(Error)
  expect(result.missingStore).toBeInstanceOf(Error)
  expect(result.corruptStore).toBeInstanceOf(Error)
  expect(await readdir(fixture.root)).not.toContain("invalid-id-state")
  expect(await readdir(fixture.root)).not.toContain("invalid-payload-state")
  expect(await readdir(missingDirectory)).not.toContain("distribution.json")
  expect(Array.from(await readFile(join(corruptDirectory, "distribution.json")))).toEqual(Array.from(corruptBytes))
  expect(childCalls).toBe(0)
})

it("rejects schema-valid corrupted stored bindings without changing the ledger or calling a child", async () => {
  const fixture = currentFixture()
  const stateDirectory = join(fixture.root, "corrupt-ledger-state")
  const storePath = join(stateDirectory, "distribution.json")
  let childCalls = 0
  const installer = makeInstaller({
    apply: (plan) => {
      childCalls += 1
      return Effect.succeed(completedApply(plan))
    }
  })
  const completed = await runRuntime(installer, (distribution) => Effect.gen(function*() {
    const plan = expectReady(yield* distribution.plan(requestFor(fixture.mainRelease, "present", [
      localTarget(fixture.root, "alpha", "codex", "alpha"),
      localTarget(fixture.root, "bravo", "claude_code", "bravo")
    ])))
    const result = yield* distribution.apply(plan, Directory.make(stateDirectory))
    return { plan, result }
  }))
  expect(completed.result.type).toBe("complete")
  expect(childCalls).toBe(2)

  const originalBytes = await readFile(storePath)
  const originalStore = Schema.decodeUnknownSync(StoredDistribution, { onExcessProperty: "error" })(
    JSON.parse(originalBytes.toString("utf8"))
  )
  const changeFirstJob = (
    store: StoredDistributionType,
    change: (job: StoredJob) => StoredJob
  ): StoredDistributionType => {
    const [first, ...rest] = store.jobs
    if (first === undefined) throw new Error("Completed plan was not written to the distribution ledger")
    return { ...store, jobs: [change(first), ...rest] }
  }
  const changeFirstEntry = (
    job: StoredJob,
    change: (entry: DistributionExecutionRecord["entries"][number]) => DistributionExecutionRecord["entries"][number]
  ): StoredJob => {
    const [first, ...rest] = job.record.entries
    return { ...job, record: { ...job.record, entries: [change(first), ...rest] } }
  }
  const changeInstalledReceipt = (
    job: StoredJob,
    change: (receipt: InstallationReceipt) => InstallationReceipt
  ): StoredJob => changeFirstEntry(job, (entry) => {
    const receipt = Match.value(entry.outcome).pipe(Match.discriminatorsExhaustive("type")({
      installed: ({ receipt }) => receipt,
      pending: () => { throw new Error("Completed fixture unexpectedly has pending work") },
      removed: () => { throw new Error("Present fixture unexpectedly has a removal result") },
      not_applied: () => { throw new Error("Completed fixture unexpectedly has no installation") },
      unchanged: () => { throw new Error("Fixture did not execute a native installation") },
      blocked: () => { throw new Error("Completed fixture unexpectedly has a blocked result") },
      uncertain: () => { throw new Error("Completed fixture unexpectedly has uncertain work") },
      unavailable: () => { throw new Error("Completed fixture unexpectedly has unavailable work") }
    }))
    const outcome: DistributionOutcome = { type: "installed", receipt: change(receipt) }
    return { ...entry, outcome }
  })
  const differentHex = (value: string): string => value === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64)
  const corruptions: ReadonlyArray<{
    readonly name: string
    readonly change: (store: StoredDistributionType) => StoredDistributionType
  }> = [
    {
      name: "record ID",
      change: (store) => changeFirstJob(store, (job) => ({
        ...job,
        record: { ...job.record, id: DistributionPlanId.make(differentHex(job.record.id)) }
      }))
    },
    {
      name: "desired presence",
      change: (store) => changeFirstJob(store, (job) => ({
        ...job,
        record: { ...job.record, desired: job.record.desired === "present" ? "absent" : "present" }
      }))
    },
    {
      name: "descriptor digest",
      change: (store) => changeFirstJob(store, (job) => changeFirstEntry(job, (entry) => ({
        ...entry,
        step: { ...entry.step, digest: StepDigest.make(differentHex(entry.step.digest)) }
      })))
    },
    {
      name: "descriptor order",
      change: (store) => changeFirstJob(store, (job) => {
        const [first, second, ...rest] = job.record.entries
        if (second === undefined) throw new Error("Corruption fixture needs two execution descriptors")
        return { ...job, record: { ...job.record, entries: [second, first, ...rest] } }
      })
    },
    {
      name: "installed receipt native plan",
      change: (store) => changeFirstJob(store, (job) => changeInstalledReceipt(job, (receipt) => ({
        ...receipt,
        identity: { ...receipt.identity, plan: PlanId.make(differentHex(receipt.identity.plan)) }
      })))
    },
    {
      name: "installed receipt bundle",
      change: (store) => changeFirstJob(store, (job) => changeInstalledReceipt(job, (receipt) => ({
        ...receipt,
        identity: { ...receipt.identity, bundle: BundleDigest.make(differentHex(receipt.identity.bundle)) }
      })))
    },
    {
      name: "duplicate job ID",
      change: (store) => {
        const [first] = store.jobs
        if (first === undefined) throw new Error("Completed plan was not written to the distribution ledger")
        return { ...store, jobs: [first, ...store.jobs] }
      }
    }
  ]

  for (const corruption of corruptions) {
    const corrupted = corruption.change(originalStore)
    const encoded = Buffer.from(JSON.stringify(Schema.encodeSync(StoredDistribution)(corrupted)), "utf8")
    expect(Schema.decodeUnknownSync(StoredDistribution, { onExcessProperty: "error" })(
      JSON.parse(encoded.toString("utf8"))
    )).toEqual(corrupted)
    try {
      await writeFile(storePath, encoded)
      const unavailable = await runRuntime(installer, (distribution) => Effect.flip(
        distribution.apply(completed.plan, Directory.make(stateDirectory))
      ))
      expect(unavailable, corruption.name).toBeInstanceOf(DistributionUnavailable)
      expect(unavailable, corruption.name).toMatchObject({ directory: stateDirectory })
      expect(childCalls, corruption.name).toBe(2)
      expect(await readFile(storePath), corruption.name).toEqual(encoded)
    } finally {
      await writeFile(storePath, originalBytes)
    }
  }
})
