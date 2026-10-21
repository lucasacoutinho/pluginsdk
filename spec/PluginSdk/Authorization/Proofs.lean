import PluginSdk.Authorization.Model
import PluginSdk.Authorization.Properties

namespace PluginSdk.Authorization.Proofs

private theorem identityBound_eq_true_iff (facts : ReadyFacts) (invocation : Invocation) :
    identityBound facts invocation = true ↔ IdentityBound facts invocation := by
  simp [identityBound, IdentityBound]

private theorem fresh_eq_true_iff (observed now : Instant) (bound : Duration) :
    fresh observed now bound = true ↔ Fresh observed now bound := by
  simp [fresh, Fresh]

private theorem knownTool_eq_true_iff (facts : ReadyFacts) (invocation : Invocation) :
    knownTool facts invocation = true ↔ KnownTool facts invocation := by
  simp [knownTool, KnownTool]

private theorem contractMatches_eq_true_iff (facts : ReadyFacts) (invocation : Invocation) :
    contractMatches facts invocation = true ↔ ContractMatches facts invocation := by
  simp [contractMatches, ContractMatches]
  constructor
  · intro correspondence rule member permission
    rcases correspondence rule member with mismatch | contract
    · exact False.elim (mismatch permission)
    · exact contract
  · intro correspondence rule member
    by_cases permission : rule.permission = invocation.permission
    · exact Or.inr (correspondence rule member permission)
    · exact Or.inl permission

private theorem scopesSatisfied_eq_true_iff (facts : ReadyFacts) (invocation : Invocation) :
    scopesSatisfied facts invocation = true ↔ ScopesSatisfied facts invocation := by
  simp [scopesSatisfied, ScopesSatisfied]
  constructor
  · intro correspondence rule member permission scope scopeMember
    rcases correspondence rule member with mismatch | scopes
    · exact False.elim (mismatch permission)
    · exact scopes scope scopeMember
  · intro correspondence rule member
    by_cases permission : rule.permission = invocation.permission
    · exact Or.inr (correspondence rule member permission)
    · exact Or.inl permission

private theorem effectiveGrant_eq_true_iff (facts : ReadyFacts) (invocation : Invocation) :
    effectiveGrant facts invocation = true ↔ EffectiveGrant facts invocation := by
  simp [effectiveGrant, EffectiveGrant]
  constructor
  · rintro ⟨binding, bindingMember, ⟨issuer, group⟩, grant, grantMember, role, permission⟩
    exact ⟨binding, bindingMember, issuer, group, grant, grantMember, role, permission⟩
  · rintro ⟨binding, bindingMember, issuer, group, grant, grantMember, role, permission⟩
    exact ⟨binding, bindingMember, ⟨issuer, group⟩, grant, grantMember, role, permission⟩

private theorem bool_eq_false_iff_not {value : Bool} {property : Prop}
    (reflects : value = true ↔ property) : value = false ↔ ¬ property := by
  constructor
  · intro falseValue holds
    have trueValue := reflects.mpr holds
    rw [falseValue] at trueValue
    cases trueValue
  · intro absent
    cases value with
    | false => rfl
    | true => exact False.elim (absent (reflects.mp rfl))

private theorem allows_denied_guard (condition : Prop) [Decidable condition]
    (reason : DenialReason) (decision : Decision) :
    Allows (if condition then .denied reason else decision) ↔
      ¬ condition ∧ Allows decision := by
  by_cases h : condition <;> simp [h, Allows]

private theorem evaluateReady_bool_iff (input : Input) (facts : ReadyFacts) :
    Allows (evaluateReady input facts) ↔
      identityBound facts input.invocation = true ∧
      input.now.value < facts.principal.expiresAt.value ∧
      fresh facts.policy.observedAt input.now input.bounds.policy = true ∧
      fresh facts.membership.observedAt input.now input.bounds.membership = true ∧
      knownTool facts input.invocation = true ∧
      contractMatches facts input.invocation = true ∧
      scopesSatisfied facts input.invocation = true ∧
      effectiveGrant facts input.invocation = true ∧
      input.applicationAccess = .allowed := by
  simp only [evaluateReady, allows_denied_guard]
  cases input.applicationAccess <;> simp [Allows]

