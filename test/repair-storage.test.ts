import { expect, it } from "vitest"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { Bundle as BundleSchema, BundleBody, type Bundle } from "../contracts/Compiler.ts"
import {
  Fingerprint,
  InstallationKey,
  PlanBody,
  PlanId,
  ReadyPlan,
  RepairBasis,
  RepairPlan,
  RepairPlanBody,
  StateUnavailable,
  Target
} from "../contracts/Installer.ts"
import type {
  ReadyPlan as ReadyPlanValue,
  PlanId as PlanIdValue,
  RepairPlan as RepairPlanValue,
  ReviewedPlan,
  Target as TargetValue
} from "../contracts/Installer.ts"
import { Directory, PackagePath, PluginId } from "../contracts/Plugin.ts"
import { bundleDigest, planId } from "../src/internal/identity.ts"
import { validateBundle } from "../src/compiler/native.ts"
import { loadState, savePlan, saveState, snapshotPlan } from "../src/installer/plan.ts"
import { StoredState, type StoredState as StoredStateValue } from "../src/installer/records.ts"
import { targetPaths } from "../src/installer/target.ts"

const readyGoldenId = "fd8544b98f5b64e1c18aca96110e48bdddaa328815a3d83c954dd3a75945d52d"
const repairGoldenId = "23ff7f3bd3292e9ae04d5102c244328b480f9ac222b0f471b633c63a28c742fe"
const readyGoldenCanonical = "{\"before\":{\"observed\":{\"type\":\"absent\"},\"receipt\":null,\"revision\":null},\"change\":{\"type\":\"remove\"},\"schema\":1,\"target\":{\"destination\":{\"home\":\"/home/pluginsdk-golden\",\"host\":\"codex\",\"type\":\"user\"},\"key\":\"golden-key\",\"plugin\":\"golden-plugin\",\"profile\":\"codex-profile-v1\",\"version\":\"0.1.0\"},\"type\":\"ready\"}"
const repairGoldenCanonical = `{"before":{"interrupted":"${"a".repeat(64)}","observed":{"fingerprint":"${"1".repeat(64)}","residual":"marketplace"},"pending":"${"b".repeat(64)}"},"schema":1,"target":{"destination":{"home":"/home/pluginsdk-golden","host":"codex","type":"user"},"key":"golden-key","plugin":"golden-plugin","profile":"codex-profile-v1","version":"0.1.0"},"type":"repair_ready"}`
const manifestSchema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"

const hashPlanPreimage = (canonicalBody: string): string =>
  createHash("sha256").update("pluginsdk:plan:1\0").update(canonicalBody).digest("hex")

type PlanRole = "original" | "current"
type RetainedPlanFailure = {
  readonly label: string
  readonly role: PlanRole
  readonly action: "delete" | "corrupt"
}

const makeTarget = (
  home: string,
  key = "repair-storage-key",
  version = "0.1.0",
  plugin = "repair-storage-fixture"
): TargetValue =>
  Schema.decodeSync(Target)({
    key: InstallationKey.make(key),
    destination: { type: "user", host: "codex", home: Directory.make(home) },
    plugin: PluginId.make(plugin),
    profile: "codex-profile-v1",
    version
  })

const makeBundle = (plugin: TargetValue["plugin"]): Bundle => {
  const content = new TextEncoder().encode(JSON.stringify({
    $schema: manifestSchema,
    name: plugin,
    version: "1.0.0",
    description: "Durable repair storage fixture"
  }))
  const body = Schema.decodeSync(Schema.toType(BundleBody))({
    schema: 1,
    plugin,
    format: "agent_plugins_v1",
    files: [{ path: PackagePath.make("plugin.json"), content, executable: false }]
  })
  const bundle = Schema.decodeSync(Schema.toType(BundleSchema))({ ...body, digest: bundleDigest(body) })
  validateBundle(bundle)
  return bundle
}

const makeReadyPlan = (target: TargetValue, bundle: Bundle): ReadyPlanValue => {
  const body = Schema.decodeSync(Schema.toType(PlanBody))({
    type: "ready",
    schema: 1,
    target,
    before: { revision: null, receipt: null, observed: { type: "absent" } },
    change: { type: "install", bundle }
  })
  return Schema.decodeSync(Schema.toType(ReadyPlan))({ ...body, id: planId(body) })
}

