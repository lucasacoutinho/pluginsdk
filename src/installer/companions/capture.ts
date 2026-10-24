import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { AgentName } from "../../../contracts/Plugin.ts"
import { RoleName } from "../../../contracts/Agents.ts"
import { CompanionCapture, RoleFile, type ReviewResult } from "../../../contracts/Companions.ts"
import { Conflict, DestinationUnsupported, ReadyPlan, ReviewedPlan, StateUnavailable, Target, type HostUnavailable, type PlanChange, type PlanId, type Receipt, type Snapshot } from "../../../contracts/Installer.ts"
import type { Bundle } from "../../../contracts/Compiler.ts"
import { nativeLocations, validateBundle } from "../../compiler/package/native.ts"
import { fileDigest, planId } from "../../internal/identity.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { reviewCompanions } from "./model.ts"
import { InspectionUnavailable } from "../hosts/state.ts"
import { sameOwnedTarget } from "../target/profiles.ts"
import { isCodexProject } from "../project/layout.ts"
import { Installed, StoredState } from "../lifecycle/records.ts"
import { inspectRoles, roleFilePath, roleLimits } from "./files.ts"
import { readRecord } from "../storage.ts"
import { targetPaths } from "../target/resolve.ts"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"

const sameFiles = Schema.toEquivalence(Schema.Array(RoleFile))
const sameTarget = Schema.toEquivalence(Target)
const sameBundle = Schema.toEquivalence(Installed.fields.bundle)

export const bundleRoles = (bundle: Bundle): ReadonlyArray<RoleFile> => {
  const locations = nativeLocations(bundle.format)
  if (locations.host !== "codex" || !locations.agents) return []
  return bundle.files.filter((file) => file.path.startsWith("agents/")).map((file) => {
    const name = AgentName.make(file.path.slice("agents/".length, -".toml".length))
    return { name: RoleName.make(`${bundle.plugin}:${name}`), content: file.content }
  }).toSorted((left, right) => compareUtf8(left.name, right.name))
}

export const sameCapture = (left: CompanionCapture | undefined, right: CompanionCapture | undefined): boolean =>
  left === undefined || right === undefined
    ? left === right
    : sameFiles(left.previous, right.previous) && sameFiles(left.desired, right.desired)

export const companionNames = (capture: CompanionCapture): ReadonlyArray<RoleName> =>
  [...new Set([...capture.previous, ...capture.desired].map((file) => file.name))].toSorted(compareUtf8)

const validateCapture = (target: Target, capture: CompanionCapture): void => {
  if (capture.previous.length + capture.desired.length === 0) throw new Error("Empty companion captures must be omitted")
  if (companionNames(capture).length > roleLimits.files) throw new Error("Companion capture exceeds the role inventory limit")
  for (const files of [capture.previous, capture.desired]) {
    let previous: string | undefined
    for (const file of files) {
      roleFilePath(target, file.name)
      if (previous !== undefined && compareUtf8(previous, file.name) >= 0) throw new Error("Companion files must have distinct canonical names")
      if (file.content.length === 0 || file.content.length > roleLimits.bytes) throw new Error("Companion file size exceeds the role adapter limits")
      previous = file.name
    }
  }
}

export const validateCompanionPlan = (plan: ReviewedPlan): void => {
  if (isCodexProject(plan.target)) {
    if (plan.companions !== undefined) throw new Error("Codex project agents cannot use user companion capture")
    return
  }
  const desired = plan.type === "ready" && plan.change.type !== "remove" ? bundleRoles(plan.change.bundle) : []
  const capture = plan.companions
  if (capture === undefined) {
    if (desired.length > 0) throw new Error("Codex agent roles require a complete companion capture")
    if (plan.type === "repair_ready" && (plan.before.observed.residual === "companions" || plan.before.observed.residual === "marketplace_and_companions")) {
      throw new Error("Role cleanup requires captured owned files")
    }
    return
  }
  validateCapture(plan.target, capture)
  if (!sameFiles(capture.desired, desired)) throw new Error("Companion desired bytes differ from the complete bundle")
  if (plan.type === "ready") {
    if (plan.before.receipt === null && capture.previous.length > 0) throw new Error("A fresh installation cannot claim prior role ownership")
  } else {
    const hasRoles = plan.before.observed.residual === "companions" || plan.before.observed.residual === "marketplace_and_companions"
    if (!hasRoles || capture.previous.length === 0) throw new Error("Repair capture differs from its reviewed residual")
  }
}

