import { lstat, mkdtemp, rename, rm } from "node:fs/promises"
import { basename, dirname, join, relative, toNamespacedPath } from "node:path"
import { Effect, Match, Schema } from "effect"
import { StateUnavailable, type ReadyPlan } from "../../../contracts/Installer.ts"
import { syncDirectory } from "../../internal/storage.ts"
import { replaceProjectFile } from "./files/file.ts"
import { observeProject, projectRolesReleased, reviewProjectPlan, verifyProjectRevision } from "./inspect.ts"
import { isCodexProject, projectActivation, projectCatalog, projectRevision, type ProjectTarget } from "./layout.ts"
import { Installed } from "../lifecycle/records.ts"
import { durableWrite, ensureDirectory, stateIO } from "../storage.ts"
import { materializePayload } from "../payload/materialize.ts"
import { targetPaths } from "../target/resolve.ts"

const encodeInstalled = Schema.encodeSync(Installed)

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"

const temporaryDirectory = Effect.fnUntraced(function*(target: ProjectTarget, parent: string) {
  yield* ensureDirectory(target.key, parent)
  return yield* Effect.acquireRelease(
    stateIO(target.key, async () => {
      const created = await mkdtemp(toNamespacedPath(join(parent, ".pluginsdk-")))
      const path = join(parent, basename(created))
      const identity = await lstat(path)
      return { path, identity }
    }),
    (temporary) => Effect.promise(async () => {
      let current
      try { current = await lstat(temporary.path) }
      catch (cause) { if (isMissing(cause)) return; throw cause }
      if (current.dev === temporary.identity.dev && current.ino === temporary.identity.ino && current.isDirectory()) {
        await rm(temporary.path, { recursive: true })
        await syncDirectory(parent)
      }
    })
  )
})

const commitDirectory = (target: ProjectTarget, from: string, to: string, parent: string) => stateIO(target.key, async () => {
  try {
    await lstat(to)
    throw new Error("Immutable project revision already exists")
  } catch (cause) {
    if (!isMissing(cause)) throw cause
  }
  await rename(from, to)
  await syncDirectory(parent)
}).pipe(Effect.uninterruptible)

const prepare = Effect.fn("Installer.prepareProjectRevision")(function*(target: ProjectTarget, plan: ReadyPlan) {
  if (plan.change.type === "remove") return
  const bundle = plan.change.bundle
  const paths = targetPaths(target)
  const revision = projectRevision(target, plan.id)
  const { cache } = yield* Effect.try({
    try: () => projectActivation(target, plan.id, bundle),
    catch: (cause) => new StateUnavailable({ key: target.key, cause })
  })
  const revisions = join(paths.directory, "revisions")
  const staged = yield* temporaryDirectory(target, revisions)
  const cacheParent = dirname(cache.directory)
  const cached = yield* temporaryDirectory(target, cacheParent)
  yield* materializePayload(target.key, join(staged.path, "market", "payload"), bundle.files)
  yield* materializePayload(target.key, join(cached.path, relative(cache.directory, cache.payload)), bundle.files)
  yield* durableWrite(target.key, join(staged.path, "market", ".agents/plugins/marketplace.json"), projectCatalog(target, plan.id))
  yield* commitDirectory(target, staged.path, revision.directory, revisions)
  yield* commitDirectory(target, cached.path, cache.directory, cacheParent)
  yield* durableWrite(target.key, join(paths.markers, `${plan.id}.json`), encodeInstalled({
    schema: 1,
    target,
    identity: { plan: plan.id, bundle: plan.change.bundle.digest },
    bundle: plan.change.bundle
  }))
  if ((yield* verifyProjectRevision(target, plan.id)) === null) {
    return yield* new StateUnavailable({ key: target.key, cause: new Error("Prepared project revision does not match the approved package") })
  }
})

const cleanupPrevious = Effect.fn("Installer.cleanupProjectRevision")(function*(target: ProjectTarget, plan: ReadyPlan) {
  const previous = plan.before.receipt
  if (previous === null) return
  const active = yield* observeProject(target, true)
  const transitioned = Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
    install: () => active.type === "present" && active.identity?.plan === plan.id,
    replace: () => active.type === "present" && active.identity?.plan === plan.id,
    remove: () => active.type === "absent"
  }))
  if (!transitioned) return
  const owned = yield* verifyProjectRevision(target, previous.identity.plan).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed(null),
    StateUnavailable: () => Effect.succeed(null)
  }))
  if (owned === null || owned.identity.bundle !== previous.identity.bundle) return
  const released = yield* projectRolesReleased(plan, owned.activation).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed(false),
    StateUnavailable: () => Effect.succeed(false),
    HostUnavailable: () => Effect.succeed(false)
  }))
  if (!released) return
  yield* stateIO(target.key, async () => {
    await rm(owned.cacheRoot, { recursive: true })
    await syncDirectory(join(target.destination.home, "plugins", "cache"))
  })
})

export const executeProjectChange = Effect.fn("Installer.projectChange")(function*(plan: ReadyPlan) {
  if (!isCodexProject(plan.target) || plan.project === undefined) {
    return yield* new StateUnavailable({ key: plan.target.key, cause: new Error("Project execution requires a captured Codex project plan") })
  }
  const target = plan.target
  const before = yield* reviewProjectPlan(plan, true)
  if (before.type === "blocked") return yield* new StateUnavailable({ key: target.key, cause: new Error("Project configuration changed before execution") })
  yield* prepare(target, plan)
  const activation = yield* reviewProjectPlan(plan, true)
  if (activation.type === "blocked") return yield* new StateUnavailable({ key: target.key, cause: new Error("Project configuration changed during preparation") })
  yield* replaceProjectFile(target, plan.project.before, activation.text)
  yield* cleanupPrevious(target, plan)
}, Effect.scoped)
