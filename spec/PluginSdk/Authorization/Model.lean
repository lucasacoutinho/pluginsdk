import PluginSdk.Authorization.Types

namespace PluginSdk.Authorization

def identityBound (facts : ReadyFacts) (invocation : Invocation) : Bool :=
  decide (facts.principal.key.organization = invocation.organization ∧
    facts.policy.organization = invocation.organization ∧
    facts.membership.principal = facts.principal.key)

def fresh (observed now : Instant) (bound : Duration) : Bool :=
  decide (observed.value ≤ now.value ∧ now.value - observed.value ≤ bound.value)

def knownTool (facts : ReadyFacts) (invocation : Invocation) : Bool :=
  facts.policy.tools.any fun rule => decide (rule.permission = invocation.permission)

def contractMatches (facts : ReadyFacts) (invocation : Invocation) : Bool :=
  facts.policy.tools.all fun rule =>
    if rule.permission = invocation.permission then decide (rule.contract = invocation.contract)
    else true

def scopesSatisfied (facts : ReadyFacts) (invocation : Invocation) : Bool :=
  facts.policy.tools.all fun rule =>
    if rule.permission = invocation.permission then
      rule.scopes.all fun scope => facts.principal.scopes.contains scope
    else true

def effectiveGrant (facts : ReadyFacts) (invocation : Invocation) : Bool :=
  facts.policy.bindings.any fun binding =>
    decide (binding.issuer = facts.principal.key.issuer) &&
    facts.membership.groups.contains binding.group &&
    facts.policy.grants.any fun grant =>
      decide (grant.role = binding.role ∧ grant.permission = invocation.permission)

def evaluateReady (input : Input) (facts : ReadyFacts) : Decision :=
  if !identityBound facts input.invocation then .denied .identityMismatch
  else if !(input.now.value < facts.principal.expiresAt.value) then .denied .tokenExpired
  else if !fresh facts.policy.observedAt input.now input.bounds.policy then .denied .policyStale
  else if !fresh facts.membership.observedAt input.now input.bounds.membership then .denied .membershipStale
  else if !knownTool facts input.invocation then .denied .unknownTool
  else if !contractMatches facts input.invocation then .denied .contractMismatch
  else if !scopesSatisfied facts input.invocation then .denied .scopeMissing
  else if !effectiveGrant facts input.invocation then .denied .permissionMissing
  else match input.applicationAccess with
    | .unknown => .denied .applicationUnknown
    | .denied => .denied .applicationDenied
    | .allowed => .allowed facts.policy.revision facts.membership.revision

def authorize (input : Input) : Decision :=
  match input.facts with
  | .unverified => .denied .identityUnverified
  | .unavailable .policy => .denied .policyUnavailable
  | .unavailable .membership => .denied .membershipUnavailable
  | .ready facts => evaluateReady input facts

def model : Interface := ⟨authorize⟩

end PluginSdk.Authorization
