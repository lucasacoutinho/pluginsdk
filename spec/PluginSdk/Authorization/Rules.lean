import PluginSdk.Authorization.Types

namespace PluginSdk.Authorization

def Allows : Decision → Prop
  | .allowed _ _ => True
  | .denied _ => False

def IdentityBound (facts : ReadyFacts) (invocation : Invocation) : Prop :=
  facts.principal.key.organization = invocation.organization ∧
  facts.policy.organization = invocation.organization ∧
  facts.membership.principal = facts.principal.key

def Fresh (observed now : Instant) (bound : Duration) : Prop :=
  observed.value ≤ now.value ∧ now.value - observed.value ≤ bound.value

def EvidenceCurrent (input : Input) (facts : ReadyFacts) : Prop :=
  input.now.value < facts.principal.expiresAt.value ∧
  Fresh facts.policy.observedAt input.now input.bounds.policy ∧
  Fresh facts.membership.observedAt input.now input.bounds.membership

def KnownTool (facts : ReadyFacts) (invocation : Invocation) : Prop :=
  ∃ rule ∈ facts.policy.tools, rule.permission = invocation.permission

def ContractMatches (facts : ReadyFacts) (invocation : Invocation) : Prop :=
  ∀ rule ∈ facts.policy.tools, rule.permission = invocation.permission →
    rule.contract = invocation.contract

def ScopesSatisfied (facts : ReadyFacts) (invocation : Invocation) : Prop :=
  ∀ rule ∈ facts.policy.tools, rule.permission = invocation.permission →
    ∀ scope ∈ rule.scopes, scope ∈ facts.principal.scopes

def EffectiveGrant (facts : ReadyFacts) (invocation : Invocation) : Prop :=
  ∃ binding ∈ facts.policy.bindings,
    binding.issuer = facts.principal.key.issuer ∧ binding.group ∈ facts.membership.groups ∧
    ∃ grant ∈ facts.policy.grants,
      grant.role = binding.role ∧ grant.permission = invocation.permission

def Eligible (input : Input) (facts : ReadyFacts) : Prop :=
  input.facts = .ready facts ∧
  IdentityBound facts input.invocation ∧ EvidenceCurrent input facts ∧
  KnownTool facts input.invocation ∧ ContractMatches facts input.invocation ∧
  ScopesSatisfied facts input.invocation

end PluginSdk.Authorization
