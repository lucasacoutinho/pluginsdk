import { Match, Schema } from "effect"
import { PrincipalKey, ToolPermission } from "../contracts/Authorization.ts"
import type {
  AuthorizationDecision,
  AuthorizationInput,
  Duration,
  Instant,
  ReadyFacts
} from "../contracts/Authorization.ts"

const samePrincipal = Schema.toEquivalence(PrincipalKey)
const samePermission = Schema.toEquivalence(ToolPermission)

function fresh(observed: Instant, now: Instant, bound: Duration): boolean {
  return observed <= now && now - observed <= bound
}

function evaluateReady(input: AuthorizationInput, facts: ReadyFacts): AuthorizationDecision {
  const { invocation } = input
  if (facts.principal.organization !== invocation.organization ||
    facts.policy.organization !== invocation.organization ||
    !samePrincipal(facts.membership.principal, facts.principal)) {
    return { type: "denied", reason: "identity_mismatch" }
  }
  if (input.now >= facts.principal.expiresAt) return { type: "denied", reason: "token_expired" }
  if (!fresh(facts.policy.observedAt, input.now, input.bounds.policy)) return { type: "denied", reason: "policy_stale" }
  if (!fresh(facts.membership.observedAt, input.now, input.bounds.membership)) return { type: "denied", reason: "membership_stale" }

  const rules = facts.policy.tools.filter((rule) => samePermission(rule.permission, invocation.permission))
  if (rules.length === 0) return { type: "denied", reason: "unknown_tool" }
  if (!rules.every((rule) => rule.contract === invocation.contract)) return { type: "denied", reason: "contract_mismatch" }
  if (!rules.every((rule) => rule.scopes.every((scope) => facts.principal.scopes.includes(scope)))) {
    return { type: "denied", reason: "scope_missing" }
  }

  const granted = facts.policy.bindings.some((binding) =>
    binding.issuer === facts.principal.issuer &&
    facts.membership.groups.includes(binding.group) &&
    facts.policy.grants.some((grant) => grant.role === binding.role && samePermission(grant.permission, invocation.permission))
  )
  if (!granted) return { type: "denied", reason: "permission_missing" }

  return Match.value(input.applicationAccess).pipe(
    Match.when("unknown", (): AuthorizationDecision => ({ type: "denied", reason: "application_unknown" })),
    Match.when("denied", (): AuthorizationDecision => ({ type: "denied", reason: "application_denied" })),
    Match.when("allowed", (): AuthorizationDecision => ({
      type: "allowed", policy: facts.policy.revision, membership: facts.membership.revision
    })),
    Match.exhaustive
  )
}

export function authorize(input: AuthorizationInput): AuthorizationDecision {
  return Match.value(input.facts).pipe(
    Match.discriminatorsExhaustive("type")({
      unverified: (): AuthorizationDecision => ({ type: "denied", reason: "identity_unverified" }),
      unavailable: (facts): AuthorizationDecision => ({ type: "denied", reason: facts.reason }),
      ready: (facts): AuthorizationDecision => evaluateReady(input, facts)
    })
  )
}
