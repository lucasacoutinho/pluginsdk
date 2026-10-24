import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Match, Schema } from "effect"
import { expect, it } from "vitest"
import { BuildRequest, type Bundle, type Format, Compiler } from "../contracts/Compiler.ts"
import { Fingerprint } from "../contracts/Installer.ts"
import {
  InstallationKey,
  PlanBody,
  ReadyPlan,
  StateUnavailable,
  Target,
  type PlanId,
  type Target as TargetType
} from "../contracts/Installer.ts"
import { Identity as PhysicalIdentity } from "../contracts/FileRead.ts"
import * as LocalApproval from "../contracts/LocalApproval.ts"
import * as LocalPackage from "../contracts/LocalPackage.ts"
import { Directory, Plugin, PluginId } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { commitment, fileDigest, planId } from "../src/internal/identity.ts"
import { savePlan } from "../src/installer/lifecycle/plans.ts"
import { readLocalApproval, retainLocalApproval } from "../src/installer/local/claims.ts"
import { durableWrite, readRecord } from "../src/installer/storage.ts"
import { targetPaths } from "../src/installer/target/resolve.ts"
import { classifyLocalPackage } from "../src/installer/local/package.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)
const fixtureRoot = fileURLToPath(new URL("./fixtures/plugins", import.meta.url))
const fixturePlugin = Schema.decodeUnknownSync(Plugin, { onExcessProperty: "error" })(
  JSON.parse(await readFile(new URL("./fixtures/plugins/definition.json", import.meta.url), "utf8"))
)
const bundleCache = new Map<string, Promise<Bundle>>()
const skillDirectories = ["skills", "skills/review", "skills/review/references"]
const codexDirectories = [".codex-plugin", ...skillDirectories]
const claudeDirectories = [".claude-plugin", ...skillDirectories]
const rootOne = Schema.decodeSync(PhysicalIdentity)({ volume: "1".repeat(16), file: "1".repeat(32) })
const rootTwo = Schema.decodeSync(PhysicalIdentity)({ volume: "2".repeat(16), file: "2".repeat(32) })

const buildBundle = (format: Format, version: string): Promise<Bundle> => {
  const cacheKey = `${format}:${version}`
  const cached = bundleCache.get(cacheKey)
  if (cached !== undefined) return cached
  const request = Schema.decodeUnknownSync(BuildRequest, { onExcessProperty: "error" })({
    root: Directory.make(fixtureRoot),
    format,
    plugin: { ...fixturePlugin, version }
  })
  const built = Effect.runPromise(Compiler.use((compiler) => compiler.build(request)).pipe(Effect.provide(CompilerTest)))
  bundleCache.set(cacheKey, built)
  return built
}

