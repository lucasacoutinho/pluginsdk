import { randomUUID } from "node:crypto"
import { posix, win32 } from "node:path"
import { Context, Effect, Layer, Match, Schema } from "effect"
import { Identity, Observation, RepairSnapshot, StateUnavailable, type Conflict, type ReadyPlan, type RepairPlan, type Target } from "../../../contracts/Installer.ts"
import type { RepairInspection } from "../../../contracts/Repair.ts"
import * as Package from "../../../contracts/LocalPackage.ts"
import * as Slot from "../../../contracts/LocalSlot.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { WindowsDirectoryMover, WindowsDirectoryMoverLive } from "../../internal/windows-files/directory-move.ts"
import { WindowsPackageReader, WindowsPackageReaderLive } from "../../internal/windows-files/payload.ts"
import { WindowsPayloadWriter, WindowsPayloadWriterLive } from "../../internal/windows-files/writer.ts"
import { syncDirectory } from "../../internal/storage.ts"
import { classifyLocalPackage } from "./package.ts"
import { observeLocalSlots } from "./observation.ts"
import { advanceLocalSlot, cleanupLocalSlots } from "./slots.ts"
import { readLocalApproval, retainLocalApproval } from "./claims.ts"
import { loadPlan, snapshotPlan } from "../lifecycle/plans.ts"
import { fingerprint } from "../../internal/identity.ts"
import { stateIO } from "../storage.ts"
import { localPaths, type LocalPaths } from "./layout.ts"

export class LocalInstallation extends Context.Service<LocalInstallation, {
  readonly observe: (target: Target) => Effect.Effect<Observation, StateUnavailable>
  readonly execute: (plan: ReadyPlan) => Effect.Effect<void, StateUnavailable>
  readonly inspectRecovery: (original: ReadyPlan) => Effect.Effect<RepairInspection, StateUnavailable>
  readonly recover: (plan: RepairPlan) => Effect.Effect<void, StateUnavailable>
}>()("pluginsdk/LocalInstallation") {}

const Captures = Schema.Struct({ live: Package.Observation, staged: Package.Observation, retired: Package.Observation })
const Capture = Schema.Struct({ observed: Captures, slots: Slot.Slots })
type Capture = typeof Capture.Type
type Role = keyof typeof Captures.Type
const sameCapture = Schema.toEquivalence(Capture)
const sameTree = Schema.toEquivalence(Package.Tree)
const sameObservation = Schema.toEquivalence(Observation)
const sameIdentity = Schema.toEquivalence(Identity)
const sameRepairSnapshot = Schema.toEquivalence(RepairSnapshot)

const unavailable = (target: Target, detail: string): StateUnavailable =>
  new StateUnavailable({ key: target.key, cause: new Error(detail) })

const localPlan = Effect.fn("Installer.reviewLocalPlan")(function*(input: ReadyPlan) {
  const plan = yield* Effect.try({ try: () => snapshotPlan(input), catch: (cause) => new StateUnavailable({ key: input.target.key, cause }) })
  if (plan.target.destination.type !== "user" || plan.companions !== undefined || plan.project !== undefined) {
    return yield* unavailable(plan.target, "Local execution requires a user package without companion or project captures")
  }
  return plan
})

const operationFor = Effect.fn("Installer.reviewLocalOperation")(function*(plan: ReadyPlan): Effect.fn.Return<Slot.Operation, StateUnavailable> {
  const previous = Effect.suspend(() => {
    const { observed, receipt } = plan.before
    return receipt !== null && observed.type === "present" && observed.identity !== null &&
      sameIdentity(receipt.identity, observed.identity) && receipt.fingerprint === observed.fingerprint
      ? Effect.succeed(receipt.identity)
      : Effect.fail(unavailable(plan.target, "Local change has no matching before receipt"))
  })
  return yield* Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
    install: ({ bundle }) => plan.before.receipt === null && plan.before.observed.type === "absent"
      ? Effect.succeed<Slot.Operation>({ type: "install", next: { plan: plan.id, bundle: bundle.digest } })
      : Effect.fail(unavailable(plan.target, "Local installation requires an absent before state")),
    replace: ({ bundle }) => previous.pipe(Effect.flatMap((identity) => identity.plan !== plan.id
      ? Effect.succeed<Slot.Operation>({ type: "replace", previous: identity, next: { plan: plan.id, bundle: bundle.digest } })
      : Effect.fail(unavailable(plan.target, "Local replacement reuses the previous plan identity")))),
    remove: () => previous.pipe(Effect.map((identity): Slot.Operation => ({ type: "remove", previous: identity })))
  }))
})

