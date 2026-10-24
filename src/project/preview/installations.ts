import { Effect, Match } from "effect"
import { Installer, type Intent, type PlanRequest, type Planning, type ReadyPlan } from "../../../contracts/Installer.ts"
import type { Directory } from "../../../contracts/Plugin.ts"
import { ProjectError, type LocalClient, type LocalPreviewStatus } from "../../../contracts/Project.ts"
import { finishPreview, mayApplyInherited } from "./model.ts"

const preflight = (planning: Planning): Effect.Effect<ReadyPlan | null, ProjectError> => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => Effect.succeed(plan),
    unchanged: () => Effect.succeed(null),
    repair_ready: () => Effect.fail(new ProjectError({ detail: "Preview needs installation recovery; see docs/usage.md" })),
    blocked: ({ target, reason }) => Effect.fail(new ProjectError({ detail: `Preview is blocked in ${target.destination.host}: ${reason}` })),
    pending: ({ plan }) => Effect.fail(new ProjectError({ detail: `Preview has an interrupted installation in ${plan.target.destination.host}; see docs/usage.md` }))
  })
)

export const prepareInstallation = Effect.fn("Project.preparePreviewInstallation")(function*(client: LocalClient, home: Directory, intent: Intent) {
  const request: PlanRequest = { destination: { type: "user", host: client, home }, intent }
  const planning = yield* Installer.use((installer) => installer.plan(request))
  return { client, home, request, plan: yield* preflight(planning) }
})

export type PreparedInstallation = Effect.Success<ReturnType<typeof prepareInstallation>>

export const applyInstallation = Effect.fn("Project.applyPreviewInstallation")(function*(installation: PreparedInstallation) {
  const plan = installation.plan
  if (plan === null) return "unchanged"
  const outcome = yield* Installer.use((installer) => installer.apply(plan))
  return Match.value(outcome).pipe(Match.withReturnType<LocalPreviewStatus>(), Match.discriminatorsExhaustive("type")({
    uncertain: () => "uncertain",
    completed: ({ result }) => Match.value(result).pipe(Match.withReturnType<LocalPreviewStatus>(), Match.discriminatorsExhaustive("type")({
      installed: () => "installed", removed: () => "removed", not_applied: () => "not_applied"
    }))
  }))
})

const confirmInstallation = Effect.fn("Project.confirmPreviewInstallation")(function*(request: PlanRequest) {
  const planning = yield* Installer.use((installer) => installer.plan(request))
  return Match.value(planning).pipe(Match.withReturnType<LocalPreviewStatus>(), Match.discriminatorsExhaustive("type")({
    unchanged: () => "unchanged",
    ready: () => "not_applied",
    blocked: ({ reason }) => Match.value(reason).pipe(Match.withReturnType<LocalPreviewStatus>(),
      Match.whenOr("unowned", "drift", () => "not_applied"),
      Match.when("unknown", () => "uncertain"), Match.exhaustive
    ),
    pending: () => "uncertain",
    repair_ready: () => "uncertain"
  }))
})

export const applyInherited = Effect.fn("Project.applyInheritedPreview")(function*<R>(
  provider: PlanRequest,
  providerStatus: LocalPreviewStatus,
  cleanup: PreparedInstallation,
  importsEnabled: Effect.Effect<boolean, ProjectError, R>
) {
  if (!mayApplyInherited(providerStatus)) return finishPreview({ type: "inherited", provider: providerStatus, local: "not_applied" })
  const confirmedProvider = yield* confirmInstallation(provider)
  if (!mayApplyInherited(confirmedProvider)) return finishPreview({ type: "inherited", provider: confirmedProvider, local: "not_applied" })
  if (!(yield* importsEnabled)) return finishPreview({ type: "inherited", provider: "not_applied", local: "not_applied" })
  const applied = yield* applyInstallation(cleanup)
  const completion = finishPreview({ type: "inherited", provider: confirmedProvider, local: applied })
  if (completion !== "inherited") return completion
  const providerAfter = yield* confirmInstallation(provider)
  const absenceAfter = yield* confirmInstallation(cleanup.request)
  return finishPreview({ type: "inherited", provider: (yield* importsEnabled) ? providerAfter : "not_applied", local: absenceAfter })
})