const withWorkspace = async <A>(run: (root: string) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-local-claims-"))
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const targetFor = (home: string, plugin: string): TargetType => Schema.decodeSync(Target, { onExcessProperty: "error" })({
  key: InstallationKey.make(commitment("local-claims-test-target", { home, plugin })),
  destination: { type: "user", host: "codex", home: Directory.make(home) },
  plugin: PluginId.make(plugin),
  profile: "codex-local-marketplace:1",
  version: "0.163.0"
})

const makePlan = (target: TargetType, bundle: Bundle): ReadyPlan => {
  const body = Schema.decodeSync(Schema.toType(PlanBody), { onExcessProperty: "error" })({
    type: "ready",
    schema: 1,
    target,
    before: { revision: null, receipt: null, observed: { type: "absent" } },
    change: { type: "install", bundle }
  })
  return Schema.decodeSync(Schema.toType(ReadyPlan), { onExcessProperty: "error" })({
    ...body,
    id: planId(body)
  })
}

const makeRemovePlan = (target: TargetType, previous: ReadyPlan): ReadyPlan => {
  const identity = Match.value(previous.change).pipe(Match.discriminatorsExhaustive("type")({
    install: ({ bundle }) => ({ plan: previous.id, bundle: bundle.digest }),
    replace: ({ bundle }) => ({ plan: previous.id, bundle: bundle.digest }),
    remove: () => { throw new Error("Removal fixture requires a prior package") }
  }))
  const fingerprint = Fingerprint.make(commitment("local-claims-remove-fixture", identity))
  const body = Schema.decodeSync(Schema.toType(PlanBody), { onExcessProperty: "error" })({
    type: "ready",
    schema: 1,
    target,
    before: {
      revision: previous.id,
      receipt: { identity, fingerprint },
      observed: { type: "present", identity, fingerprint }
    },
    change: { type: "remove" }
  })
  return Schema.decodeSync(Schema.toType(ReadyPlan), { onExcessProperty: "error" })({
    ...body,
    id: planId(body)
  })
}

const treeFixtureFromBundle = (
  bundle: Bundle,
  root: PhysicalIdentity,
  directories: ReadonlyArray<string>
): LocalPackage.Tree => {
  const files = bundle.files.map(({ path, content }) => ({
    path,
    digest: fileDigest(content),
    mode: { type: "unrepresented" as const }
  }))
  return Schema.decodeSync(LocalPackage.Tree, { onExcessProperty: "error" })({
    root,
    basis: Fingerprint.make(commitment("local-claims-captured-tree", { root, directories, files })),
    directories,
    files
  })
}

const descriptors = (bundle: Bundle): LocalPackage.Approval["files"] => {
  const descriptor = ({ path, content, executable }: Bundle["files"][number]) => ({
    path,
    digest: fileDigest(content),
    executable
  })
  const [head, ...tail] = bundle.files
  return [descriptor(head), ...tail.map(descriptor)]
}

const approvalFor = (target: TargetType, plan: ReadyPlan, bundle: Bundle, root: PhysicalIdentity) =>
  Schema.decodeSync(LocalPackage.Approval, { onExcessProperty: "error" })({
    owner: target.key,
    identity: { plan: plan.id, bundle: bundle.digest },
    root,
    files: descriptors(bundle)
  })

const recordPath = (target: TargetType, root: PhysicalIdentity): string =>
  join(targetPaths(target).directory, "physical-claims", `${commitment("local-package-root", root)}.json`)

const planPath = (target: TargetType, id: PlanId): string =>
  join(targetPaths(target).plans, `${id}.json`)

const recordFor = (
  target: TargetType,
  plan: ReadyPlan,
  bundle: Bundle,
  root: PhysicalIdentity,
  owner = target.key,
  recordRoot = root
): LocalApproval.Record => Schema.decodeSync(LocalApproval.Record, { onExcessProperty: "error" })({
  schema: 1,
  owner,
  identity: { plan: plan.id, bundle: bundle.digest },
  root: recordRoot
})

const storeRecord = async (target: TargetType, record: LocalApproval.Record): Promise<void> => {
  const path = recordPath(target, record.root)
  await storeRecordAt(target, path, record)
}

const storeRecordAt = async (
  target: TargetType,
  path: string,
  record: LocalApproval.Record
): Promise<void> => {
  const encoded = Schema.encodeSync(LocalApproval.Record, { onExcessProperty: "error" })(record)
  await Effect.runPromise(durableWrite(target.key, path, encoded))
}

const storePlanAt = async (target: TargetType, path: string, plan: ReadyPlan): Promise<void> => {
  const encoded = Schema.encodeSync(ReadyPlan, { onExcessProperty: "error" })(plan)
  await Effect.runPromise(durableWrite(target.key, path, encoded))
}

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path)
    return true
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return false
    throw cause
  }
}

const fileState = async (path: string) => {
  const info = await stat(path, { bigint: true })
  return {
    bytes: await readFile(path),
    inode: info.ino,
    mtime: info.mtimeNs,
    ctime: info.ctimeNs
  }
}

const expectUnavailable = async (effect: Effect.Effect<unknown, StateUnavailable>): Promise<void> => {
  await expect(Effect.runPromise(effect)).rejects.toBeInstanceOf(StateUnavailable)
}

it("returns null for absent and stale-root namespaces without creating storage", async () => {
  await withWorkspace(async (workspace) => {
    const bundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const target = targetFor(join(workspace, "home"), bundle.plugin)

    await expect(Effect.runPromise(readLocalApproval(target, rootOne))).resolves.toBeNull()
    await expect(Effect.runPromise(readLocalApproval(target, rootTwo))).resolves.toBeNull()
    expect(await pathExists(targetPaths(target).store)).toBe(false)
  })
})