const retainedPlan = Effect.fnUntraced(function*(target: Target, id: PlanId) {
  const plan = yield* readRecord(target.key, join(targetPaths(target).plans, `${id}.json`), ReviewedPlan)
  if (plan === null) return yield* new StateUnavailable({ key: target.key, cause: new Error("Companion ownership plan is missing") })
  yield* Effect.try({
    try: () => {
      if (plan.id !== id || planId(plan) !== id || !sameOwnedTarget(target, plan.target)) throw new Error("Companion ownership plan differs")
      validateCompanionPlan(plan)
      if (plan.type === "ready" && plan.change.type !== "remove") validateBundle(plan.change.bundle)
    },
    catch: (cause) => new StateUnavailable({ key: target.key, cause })
  })
  return plan
})

const ownedBundle = Effect.fnUntraced(function*(target: Target, receipt: Receipt) {
  const plan = yield* retainedPlan(target, receipt.identity.plan)
  const marker = yield* readRecord(target.key, join(targetPaths(target).markers, `${receipt.identity.plan}.json`), Installed)
  if (plan.type !== "ready" || plan.change.type === "remove" || marker === null) {
    return yield* new StateUnavailable({ key: target.key, cause: new Error("Retained role ownership is incomplete") })
  }
  const bundle = plan.change.bundle
  if (!sameTarget(plan.target, marker.target) || marker.identity.plan !== plan.id ||
      marker.identity.bundle !== receipt.identity.bundle || bundle.digest !== receipt.identity.bundle || !sameBundle(bundle, marker.bundle)) {
    return yield* new StateUnavailable({ key: target.key, cause: new Error("Retained role ownership binding differs") })
  }
  return bundle
})

export const captureCompanions = Effect.fnUntraced(function*(target: Target, before: Snapshot, change: PlanChange) {
  if (target.destination.host !== "codex" || isCodexProject(target)) return undefined
  const previous = before.receipt === null ? [] : bundleRoles(yield* ownedBundle(target, before.receipt))
  const desired = change.type === "remove" ? [] : bundleRoles(change.bundle)
  if (previous.length + desired.length === 0) return undefined
  const capture: CompanionCapture = { previous, desired }
  yield* Effect.try({
    try: () => validateCapture(target, capture),
    catch: () => new DestinationUnsupported({ destination: target.destination, detail: `Codex role reviews require canonical names, at most ${roleLimits.files} roles and ${roleLimits.bytes} bytes per file` })
  })
  return capture
})

export const reviewCapturedCompanions = Effect.fnUntraced(function*(target: Target, capture: CompanionCapture | undefined, inExecution = false) {
  if (capture === undefined) return { type: "ready", changes: [] } satisfies ReviewResult
  const inventory = yield* inspectRoles(target, companionNames(capture), inExecution)
  return reviewCompanions({
    previous: capture.previous.map((file) => ({ name: file.name, digest: fileDigest(file.content) })),
    desired: capture.desired.map((file) => ({ name: file.name, digest: fileDigest(file.content) })),
    observed: inventory.observed
  })
})

const trackedNames = Effect.fnUntraced(function*(target: Target) {
  const record = yield* readRecord(target.key, targetPaths(target).state, StoredState)
  if (record === null) return []
  return yield* Match.value(record).pipe(Match.discriminatorsExhaustive("type")({
    pending: ({ plan }) => Effect.succeed(plan.companions === undefined ? [] : companionNames(plan.companions)),
    repair_pending: ({ original, plan }) => Effect.succeed([
      ...(original.companions === undefined ? [] : companionNames(original.companions)),
      ...(plan.companions === undefined ? [] : companionNames(plan.companions))
    ]),
    idle: ({ journal }) => Match.value(journal).pipe(Match.discriminatorsExhaustive("type")({
      installed: ({ receipt }) => ownedBundle(target, receipt).pipe(Effect.map((bundle) => bundleRoles(bundle).map((file) => file.name))),
      not_applied: ({ state }) => state.receipt === null ? Effect.succeed([]) : ownedBundle(target, state.receipt).pipe(Effect.map((bundle) => bundleRoles(bundle).map((file) => file.name))),
      empty: ({ last }) => last === null ? Effect.succeed([]) : retainedPlan(target, last).pipe(Effect.map((plan) =>
        plan.companions === undefined ? [] : companionNames(plan.companions)))
    }))
  }))
})

