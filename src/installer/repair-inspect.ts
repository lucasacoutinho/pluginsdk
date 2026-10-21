import { Effect, Match } from "effect"
import type { Observation, ReadyPlan, Target } from "../../contracts/Installer.ts"
import type { RepairInspection } from "../../contracts/Repair.ts"
import { fingerprint } from "../internal/identity.ts"
import { profiles, supportedHost } from "./host.ts"
import { inspectIO, inventoryFacts, marketplaceMatches, nativeAbsent, readCatalog, readInventory, sameJson } from "./native-state.ts"
import { loadPlan } from "./plan.ts"
import { catalogFor } from "./recipe.ts"

const catalogPlan = Effect.fnUntraced(function*(original: ReadyPlan) {
  if (original.change.type !== "remove") return original
  const identity = original.before.receipt?.identity
  if (identity === undefined) return null
  const retained = yield* loadPlan(original.target, identity.plan)
  if (retained === null || retained.type !== "ready" || retained.change.type === "remove" || retained.change.bundle.digest !== identity.bundle) return null
  return retained
})

export const inspectRepair = Effect.fnUntraced(function*(target: Target, original: ReadyPlan) {
  const host = supportedHost(target.destination.host)
  if (host === null || target.profile !== profiles[host].revision || target.version !== profiles[host].version) return { type: "blocked", reason: "unknown" } satisfies RepairInspection
  return yield* Effect.gen(function*() {
    const inventory = yield* readInventory(target)
    if (nativeAbsent(inventory)) return {
      type: "recoverable",
      state: { residual: "absent", fingerprint: fingerprint(`repair:${target.profile}`, { original: original.id, ...inventoryFacts(inventory, null) }) }
    } satisfies RepairInspection
    if (inventory.related.length > 0 || Object.keys(inventory.entries).length > 0 || inventory.consumers.length > 0 || Object.keys(inventory.configuredConsumers).length > 0) {
      return { type: "blocked", reason: "unowned" } satisfies RepairInspection
    }
    const ownedMarket = yield* inspectIO(async () => marketplaceMatches(target, inventory))
    if (!ownedMarket) return { type: "blocked", reason: "unowned" } satisfies RepairInspection
    const retained = yield* catalogPlan(original)
    if (retained === null) return { type: "blocked", reason: "unknown" } satisfies RepairInspection
    const catalog = yield* readCatalog(target)
    if (!sameJson(catalog, catalogFor(retained))) return { type: "blocked", reason: "drift" } satisfies RepairInspection
    return {
      type: "recoverable",
      state: { residual: "marketplace", fingerprint: fingerprint(`repair:${target.profile}`, { original: original.id, ...inventoryFacts(inventory, catalog) }) }
    } satisfies RepairInspection
  }).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed<RepairInspection>({ type: "blocked", reason: "unknown" }),
    HostUnavailable: () => Effect.succeed<RepairInspection>({ type: "blocked", reason: "unknown" }),
    StateUnavailable: () => Effect.succeed<RepairInspection>({ type: "blocked", reason: "unknown" })
  }))
})

export const repairObservation = (inspection: RepairInspection): Observation => Match.value(inspection).pipe(
  Match.discriminatorsExhaustive("type")({
    blocked: (): Observation => ({ type: "unknown" }),
    recoverable: ({ state }) => Match.value(state.residual).pipe(
      Match.when("absent", (): Observation => ({ type: "absent" })),
      Match.when("marketplace", (): Observation => ({ type: "present", identity: null, fingerprint: state.fingerprint })),
      Match.exhaustive
    )
  })
)
