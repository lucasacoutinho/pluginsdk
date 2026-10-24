import { basename, join } from "node:path"
import { Effect, Exit, Match, Schema } from "effect"
import { PlanId, ReadyPlan, StateUnavailable, Target, type Observation } from "../../../contracts/Installer.ts"
import { validateBundle } from "../../compiler/package/native.ts"
import { fingerprint, planId } from "../../internal/identity.ts"
import { qualifiedBundle, qualifiedTarget, sameOwnedTarget } from "../target/profiles.ts"
import { InspectionUnavailable, nativeState, readInventory, sameJson, type NativeState } from "../hosts/state.ts"
import { Installed } from "./records.ts"
import { catalogFor } from "./recipe.ts"
import { readRecord } from "../storage.ts"
import { matchesTargetPath, targetPaths } from "../target/resolve.ts"
import { inspectCompanions, validateCompanionPlan } from "../companions/capture.ts"
import { readPayload } from "../payload/read.ts"
import { isCodexProject } from "../project/layout.ts"
import { observeProject } from "../project/inspect.ts"
import { isLocalTarget } from "../local/layout.ts"
import { LocalInstallation, LocalInstallationLive } from "../local/install.ts"

type Facts = Schema.JsonObject
const sameTarget = Schema.toEquivalence(Target)
const sameBundle = Schema.toEquivalence(Installed.fields.bundle)
const encodeTarget = Schema.encodeSync(Target)

const verifyCandidate = Effect.fnUntraced(function*(target: Target, native: Extract<NativeState, { type: "candidate" }>) {
  const paths = targetPaths(target)
  const id = Schema.decodeExit(PlanId)(basename(native.source))
  const source = join(paths.market, "payloads", basename(native.source))
  if (Exit.isFailure(id) || !matchesTargetPath(source, native.source)) return { identity: null, facts: native.facts, bundle: null }
  const marker = yield* readRecord(target.key, join(paths.markers, `${id.value}.json`), Installed)
  const plan = yield* readRecord(target.key, join(paths.plans, `${id.value}.json`), ReadyPlan)
  const facts: Facts = { ...native.facts, candidate: id.value, marker: marker === null ? null : { target: encodeTarget(marker.target), identity: marker.identity, bundle: marker.bundle.digest }, retainedPlan: plan?.id ?? null }
  if (marker === null || plan === null || plan.change.type === "remove") return { identity: null, facts, bundle: null }
  const approvedBundle = plan.change.bundle
  const binding = yield* Effect.try({
    try: () => {
      validateBundle(marker.bundle)
      validateCompanionPlan(plan)
      if (!qualifiedBundle(target, marker.bundle)) {
        throw new Error("Retained package requirements are unsupported by the current client contract")
      }
      return plan.id === id.value && planId(plan) === id.value && sameTarget(plan.target, marker.target) && sameOwnedTarget(target, marker.target) &&
        marker.identity.plan === id.value && marker.identity.bundle === marker.bundle.digest && sameBundle(approvedBundle, marker.bundle) &&
        sameJson(catalogFor(plan), native.facts.catalog ?? null)
    },
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  if (!binding) return { identity: null, facts, bundle: null }
  const staged = yield* readPayload(source, marker.bundle.files).pipe(Effect.mapError((cause) => new InspectionUnavailable({ cause })))
  const loaded = matchesTargetPath(source, native.loaded) ? staged
    : yield* readPayload(native.loaded, marker.bundle.files).pipe(Effect.mapError((cause) => new InspectionUnavailable({ cause })))
  const actual = { matches: staged.matches && loaded.matches, staged: staged.fingerprint, loaded: loaded.fingerprint }
  return { identity: actual.matches ? marker.identity : null, facts: { ...facts, payload: { staged: actual.staged, loaded: actual.loaded } }, bundle: actual.matches ? marker.bundle : null }
})

export const observe = Effect.fnUntraced(function*(target: Target) {
  if (!qualifiedTarget(target)) return { type: "unknown" } satisfies Observation
  return yield* Effect.gen(function*() {
    if (isLocalTarget(target)) return yield* LocalInstallation.use((local) => local.observe(target)).pipe(
      Effect.provide(LocalInstallationLive), Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause }))
    )
    if (isCodexProject(target)) return yield* observeProject(target)
    const native = yield* nativeState(target, yield* readInventory(target))
    return yield* Match.value(native).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => Effect.gen(function*() {
        const roles = yield* inspectCompanions(target, null)
        if (roles.unknown) return { type: "unknown" } satisfies Observation
        return roles.residual
          ? { type: "present", identity: null, fingerprint: fingerprint(target.profile, { companions: roles.facts }) } satisfies Observation
          : { type: "absent" } satisfies Observation
      }),
      unverified: (native) => Effect.gen(function*() {
        const roles = yield* inspectCompanions(target, null)
        if (roles.unknown) return { type: "unknown" } satisfies Observation
        return { type: "present", identity: null, fingerprint: fingerprint(target.profile, { ...native.facts, ...(roles.facts === null ? {} : { companions: roles.facts }) }) } satisfies Observation
      }),
      candidate: (native) => Effect.gen(function*() {
        const verified = yield* verifyCandidate(target, native)
        const roles = yield* inspectCompanions(target, verified.bundle)
        if (roles.unknown) return { type: "unknown" } satisfies Observation
        return {
          type: "present", identity: roles.matches ? verified.identity : null,
          fingerprint: fingerprint(target.profile, { ...verified.facts, ...(roles.facts === null ? {} : { companions: roles.facts }) })
        } satisfies Observation
      })
    }))
  }).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed<Observation>({ type: "unknown" }),
    HostUnavailable: () => Effect.succeed<Observation>({ type: "unknown" }),
    StateUnavailable: () => Effect.succeed<Observation>({ type: "unknown" })
  }))
})