export const inspectCompanions = Effect.fnUntraced(function*(target: Target, bundle: Bundle | null) {
  if (target.destination.host !== "codex" || isCodexProject(target)) return { matches: true, unknown: false, residual: false, facts: null }
  const expected = bundle === null ? [] : bundleRoles(bundle)
  const names = [...new Set([...(yield* trackedNames(target)), ...expected.map((file) => file.name)])].toSorted(compareUtf8)
  if (names.length === 0) return { matches: true, unknown: false, residual: false, facts: null }
  const inventory = yield* inspectRoles(target, names)
  const wanted = new Map(expected.map((file) => [file.name, fileDigest(file.content)]))
  const facts: Schema.JsonObject = Object.fromEntries(inventory.observed.filter((entry) => entry.observed.type !== "absent").map((entry) => {
    const fact = inventory.facts[entry.name]
    if (fact === undefined) throw new Error("Role inventory omitted its observation facts")
    return [entry.name, fact]
  }))
  const matches = inventory.observed.every(({ name, observed }) => {
    const digest = wanted.get(name)
    return digest === undefined ? observed.type === "absent" : observed.type === "file" && observed.digest === digest
  })
  return {
    matches,
    unknown: inventory.observed.some(({ observed }) => observed.type === "unknown"),
    residual: Object.keys(facts).length > 0,
    facts: Object.keys(facts).length === 0 ? null : facts
  }
})

const RepairRoles = Schema.Union([
  Schema.Struct({ type: Schema.Literal("recoverable"), capture: Schema.optionalKey(CompanionCapture), facts: Schema.NullOr(Schema.JsonObject) }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Conflict })
]).pipe(Schema.toTaggedUnion("type"))
type RepairRoles = typeof RepairRoles.Type

export const inspectRepairCompanions = Effect.fnUntraced(function*(target: Target, original: ReadyPlan): Effect.fn.Return<RepairRoles, HostUnavailable | InspectionUnavailable, ChildProcessSpawner> {
  const capture = original.companions
  if (capture === undefined) return { type: "recoverable", facts: null }
  const inventory = yield* inspectRoles(target, companionNames(capture))
  const known = [...capture.previous, ...capture.desired]
  const surviving: RoleFile[] = []
  for (const entry of inventory.observed) {
    const observed = entry.observed
    if (observed.type === "absent") continue
    if (observed.type === "unknown") return { type: "blocked", reason: "unknown" }
    if (observed.type === "conflict") return { type: "blocked", reason: "unowned" }
    const actual = inventory.files.find((file) => file.name === entry.name)
    if (actual === undefined) return yield* Effect.die(new Error("Role inventory omitted observed bytes"))
    const owned = known.find((file) => sameFiles([file], [actual]))
    if (owned === undefined) return { type: "blocked", reason: "drift" }
    surviving.push(owned)
  }
  const previous = surviving.toSorted((left, right) => compareUtf8(left.name, right.name))
  return { type: "recoverable", ...(previous.length === 0 ? {} : { capture: { previous, desired: [] } }), facts: inventory.facts }
})

export const companionConflict = (result: Extract<ReviewResult, { readonly type: "blocked" }>) =>
  Match.value(result.issues[0].reason).pipe(
    Match.when("unowned", () => "unowned" as const),
    Match.when("drift", () => "drift" as const),
    Match.whenOr("duplicate_previous", "duplicate_desired", "observation_unavailable", "unknown", () => "unknown" as const),
    Match.exhaustive
  )
