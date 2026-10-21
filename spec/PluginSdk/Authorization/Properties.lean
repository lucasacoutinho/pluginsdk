import PluginSdk.Authorization.Rules

namespace PluginSdk.Authorization

def U1_unavailable_never_allows (model : Interface) : Prop :=
  ∀ input : Input,
    (input.facts = .unverified ∨ ∃ reason, input.facts = .unavailable reason) →
      ¬ Allows (model.authorize input)

def U2_identity_is_bound (model : Interface) : Prop :=
  ∀ input : Input, Allows (model.authorize input) →
    ∃ facts, input.facts = .ready facts ∧ IdentityBound facts input.invocation

def U3_current_evidence_required (model : Interface) : Prop :=
  ∀ input : Input, Allows (model.authorize input) →
    ∃ facts, input.facts = .ready facts ∧ EvidenceCurrent input facts

def U4_known_contract_required (model : Interface) : Prop :=
  ∀ input : Input, Allows (model.authorize input) →
    ∃ facts, input.facts = .ready facts ∧ KnownTool facts input.invocation ∧
      ContractMatches facts input.invocation

def U5_scopes_and_application_required (model : Interface) : Prop :=
  ∀ input : Input, Allows (model.authorize input) →
    ∃ facts, input.facts = .ready facts ∧ ScopesSatisfied facts input.invocation ∧
      input.applicationAccess = .allowed

def U6_effective_role_grant_required (model : Interface) : Prop :=
  ∀ input : Input, Allows (model.authorize input) →
    ∃ facts, input.facts = .ready facts ∧ EffectiveGrant facts input.invocation

def U7_complete_authorization_succeeds (model : Interface) : Prop :=
  ∀ input : Input, ∀ facts : ReadyFacts,
    Eligible input facts → EffectiveGrant facts input.invocation →
    input.applicationAccess = .allowed →
      model.authorize input = .allowed facts.policy.revision facts.membership.revision

def U8_revoked_grant_is_denied (model : Interface) : Prop :=
  ∀ input : Input, ∀ facts : ReadyFacts,
    Eligible input facts → ¬ EffectiveGrant facts input.invocation →
      model.authorize input = .denied .permissionMissing

end PluginSdk.Authorization