private theorem evaluateReady_allows_iff (input : Input) (facts : ReadyFacts) :
    Allows (evaluateReady input facts) ↔
      IdentityBound facts input.invocation ∧
      EvidenceCurrent input facts ∧
      KnownTool facts input.invocation ∧
      ContractMatches facts input.invocation ∧
      ScopesSatisfied facts input.invocation ∧
      EffectiveGrant facts input.invocation ∧
      input.applicationAccess = .allowed := by
  simpa [identityBound_eq_true_iff, fresh_eq_true_iff, knownTool_eq_true_iff,
    contractMatches_eq_true_iff, scopesSatisfied_eq_true_iff, effectiveGrant_eq_true_iff,
    EvidenceCurrent, and_assoc] using evaluateReady_bool_iff input facts

private theorem model_allows_iff (input : Input) :
    Allows (model.authorize input) ↔
      ∃ facts : ReadyFacts,
        input.facts = .ready facts ∧
        IdentityBound facts input.invocation ∧
        EvidenceCurrent input facts ∧
        KnownTool facts input.invocation ∧
        ContractMatches facts input.invocation ∧
        ScopesSatisfied facts input.invocation ∧
        EffectiveGrant facts input.invocation ∧
        input.applicationAccess = .allowed := by
  cases input with
  | mk now bounds invocation facts applicationAccess =>
    cases facts with
    | unverified => simp [model, authorize, Allows]
    | unavailable reason => cases reason <;> simp [model, authorize, Allows]
    | ready facts =>
        simp [model, authorize, evaluateReady_allows_iff]

private theorem evaluateReady_revoked
    (input : Input) (facts : ReadyFacts)
    (identity : IdentityBound facts input.invocation)
    (evidence : EvidenceCurrent input facts)
    (known : KnownTool facts input.invocation)
    (contract : ContractMatches facts input.invocation)
    (scopes : ScopesSatisfied facts input.invocation)
    (noGrant : ¬ EffectiveGrant facts input.invocation) :
    evaluateReady input facts = .denied .permissionMissing := by
  rcases evidence with ⟨tokenCurrent, policyCurrent, membershipCurrent⟩
  have identityBool : identityBound facts input.invocation = true :=
    identityBound_eq_true_iff facts input.invocation |>.2 identity
  have policyFreshBool : fresh facts.policy.observedAt input.now input.bounds.policy = true :=
    fresh_eq_true_iff facts.policy.observedAt input.now input.bounds.policy |>.2 policyCurrent
  have membershipFreshBool :
      fresh facts.membership.observedAt input.now input.bounds.membership = true :=
    fresh_eq_true_iff facts.membership.observedAt input.now input.bounds.membership |>.2
      membershipCurrent
  have knownBool : knownTool facts input.invocation = true :=
    knownTool_eq_true_iff facts input.invocation |>.2 known
  have contractBool : contractMatches facts input.invocation = true :=
    contractMatches_eq_true_iff facts input.invocation |>.2 contract
  have scopesBool : scopesSatisfied facts input.invocation = true :=
    scopesSatisfied_eq_true_iff facts input.invocation |>.2 scopes
  have grantBool : effectiveGrant facts input.invocation = false :=
    bool_eq_false_iff_not (effectiveGrant_eq_true_iff facts input.invocation) |>.2 noGrant
  simp [evaluateReady, identityBool, tokenCurrent, policyFreshBool, membershipFreshBool,
    knownBool, contractBool, scopesBool, grantBool]

