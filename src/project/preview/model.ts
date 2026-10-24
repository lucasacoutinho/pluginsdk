import { Match } from "effect"
import type { Completion, CompletionInput, LocalStatus, Route, RouteInput } from "../../../contracts/PreviewRouting.ts"

export function routePreview(input: RouteInput): Route {
  const direct: Route = { type: "direct", client: input.client, desired: input.desired }
  return Match.value(input.client).pipe(
    Match.withReturnType<Route>(),
    Match.whenOr("claude_code", "codex", () => direct),
    Match.when("cursor", () => Match.value(input.desired).pipe(
      Match.withReturnType<Route>(),
      Match.when("absent", () => direct),
      Match.when("present", () => Match.value(input.provider).pipe(
        Match.withReturnType<Route>(),
        Match.when("none", () => direct),
        Match.when("qualified", () => ({ type: "inherited", client: "cursor", provider: "claude_code", desired: "absent" })),
        Match.when("unqualified", () => ({ type: "blocked", client: "cursor", reason: "import_unsupported" })),
        Match.exhaustive
      )),
      Match.exhaustive
    )),
    Match.exhaustive
  )
}

export function mayApplyInherited(provider: LocalStatus): boolean {
  return Match.value(provider).pipe(
    Match.whenOr("installed", "unchanged", () => true),
    Match.whenOr("missing", "removed", "not_applied", "uncertain", () => false),
    Match.exhaustive
  )
}

const localAbsenceConfirmed = (status: LocalStatus): boolean => Match.value(status).pipe(
  Match.whenOr("removed", "unchanged", () => true),
  Match.whenOr("missing", "installed", "not_applied", "uncertain", () => false),
  Match.exhaustive
)

export function finishPreview(input: CompletionInput): Completion {
  return Match.value(input).pipe(Match.discriminatorsExhaustive("type")({
    direct: ({ status }) => status,
    inherited: ({ provider, local }) => {
      if (mayApplyInherited(provider) && localAbsenceConfirmed(local)) return "inherited"
      return provider === "uncertain" || local === "uncertain" ? "uncertain" : "not_applied"
    }
  }))
}
