import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { Compiler } from "../contracts/Compiler.ts"
import type { PlanBody, ReadyPlan } from "../contracts/Installer.ts"
import { Directory, Plugin } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { planId } from "../src/internal/identity.ts"
import { captureCompanions, inspectCompanions, validateCompanionPlan } from "../src/installer/companions/capture.ts"
import { snapshotPlan } from "../src/installer/lifecycle/plans.ts"
import { ProjectTarget, projectActivation, projectRevision } from "../src/installer/project/layout.ts"
import { targetPaths } from "../src/installer/target/resolve.ts"
import { roleLimits } from "../src/installer/project/codex-role-sources.ts"

const TestLayers = Layer.provideMerge(CompilerLive, NodeServices.layer)
const target = Schema.decodeSync(ProjectTarget)({
  key: "a".repeat(64),
  destination: { type: "project", host: "codex", home: "/tmp/project-layout-home", root: "/tmp/project-layout-root" },
  plugin: "layout-fixture", profile: "codex-project-cache:1", version: "0.163.0"
})

it.effect("binds the current Codex project package to the revision cache without user companion capture", () => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const compiler = yield* Compiler
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-project-layout-" })
  yield* fs.writeFile(join(root, "review.md"), new TextEncoder().encode("Review this project only.\n"))
  const agents = { reviewer: { description: "Review the project", prompt: "review.md", shell: "deny" } }
  const plugin = yield* Schema.decodeUnknownEffect(Plugin)({ id: target.plugin, version: "1.2.3", description: "Project cache binding", skills: [], mcp: {}, agents })
  const bundle = yield* compiler.build({ root: Directory.make(root), plugin, format: "codex" })
  const body: PlanBody = {
    type: "ready", schema: 1, target,
    before: { revision: null, receipt: null, observed: { type: "absent" } },
    project: { before: { type: "absent" }, previous: null },
    change: { type: "install", bundle }
  }
  const plan: ReadyPlan = { ...body, id: planId(body) }
  expect(snapshotPlan(plan)).toEqual(plan)
  const projected = projectActivation(target, plan.id, bundle)
  const revision = projectRevision(target, plan.id)
  const cache = join(target.destination.home, "plugins", "cache", revision.marketplace, target.plugin, "1.2.3")
  expect(projected.cache).toEqual({ directory: join(target.destination.home, "plugins", "cache", revision.marketplace), payload: cache })
  expect(projected.activation.registration).toEqual({ plugin: target.plugin, marketplace: revision.marketplace, root: revision.market })
  expect(projected.cache.directory).not.toBe(join(target.destination.home, "plugins", "cache", targetPaths(target).marketName))
  expect(projected.activation.agents).toEqual([
    { name: "layout-fixture:reviewer", configFile: join(cache, "agents", "reviewer.toml") }
  ])
  expect(yield* captureCompanions(target, body.before, body.change)).toBeUndefined()
  expect(yield* inspectCompanions(target, bundle)).toEqual({ matches: true, unknown: false, residual: false, facts: null })
  expect(() => validateCompanionPlan({ ...plan, target: { ...target, destination: { type: "user", host: "codex", home: target.destination.home } } }))
    .toThrow("complete companion capture")
  expect(() => validateCompanionPlan({ ...plan, companions: { previous: [], desired: [] } }))
    .toThrow("cannot use user companion capture")

  const claudePlugin = yield* Schema.decodeEffect(Plugin)({
    id: target.plugin, version: "1.2.3", description: "Project cache binding", skills: [], mcp: {}, agents: {}
  })
  const claudeBundle = yield* compiler.build({ root: Directory.make(root), plugin: claudePlugin, format: "claude_code" })
  expect(() => projectActivation(target, plan.id, claudeBundle)).toThrow("target's complete Codex package")
}).pipe(Effect.provide(TestLayers)))

it.effect("refuses a valid package whose agent exceeds the bounded native reader", () => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const compiler = yield* Compiler
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-project-role-limit-" })
  yield* fs.writeFile(join(root, "large.md"), new TextEncoder().encode("x".repeat(roleLimits.bytes)))
  const plugin = yield* Schema.decodeEffect(Plugin)({
    id: target.plugin, version: "1.2.3", description: "Bounded project role", skills: [], mcp: {},
    agents: { reviewer: { description: "Review the project", prompt: "large.md" } }
  })
  const bundle = yield* compiler.build({ root: Directory.make(root), plugin, format: "codex" })
  const body: PlanBody = {
    type: "ready", schema: 1, target,
    before: { revision: null, receipt: null, observed: { type: "absent" } },
    project: { before: { type: "absent" }, previous: null },
    change: { type: "install", bundle }
  }
  expect(() => projectActivation(target, planId(body), bundle)).toThrow("native inventory's role count or file size limit")
}).pipe(Effect.provide(TestLayers)))