it("retains the real bundle plan and exact descriptors, and identical replay preserves the claim file", async () => {
  await withWorkspace(async (workspace) => {
    const bundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const tree = treeFixtureFromBundle(bundle, rootOne, codexDirectories)
    const target = targetFor(join(workspace, "home"), bundle.plugin)
    const plan = makePlan(target, bundle)

    await Effect.runPromise(retainLocalApproval(plan, tree))
    const claimPath = recordPath(target, tree.root)
    const firstClaim = await fileState(claimPath)
    const firstPlan = await fileState(planPath(target, plan.id))
    const expected = {
      owner: target.key,
      identity: { plan: plan.id, bundle: bundle.digest },
      root: tree.root,
      files: descriptors(bundle)
    }
    await expect(Effect.runPromise(readLocalApproval(target, tree.root))).resolves.toEqual(expected)
    await expect(Effect.runPromise(readRecord(target.key, planPath(target, plan.id), ReadyPlan))).resolves.toEqual(plan)

    await Effect.runPromise(retainLocalApproval(plan, tree))
    expect(await fileState(claimPath)).toEqual(firstClaim)
    expect(await fileState(planPath(target, plan.id))).toEqual(firstPlan)

    await expect(Effect.runPromise(readLocalApproval(target, rootTwo))).resolves.toBeNull()
  })
})

it("refuses partial and foreign trees before creating storage or retaining a plan", async () => {
  await withWorkspace(async (workspace) => {
    const bundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const nextBundle = await buildBundle("codex_plugin_portable_v1", "0.1.1")
    const target = targetFor(join(workspace, "home"), bundle.plugin)
    const plan = makePlan(target, bundle)
    const completeTree = treeFixtureFromBundle(bundle, rootOne, codexDirectories)
    const partialTree = Schema.decodeSync(LocalPackage.Tree)({
      ...completeTree,
      files: completeTree.files.slice(1)
    })
    const foreignTree = treeFixtureFromBundle(nextBundle, rootOne, codexDirectories)
    const cases = [
      { kind: "partial", tree: partialTree },
      { kind: "foreign", tree: foreignTree }
    ] as const

    for (const { kind, tree } of cases) {
      const classification = classifyLocalPackage({
        approval: approvalFor(target, plan, bundle, tree.root),
        observed: { type: "tree", ...tree }
      })
      expect(classification.type).toBe(kind)

      await expectUnavailable(retainLocalApproval(plan, tree))
      expect(await pathExists(targetPaths(target).store)).toBe(false)
      expect(await pathExists(planPath(target, plan.id))).toBe(false)
      expect(await pathExists(recordPath(target, tree.root))).toBe(false)
    }
  })
})

it("refuses a removal plan and an unqualified package format without writes", async () => {
  await withWorkspace(async (workspace) => {
    const bundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const tree = treeFixtureFromBundle(bundle, rootOne, codexDirectories)
    const target = targetFor(join(workspace, "removal-home"), bundle.plugin)
    const prior = makePlan(target, bundle)
    const removal = makeRemovePlan(target, prior)
    await expectUnavailable(retainLocalApproval(removal, tree))
    expect(await pathExists(targetPaths(target).store)).toBe(false)

    const claudeBundle = await buildBundle("claude_code_portable_v1", "0.1.0")
    const claudeTree = treeFixtureFromBundle(claudeBundle, rootTwo, claudeDirectories)
    const unqualifiedPlan = makePlan(target, claudeBundle)
    await expectUnavailable(retainLocalApproval(unqualifiedPlan, claudeTree))
    expect(await pathExists(targetPaths(target).store)).toBe(false)
    expect(await pathExists(planPath(target, unqualifiedPlan.id))).toBe(false)
    expect(await pathExists(recordPath(target, claudeTree.root))).toBe(false)
  })
})

