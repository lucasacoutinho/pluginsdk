import { Effect, Match, Schema } from "effect"
import { CompanionCapture } from "../../../contracts/Companions.ts"
import { StateUnavailable, type Observation, type ReadyPlan, type RepairResidual, type Target } from "../../../contracts/Installer.ts"
import { RepairInspection } from "../../../contracts/Repair.ts"
import { fingerprint } from "../../internal/identity.ts"
import { qualifiedTarget } from "../target/profiles.ts"
import { inspectIO, inventoryFacts, marketplaceMatches, nativeAbsent, readCatalog, readInventory, sameJson } from "../hosts/state.ts"
import { loadPlan } from "../lifecycle/plans.ts"
import { catalogFor } from "../lifecycle/recipe.ts"
import { inspectRepairCompanions } from "../companions/capture.ts"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import { isCodexProject } from "../project/layout.ts"
import { observeProject } from "../project/inspect.ts"
import { isLocalTarget } from "../local/layout.ts"
import { LocalInstallation, LocalInstallationLive } from "../local/install.ts"

const RepairDetails = Schema.Struct({ inspection: RepairInspection, companions: Schema.optionalKey(CompanionCapture) })
export type RepairDetails = typeof RepairDetails.Type

const catalogPlan = Effect.fnUntraced(function*(original: ReadyPlan) {
  if (original.change.type !== "remove") return original
  const identity = original.before.receipt?.identity
  if (identity === undefined) return null
  const retained = yield* loadPlan(original.target, identity.plan)
  if (retained === null || retained.type !== "ready" || retained.change.type === "remove" || retained.change.bundle.digest !== identity.bundle) return null
  return retained
})

export const inspectRepair = Effect.fnUntraced(function*(target: Target, original: ReadyPlan): Effect.fn.Return<RepairDetails, never, ChildProcessSpawner> {
  if (!qualifiedTarget(target)) return { inspection: { type: "blocked", reason: "unknown" } } satisfies RepairDetails
  return yield* Effect.gen(function*() {
    if (isLocalTarget(target)) return { inspection: yield* LocalInstallation.use((local) => local.inspectRecovery(original)).pipe(
      Effect.provide(LocalInstallationLive), Effect.mapError((cause) => new StateUnavailable({ key: target.key, cause }))
    ) } satisfies RepairDetails
    if (isCodexProject(target)) {
      const observed = yield* observeProject(target)
      return observed.type === "absent"
        ? { inspection: { type: "recoverable", state: { residual: "absent", fingerprint: fingerprint(`repair:${target.profile}`, { original: original.id, target: target.key }) } } } satisfies RepairDetails
        : { inspection: { type: "blocked", reason: "unknown" } } satisfies RepairDetails
    }
    const inventory = yield* readInventory(target)
    const result = Effect.fnUntraced(function*(marketplace: boolean, catalog: Schema.Json) {
      const roles = yield* inspectRepairCompanions(target, original)
      if (roles.type === "blocked") return { inspection: roles } satisfies RepairDetails
      const residual: RepairResidual = roles.capture === undefined
        ? marketplace ? "marketplace" : "absent"
        : marketplace ? "marketplace_and_companions" : "companions"
      return {
        inspection: {
          type: "recoverable",
          state: { residual, fingerprint: fingerprint(`repair:${target.profile}`, {
            original: original.id, ...inventoryFacts(inventory, catalog), ...(roles.facts === null ? {} : { companions: roles.facts })
          }) }
        },
        ...(roles.capture === undefined ? {} : { companions: roles.capture })
      } satisfies RepairDetails
    })
    if (nativeAbsent(inventory)) return yield* result(false, null)
    if (inventory.related.length > 0 || Object.keys(inventory.entries).length > 0 || inventory.consumers.length > 0 || Object.keys(inventory.configuredConsumers).length > 0) {
      return { inspection: { type: "blocked", reason: "unowned" } } satisfies RepairDetails
    }
    const ownedMarket = yield* inspectIO(async () => marketplaceMatches(target, inventory))
    if (!ownedMarket) return { inspection: { type: "blocked", reason: "unowned" } } satisfies RepairDetails
    const retained = yield* catalogPlan(original)
    if (retained === null) return { inspection: { type: "blocked", reason: "unknown" } } satisfies RepairDetails
    const catalog = yield* readCatalog(target)
    if (!sameJson(catalog, catalogFor(retained))) return { inspection: { type: "blocked", reason: "drift" } } satisfies RepairDetails
    return yield* result(true, catalog)
  }).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed<RepairDetails>({ inspection: { type: "blocked", reason: "unknown" } }),
    HostUnavailable: () => Effect.succeed<RepairDetails>({ inspection: { type: "blocked", reason: "unknown" } }),
    StateUnavailable: () => Effect.succeed<RepairDetails>({ inspection: { type: "blocked", reason: "unknown" } })
  }))
})

export const repairObservation = (inspection: RepairInspection): Observation => Match.value(inspection).pipe(
  Match.discriminatorsExhaustive("type")({
    blocked: (): Observation => ({ type: "unknown" }),
    recoverable: ({ state }) => Match.value(state.residual).pipe(
      Match.when("absent", (): Observation => ({ type: "absent" })),
      Match.whenOr("marketplace", "companions", "marketplace_and_companions", "local", (): Observation => ({ type: "present", identity: null, fingerprint: state.fingerprint })),
      Match.exhaustive
    )
  })
)