const makeRepairPlan = (
  target: TargetValue,
  interrupted: PlanIdValue,
  pending: PlanIdValue,
  fingerprint = "1".repeat(64),
  residual: "absent" | "marketplace" = "marketplace"
): RepairPlanValue => {
  const before = Schema.decodeSync(Schema.toType(RepairBasis))({
    interrupted,
    pending,
    observed: { fingerprint: Fingerprint.make(fingerprint), residual }
  })
  const body = Schema.decodeSync(Schema.toType(RepairPlanBody))({ type: "repair_ready", schema: 1, target, before })
  return Schema.decodeSync(Schema.toType(RepairPlan))({ ...body, id: planId(body) })
}

const pendingRepairState = (original: ReadyPlanValue, plan: RepairPlanValue): StoredStateValue => ({
  schema: 1,
  type: "repair_pending",
  original,
  plan,
  execution: { type: "prepared" }
})

const withHome = async <A>(run: (home: string, target: TargetValue) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-repair-storage-"))
  const home = join(root, "home")
  await mkdir(home)
  try {
    return await run(home, makeTarget(home))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const saveRepairRecord = async (
  target: TargetValue,
  original: ReadyPlanValue,
  plan: RepairPlanValue,
  predecessors: ReadonlyArray<RepairPlanValue> = []
): Promise<void> => {
  const plans: ReadonlyArray<ReviewedPlan> = [original, ...predecessors, plan]
  for (const retained of plans) await Effect.runPromise(savePlan(retained))
  await Effect.runPromise(saveState(target, pendingRepairState(original, plan)))
}

const planPath = (target: TargetValue, plan: ReviewedPlan): string =>
  join(targetPaths(target).plans, `${plan.id}.json`)

const selectedPlan = (role: PlanRole, original: ReadyPlanValue, current: RepairPlanValue): ReviewedPlan =>
  Match.value(role).pipe(
    Match.when("original", () => original),
    Match.when("current", () => current),
    Match.exhaustive
  )

const alterRetainedPlan = (path: string, action: RetainedPlanFailure["action"]): Promise<void> =>
  Match.value(action).pipe(
    Match.when("delete", () => rm(path)),
    Match.when("corrupt", () => writeFile(path, "{")),
    Match.exhaustive
  )

const expectNoNativeConfig = async (home: string): Promise<void> => {
  await expect(readFile(join(home, "config.toml"), "utf8")).rejects.toHaveProperty("code", "ENOENT")
}

it("preserves the ready-plan v1 identity and commits each repair-plan field", () => {
  const target = makeTarget("/home/pluginsdk-golden", "golden-key", "0.1.0", "golden-plugin")
  expect(hashPlanPreimage(readyGoldenCanonical)).toBe(readyGoldenId)
  expect(hashPlanPreimage(repairGoldenCanonical)).toBe(repairGoldenId)
  const readyBody = Schema.decodeSync(Schema.toType(PlanBody))({
    type: "ready",
    schema: 1,
    target,
    before: { revision: null, receipt: null, observed: { type: "absent" } },
    change: { type: "remove" }
  })
  const readyWithIndependentId = Schema.decodeSync(Schema.toType(ReadyPlan))({
    ...readyBody,
    id: PlanId.make("f".repeat(64))
  })
  expect(planId(readyWithIndependentId)).toBe(readyGoldenId)

  const before = Schema.decodeSync(Schema.toType(RepairBasis))({
    interrupted: PlanId.make("a".repeat(64)),
    pending: PlanId.make("b".repeat(64)),
    observed: { fingerprint: Fingerprint.make("1".repeat(64)), residual: "marketplace" }
  })
  const body = Schema.decodeSync(Schema.toType(RepairPlanBody))({ type: "repair_ready", schema: 1, target, before })
  expect(planId(body)).toBe(repairGoldenId)
  expect(planId(Schema.decodeSync(Schema.toType(RepairPlanBody))({
    ...body,
    target: makeTarget("/home/pluginsdk-golden", "other-golden-key", "0.1.0", "golden-plugin")
  }))).not.toBe(repairGoldenId)
  expect(planId(Schema.decodeSync(Schema.toType(RepairPlanBody))({
    ...body,
    before: { ...before, interrupted: PlanId.make("c".repeat(64)) }
  }))).not.toBe(repairGoldenId)
  expect(planId(Schema.decodeSync(Schema.toType(RepairPlanBody))({
    ...body,
    before: { ...before, pending: PlanId.make("d".repeat(64)) }
  }))).not.toBe(repairGoldenId)
  expect(planId(Schema.decodeSync(Schema.toType(RepairPlanBody))({
    ...body,
    before: { ...before, observed: { ...before.observed, fingerprint: Fingerprint.make("2".repeat(64)) } }
  }))).not.toBe(repairGoldenId)
  expect(planId(Schema.decodeSync(Schema.toType(RepairPlanBody))({
    ...body,
    before: { ...before, observed: { ...before.observed, residual: "absent" } }
  }))).not.toBe(repairGoldenId)
})

it("durably reloads the full repair state after the caller mutates its bundle bytes", async () => {
  await withHome(async (home, target) => {
    const sourceBundle = makeBundle(target.plugin)
    const originalBytes = new Uint8Array(sourceBundle.files[0].content)
    const original = snapshotPlan(makeReadyPlan(target, sourceBundle))
    const cleanup = makeRepairPlan(target, original.id, original.id)
    const expected = pendingRepairState(original, cleanup)

    await saveRepairRecord(target, original, cleanup)
    sourceBundle.files[0].content.fill(0)
    expect(sourceBundle.files[0].content).not.toEqual(originalBytes)

    const loaded = await Effect.runPromise(loadState(target))
    expect(Schema.toEquivalence(StoredState)(loaded, expected)).toBe(true)
    const retainedOriginal = Match.value(loaded).pipe(Match.discriminatorsExhaustive("type")({
      idle: () => { throw new Error("Expected a pending repair record") },
      pending: () => { throw new Error("Expected a pending repair record") },
      repair_pending: (state) => state.original
    }))
    const retainedBundle = Match.value(retainedOriginal.change).pipe(Match.discriminatorsExhaustive("type")({
      install: (change) => change.bundle,
      replace: (change) => change.bundle,
      remove: () => { throw new Error("Expected the interrupted install bundle") }
    }))
    expect(retainedBundle.files[0].content).toEqual(originalBytes)
    expect(bundleDigest(retainedBundle)).toBe(retainedBundle.digest)
    expect(await readdir(home)).toEqual([".pluginsdk"])
  })
})

const retainedFailureCases: ReadonlyArray<RetainedPlanFailure> = [
  { label: "deleted original", role: "original", action: "delete" },
  { label: "corrupt original", role: "original", action: "corrupt" },
  { label: "deleted current cleanup", role: "current", action: "delete" },
  { label: "corrupt current cleanup", role: "current", action: "corrupt" }
]

for (const scenario of retainedFailureCases) {
  it(`rejects a ${scenario.label} with StateUnavailable before any native config exists`, async () => {
    await withHome(async (home, target) => {
      const original = snapshotPlan(makeReadyPlan(target, makeBundle(target.plugin)))
      const current = makeRepairPlan(target, original.id, original.id)
      await saveRepairRecord(target, original, current)
      await expectNoNativeConfig(home)

      const missingOrCorrupt = selectedPlan(scenario.role, original, current)
      await alterRetainedPlan(planPath(target, missingOrCorrupt), scenario.action)
      await expect(Effect.runPromise(loadState(target))).rejects.toBeInstanceOf(StateUnavailable)

      await expectNoNativeConfig(home)
      expect(await readdir(home)).toEqual([".pluginsdk"])
    })
  })
}

it("requires the immediate cleanup predecessor but does not walk older retained history", async () => {
  await withHome(async (home, target) => {
    const original = snapshotPlan(makeReadyPlan(target, makeBundle(target.plugin)))
    const first = makeRepairPlan(target, original.id, original.id, "1".repeat(64))
    const second = makeRepairPlan(target, original.id, first.id, "2".repeat(64))
    const secondState = pendingRepairState(original, second)

    await saveRepairRecord(target, original, second, [first])
    expect(Schema.toEquivalence(StoredState)(await Effect.runPromise(loadState(target)), secondState)).toBe(true)

    const firstPath = planPath(target, first)
    await rm(firstPath)
    await expect(Effect.runPromise(loadState(target))).rejects.toBeInstanceOf(StateUnavailable)
    await writeFile(firstPath, "{")
    await expect(Effect.runPromise(loadState(target))).rejects.toBeInstanceOf(StateUnavailable)

    const third = makeRepairPlan(target, original.id, second.id, "3".repeat(64))
    const thirdState = pendingRepairState(original, third)
    await Effect.runPromise(savePlan(third))
    await Effect.runPromise(saveState(target, thirdState))
    expect(Schema.toEquivalence(StoredState)(await Effect.runPromise(loadState(target)), thirdState)).toBe(true)
    await expectNoNativeConfig(home)
  })
})