it("refuses a different plan for an already claimed physical root without rewriting or retaining it", async () => {
  await withWorkspace(async (workspace) => {
    const firstBundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const nextBundle = await buildBundle("codex_plugin_portable_v1", "0.1.1")
    const target = targetFor(join(workspace, "home"), firstBundle.plugin)
    const firstTree = treeFixtureFromBundle(firstBundle, rootOne, codexDirectories)
    const nextTree = treeFixtureFromBundle(nextBundle, rootOne, codexDirectories)
    const firstPlan = makePlan(target, firstBundle)
    const nextPlan = makePlan(target, nextBundle)
    expect(nextPlan.id).not.toBe(firstPlan.id)

    await Effect.runPromise(retainLocalApproval(firstPlan, firstTree))
    const claimPath = recordPath(target, firstTree.root)
    const before = await fileState(claimPath)
    await expectUnavailable(retainLocalApproval(nextPlan, nextTree))
    expect(await fileState(claimPath)).toEqual(before)
    expect(await pathExists(planPath(target, nextPlan.id))).toBe(false)
  })
})

it("refuses malformed claims and missing, corrupt, or mismatched retained plans", async () => {
  await withWorkspace(async (workspace) => {
    const bundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const nextBundle = await buildBundle("codex_plugin_portable_v1", "0.1.1")
    const cases = [
      "malformed-record",
      "missing-plan",
      "corrupt-plan",
      "mismatched-plan",
      "corrupt-plan-commitment",
      "corrupt-bundle-commitment"
    ] as const
    for (const kind of cases) {
      const home = join(workspace, `${kind}-home`)
      const target = targetFor(home, bundle.plugin)
      const tree = treeFixtureFromBundle(bundle, rootOne, codexDirectories)
      const plan = makePlan(target, bundle)
      const path = recordPath(target, tree.root)

      await storeRecord(target, recordFor(target, plan, bundle, tree.root))
      await Match.value(kind).pipe(
        Match.when("malformed-record", () => writeFile(path, JSON.stringify({
          schema: 1, owner: target.key, identity: { plan: plan.id, bundle: bundle.digest }, root: tree.root, extra: true
        }))),
        Match.when("missing-plan", () => Promise.resolve()),
        Match.when("corrupt-plan", async () => {
          await mkdir(dirname(planPath(target, plan.id)), { recursive: true })
          await writeFile(planPath(target, plan.id), "{invalid json")
        }),
        Match.when("mismatched-plan", async () => {
          const otherPlan = makePlan(target, nextBundle)
          await storePlanAt(target, planPath(target, plan.id), otherPlan)
        }),
        Match.when("corrupt-plan-commitment", async () => {
          const changedPlan = { ...makePlan(target, nextBundle), id: plan.id }
          await storePlanAt(target, planPath(target, plan.id), changedPlan)
        }),
        Match.when("corrupt-bundle-commitment", async () => {
          const [head, ...tail] = bundle.files
          const corrupted: Bundle = { ...bundle, files: [{ ...head, content: new Uint8Array([0]) }, ...tail] }
          const changedPlan = makePlan(target, corrupted)
          await storeRecord(target, recordFor(target, changedPlan, corrupted, tree.root))
          await storePlanAt(target, planPath(target, changedPlan.id), changedPlan)
        }),
        Match.exhaustive
      )
      await expectUnavailable(readLocalApproval(target, tree.root))
    }
  })
})

it("refuses present claims with the wrong owner, captured root, or current target", async () => {
  await withWorkspace(async (workspace) => {
    const bundle = await buildBundle("codex_plugin_portable_v1", "0.1.0")
    const tree = treeFixtureFromBundle(bundle, rootOne, codexDirectories)
    const home = join(workspace, "home")
    const target = targetFor(home, bundle.plugin)
    const plan = makePlan(target, bundle)
    await Effect.runPromise(savePlan(plan))

    await storeRecord(target, recordFor(
      target,
      plan,
      bundle,
      tree.root,
      InstallationKey.make(commitment("other-claim-owner", { target: target.key }))
    ))
    await expectUnavailable(readLocalApproval(target, tree.root))

    await storeRecordAt(target, recordPath(target, tree.root), recordFor(target, plan, bundle, tree.root, target.key, rootTwo))
    await expectUnavailable(readLocalApproval(target, tree.root))
    await expect(Effect.runPromise(readLocalApproval(target, rootTwo))).resolves.toBeNull()

    await storeRecord(target, recordFor(target, plan, bundle, tree.root))
    const changedTarget = Schema.decodeSync(Target)({
      ...target,
      plugin: PluginId.make("different-current-plugin")
    })
    await expectUnavailable(readLocalApproval(changedTarget, tree.root))
  })
})