export const makeLocalInstallation = (
  reader: Context.Service.Shape<typeof WindowsPackageReader>,
  mover: Context.Service.Shape<typeof WindowsDirectoryMover>,
  writer: Context.Service.Shape<typeof WindowsPayloadWriter>
): Context.Service.Shape<typeof LocalInstallation> => {
  const capture = Effect.fn("Installer.captureLocalSlots")(function*(target: Target, paths: LocalPaths): Effect.fn.Return<Capture, StateUnavailable> {
    const read = (path: PackagePath) => reader.observe(paths.home, path).pipe(
      Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause }))
    )
    const observed = { live: yield* read(paths.live), staged: yield* read(paths.staged), retired: yield* read(paths.retired) }
    const classify = (value: Package.Observation): Effect.Effect<Slot.Observation, StateUnavailable> => Match.value(value).pipe(
      Match.discriminatorsExhaustive("type")({
        absent: () => Effect.succeed<Slot.Observation>({ type: "absent" }),
        unknown: () => Effect.succeed<Slot.Observation>({ type: "unknown" }),
        tree: (tree) => readLocalApproval(target, tree.root).pipe(
          Effect.map((approval) => classifyLocalPackage({ approval, observed: tree }))
        )
      })
    )
    return { observed, slots: { live: yield* classify(observed.live), staged: yield* classify(observed.staged), retired: yield* classify(observed.retired) } }
  })

  const observe = Effect.fn("Installer.observeLocal")(function*(target: Target) {
    const paths = yield* Effect.try({ try: () => localPaths(target), catch: (cause) => new StateUnavailable({ key: target.key, cause }) })
    const captured = yield* capture(target, paths)
    return observeLocalSlots({ owner: target.key, slots: captured.slots })
  })

  const requireTree = (target: Target, value: Package.Observation): Effect.Effect<Package.Tree, StateUnavailable> => Match.value(value).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: () => Effect.fail(unavailable(target, "Local move source is absent")),
      unknown: () => Effect.fail(unavailable(target, "Local move source is unknown")),
      tree: (tree) => Effect.succeed(tree)
    })
  )
  const move = Effect.fn("Installer.moveLocalPackage")(function*(target: Target, paths: LocalPaths, from: PackagePath, to: PackagePath, tree: Package.Tree) {
    yield* mover.move({ root: paths.home, from, to, expected: tree.root }).pipe(
      Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause }))
    )
    yield* stateIO(target.key, async () => {
      await syncDirectory(win32.dirname(win32.join(paths.home, from)))
      await syncDirectory(win32.dirname(win32.join(paths.home, to)))
    })
  })
  const archiveRole = Effect.fn("Installer.archiveLocalRole")(function*(target: Target, paths: LocalPaths, reviewed: Capture, role: Role) {
    const tree = yield* requireTree(target, reviewed.observed[role])
    yield* mover.prepare(paths.home, paths.history).pipe(
      Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause }))
    )
    const current = yield* capture(target, paths)
    if (!sameCapture(reviewed, current)) return yield* unavailable(target, "Local package basis changed before archival")
    yield* move(target, paths, paths[role], PackagePath.make(`${paths.history}/${randomUUID()}`), tree)
  }, Effect.uninterruptible)

  const reviewRecovery = Effect.fn("Installer.reviewLocalRecovery")(function*(input: ReadyPlan) {
    const original = yield* localPlan(input)
    const target = original.target
    const paths = yield* Effect.try({ try: () => localPaths(target), catch: (cause) => new StateUnavailable({ key: target.key, cause }) })
    const operation = yield* operationFor(original)
    const captured = yield* capture(target, paths)
    const decision = cleanupLocalSlots({ owner: target.key, operation, slots: captured.slots })
    const recoverable = (residual: RepairSnapshot["residual"]) => Effect.try({
      try: (): RepairInspection => ({ type: "recoverable", state: { residual, fingerprint: fingerprint(`repair-local:${target.profile}`, { original: original.id, owner: target.key, operation, captured }) } }),
      catch: (cause) => new StateUnavailable({ key: target.key, cause })
    })
    const inspection = yield* Match.value(decision).pipe(Match.discriminatorsExhaustive("type")({
      blocked: ({ reason }) => Effect.succeed<RepairInspection>({ type: "blocked", reason: Match.value(reason).pipe(
        Match.when("unknown", (): Conflict => "unknown"),
        Match.when("unowned", (): Conflict => "unowned"),
        Match.whenOr("operation", "drift", (): Conflict => "drift"),
        Match.when("state", (): Conflict => "unknown"),
        Match.exhaustive
      ) }),
      complete: () => recoverable("absent"),
      step: () => recoverable("local")
    }))
    return { paths, operation, captured, inspection }
  })

  const inspectRecovery = Effect.fn("Installer.inspectLocalRecovery")(function*(original: ReadyPlan) {
    return (yield* reviewRecovery(original)).inspection
  })

  const recover = Effect.fn("Installer.recoverLocal")(function*(input: RepairPlan) {
    const plan = yield* Effect.try({ try: () => snapshotPlan(input), catch: (cause) => new StateUnavailable({ key: input.target.key, cause }) })
    const target = plan.target
    if (target.destination.type !== "user" || plan.companions !== undefined || plan.before.observed.residual !== "local") {
      return yield* unavailable(target, "Local recovery requires a reviewed local user-package cleanup")
    }
    const retained = yield* loadPlan(target, plan.before.interrupted)
    const original = yield* Match.value(retained).pipe(
      Match.when(null, () => Effect.fail(unavailable(target, "Local recovery has no retained interrupted plan"))),
      Match.discriminatorsExhaustive("type")({
        ready: (original) => Effect.succeed(original),
        repair_ready: () => Effect.fail(unavailable(target, "Local recovery requires the original installation plan"))
      })
    )
    const initial = yield* reviewRecovery(original)
    yield* Match.value(initial.inspection).pipe(Match.discriminatorsExhaustive("type")({
      blocked: ({ reason }) => Effect.fail(unavailable(target, `Local recovery is blocked: ${reason}`)),
      recoverable: ({ state }) => sameRepairSnapshot(state, plan.before.observed)
        ? Effect.void : Effect.fail(unavailable(target, "Local recovery basis differs from its review"))
    }))
    let reviewed = initial.captured
    for (let index = 0; index < 3; index += 1) {
      const decision = cleanupLocalSlots({ owner: target.key, operation: initial.operation, slots: reviewed.slots })
      yield* Match.value(decision).pipe(Match.discriminatorsExhaustive("type")({
        complete: () => Effect.void,
        blocked: ({ reason }) => Effect.fail(unavailable(target, `Local recovery is blocked: ${reason}`)),
        step: ({ role }) => Effect.gen(function*() {
          yield* archiveRole(target, initial.paths, reviewed, role)
          const after = yield* capture(target, initial.paths)
          const expected: Capture = { observed: { ...reviewed.observed, [role]: { type: "absent" } }, slots: { ...reviewed.slots, [role]: { type: "absent" } } }
          if (!sameCapture(expected, after)) return yield* unavailable(target, "Local package roles changed during recovery")
          reviewed = after
        })
      }))
    }
    const final = yield* capture(target, initial.paths)
    if (!sameCapture(reviewed, final)) return yield* unavailable(target, "Local package roles changed after recovery")
    yield* Match.value(cleanupLocalSlots({ owner: target.key, operation: initial.operation, slots: final.slots })).pipe(
      Match.discriminatorsExhaustive("type")({
        complete: () => Effect.void,
        blocked: ({ reason }) => Effect.fail(unavailable(target, `Local recovery is blocked: ${reason}`)),
        step: () => Effect.fail(unavailable(target, "Local recovery exceeded its archival bound"))
      })
    )
  })

  const execute = Effect.fn("Installer.executeLocal")(function*(input: ReadyPlan) {
    const plan = yield* localPlan(input)
    const target = plan.target
    const paths = yield* Effect.try({ try: () => localPaths(target), catch: (cause) => new StateUnavailable({ key: target.key, cause }) })
    const operation = yield* operationFor(plan)
    let reviewed = yield* capture(target, paths)
    if (!sameObservation(observeLocalSlots({ owner: target.key, slots: reviewed.slots }), plan.before.observed)) {
      return yield* unavailable(target, "Local package state differs from the reviewed plan")
    }

    const prepareDirectory = (path: PackagePath) => mover.prepare(paths.home, path).pipe(
      Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause })), Effect.asVoid
    )
    const recheck = Effect.fnUntraced(function*() {
      const current = yield* capture(target, paths)
      if (!sameCapture(reviewed, current)) return yield* unavailable(target, "Local package basis changed before mutation")
    })
    const moveRole = Effect.fnUntraced(function*(role: Role, destination: PackagePath) {
      const tree = yield* requireTree(target, reviewed.observed[role])
      yield* recheck()
      yield* move(target, paths, paths[role], destination, tree)
    })
    const prepare = Effect.fnUntraced(function*() {
      const bundle = yield* Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
        install: ({ bundle }) => Effect.succeed(bundle),
        replace: ({ bundle }) => Effect.succeed(bundle),
        remove: () => Effect.fail(unavailable(target, "Removal cannot prepare a package"))
      }))
      yield* prepareDirectory(PackagePath.make(posix.dirname(paths.live)))
      yield* prepareDirectory(paths.allocations)
      const allocation = PackagePath.make(`${paths.allocations}/${randomUUID()}`)
      yield* writer.allocate(win32.join(paths.home, allocation), bundle.files).pipe(
        Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause }))
      )
      const readAllocation = () => reader.observe(paths.home, allocation).pipe(
        Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause })), Effect.flatMap((value) => requireTree(target, value))
      )
      const tree = yield* readAllocation()
      yield* retainLocalApproval(plan, tree)
      const fresh = yield* readAllocation()
      if (!sameTree(tree, fresh)) return yield* unavailable(target, "Local allocation changed after approval")
      yield* recheck()
      yield* move(target, paths, allocation, paths.staged, fresh)
    })
    const archive = Effect.fnUntraced(function*() {
      yield* archiveRole(target, paths, reviewed, "retired")
    })
    const requireDecision = (captured: Capture, expected: Slot.Action | null) => {
      const decision = advanceLocalSlot({ owner: target.key, operation, slots: captured.slots })
      return Match.value(decision).pipe(Match.discriminatorsExhaustive("type")({
        complete: () => expected === null ? Effect.void : Effect.fail(unavailable(target, "Local operation completed before its expected step")),
        step: ({ action }) => action === expected ? Effect.void : Effect.fail(unavailable(target, "Local operation selected a different step")),
        blocked: ({ reason }) => Effect.fail(unavailable(target, `Local operation is blocked: ${reason}`))
      }))
    }
    const step = Effect.fnUntraced(function*(action: Slot.Action, next: Slot.Action | null) {
      yield* recheck()
      yield* requireDecision(reviewed, action)
      yield* Match.value(action).pipe(
        Match.when("prepare", prepare),
        Match.when("discard_stage", () => Effect.fail(unavailable(target, "Normal local execution cannot discard a residual stage"))),
        Match.when("retire", () => moveRole("live", paths.retired)),
        Match.when("publish", () => moveRole("staged", paths.live)),
        Match.when("discard_retired", archive),
        Match.exhaustive
      )
      const after = yield* capture(target, paths)
      yield* requireDecision(after, next)
      reviewed = after
    })

    yield* Match.value(operation).pipe(Match.discriminatorsExhaustive("type")({
      install: () => Effect.gen(function*() { yield* step("prepare", "publish"); yield* step("publish", null) }),
      replace: () => Effect.gen(function*() {
        yield* step("prepare", "retire")
        yield* step("retire", "publish")
        yield* step("publish", "discard_retired")
        yield* step("discard_retired", null)
      }),
      remove: () => Effect.gen(function*() { yield* step("retire", "discard_retired"); yield* step("discard_retired", null) })
    }))
  })

  return LocalInstallation.of({ observe, execute, inspectRecovery, recover })
}

export const LocalInstallationLive = Layer.effect(LocalInstallation, Effect.gen(function*() {
  return makeLocalInstallation(yield* WindowsPackageReader, yield* WindowsDirectoryMover, yield* WindowsPayloadWriter)
})).pipe(Layer.provide(Layer.mergeAll(WindowsPackageReaderLive, WindowsDirectoryMoverLive, WindowsPayloadWriterLive)))