private theorem evaluateReady_complete
    (input : Input) (facts : ReadyFacts)
    (identity : IdentityBound facts input.invocation)
    (evidence : EvidenceCurrent input facts)
    (known : KnownTool facts input.invocation)
    (contract : ContractMatches facts input.invocation)
    (scopes : ScopesSatisfied facts input.invocation)
    (grant : EffectiveGrant facts input.invocation)
    (application : input.applicationAccess = .allowed) :
    evaluateReady input facts = .allowed facts.policy.revision facts.membership.revision := by
  rcases evidence with ⟨tokenCurrent, policyCurrent, membershipCurrent⟩
  have identityBool : identityBound facts input.invocation = true :=
    identityBound_eq_true_iff facts input.invocation |>.2 identity
  have policyFreshBool : fresh facts.policy.observedAt input.now input.bounds.policy = true :=
    fresh_eq_true_iff facts.policy.observedAt input.now input.bounds.policy |>.2 policyCurrent
  have membershipFreshBool :
      fresh facts.membership.observedAt input.now input.bounds.membership = true :=
    fresh_eq_true_iff facts.membership.observedAt input.now input.bounds.membership |>.2
      membershipCurrent
  have knownBool : knownTool facts input.invocation = true :=
    knownTool_eq_true_iff facts input.invocation |>.2 known
  have contractBool : contractMatches facts input.invocation = true :=
    contractMatches_eq_true_iff facts input.invocation |>.2 contract
  have scopesBool : scopesSatisfied facts input.invocation = true :=
    scopesSatisfied_eq_true_iff facts input.invocation |>.2 scopes
  have grantBool : effectiveGrant facts input.invocation = true :=
    effectiveGrant_eq_true_iff facts input.invocation |>.2 grant
  simp [evaluateReady, identityBool, tokenCurrent, policyFreshBool, membershipFreshBool,
    knownBool, contractBool, scopesBool, grantBool, application]

theorem U1_unavailable_never_allows : U1_unavailable_never_allows model := by
  intro input unavailable
  cases input with
  | mk now bounds invocation facts applicationAccess =>
    cases facts with
    | unverified => simp [model, authorize, Allows]
    | unavailable reason => cases reason <;> simp [model, authorize, Allows]
    | ready facts =>
        rcases unavailable with unverified | ⟨reason, unavailable⟩
        · simp at unverified
        · simp at unavailable

theorem U2_identity_is_bound : U2_identity_is_bound model := by
  intro input allowed
  obtain ⟨facts, ready, identity, _⟩ := (model_allows_iff input).mp allowed
  exact ⟨facts, ready, identity⟩

theorem U3_current_evidence_required : U3_current_evidence_required model := by
  intro input allowed
  obtain ⟨facts, ready, _identity, evidence, _⟩ := (model_allows_iff input).mp allowed
  exact ⟨facts, ready, evidence⟩

theorem U4_known_contract_required : U4_known_contract_required model := by
  intro input allowed
  obtain ⟨facts, ready, _identity, _evidence, known, contract, _⟩ :=
    (model_allows_iff input).mp allowed
  exact ⟨facts, ready, known, contract⟩

theorem U5_scopes_and_application_required : U5_scopes_and_application_required model := by
  intro input allowed
  obtain ⟨facts, ready, _identity, _evidence, _known, _contract, scopes, _grant, application⟩ :=
    (model_allows_iff input).mp allowed
  exact ⟨facts, ready, scopes, application⟩

theorem U6_effective_role_grant_required : U6_effective_role_grant_required model := by
  intro input allowed
  obtain ⟨facts, ready, _identity, _evidence, _known, _contract, _scopes, grant, _⟩ :=
    (model_allows_iff input).mp allowed
  exact ⟨facts, ready, grant⟩

theorem U7_complete_authorization_succeeds : U7_complete_authorization_succeeds model := by
  intro input facts eligible grant application
  rcases eligible with ⟨ready, identity, evidence, known, contract, scopes⟩
  change authorize input = .allowed facts.policy.revision facts.membership.revision
  simp only [authorize, ready]
  exact evaluateReady_complete input facts identity evidence known contract scopes grant application

theorem U8_revoked_grant_is_denied : U8_revoked_grant_is_denied model := by
  intro input facts eligible noGrant
  rcases eligible with ⟨ready, identity, evidence, known, contract, scopes⟩
  change authorize input = .denied .permissionMissing
  simp only [authorize, ready]
  exact evaluateReady_revoked input facts identity evidence known contract scopes noGrant

end PluginSdk.Authorization.Proofs
