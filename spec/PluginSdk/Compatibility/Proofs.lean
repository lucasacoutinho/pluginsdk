import PluginSdk.Compatibility.Properties
import PluginSdk.Compatibility.Model

namespace PluginSdk.Compatibility.Proofs

open PluginSdk.Compatibility

private theorem selectCandidates_perm
    (left right : List NativeProfile)
    (permutation : left.Perm right) :
    selectCandidates left = selectCandidates right := by
  have lengthEqual := permutation.length_eq
  cases left with
  | nil =>
    cases right with
    | nil => rfl
    | cons head tail => simp at lengthEqual
  | cons leftHead leftTail =>
    cases leftTail with
    | nil =>
      cases right with
      | nil => simp at lengthEqual
      | cons rightHead rightTail =>
        cases rightTail with
        | nil =>
          have leftMember : leftHead ∈ [leftHead] := by simp
          have rightMember : leftHead ∈ [rightHead] :=
            permutation.mem_iff.mp leftMember
          have equalHeads : leftHead = rightHead := by simpa using rightMember
          simp [equalHeads]
        | cons second rest => simp at lengthEqual
    | cons leftSecond leftRest =>
      cases right with
      | nil => simp at lengthEqual
      | cons rightHead rightTail =>
        cases rightTail with
        | nil => simp at lengthEqual
        | cons second rest => rfl

private theorem uniqueRegistration_perm
    (left right : List NativeProfile)
    (identity : ProfileIdentity)
    (permutation : left.Perm right) :
    UniqueRegistration left identity ↔ UniqueRegistration right identity := by
  unfold UniqueRegistration Registrations
  have filtered := permutation.filter (fun profile => profile.identity == identity)
  rw [filtered.length_eq]

theorem N1_selected_is_sole_profile :
    PluginSdk.Compatibility.N1_selected_is_sole_profile model := by
  unfold PluginSdk.Compatibility.N1_selected_is_sole_profile
  intro input profile selected
  change selectCandidates (EligibleProfiles input) = .selected profile at selected
  cases candidates : EligibleProfiles input with
  | nil => simp [candidates, selectCandidates] at selected
  | cons first rest =>
    cases rest with
    | nil =>
      have equal : first = profile := by
        simpa [candidates, selectCandidates] using selected
      simp [equal]
    | cons second tail => simp [candidates, selectCandidates] at selected

theorem N2_sole_profile_selected :
    PluginSdk.Compatibility.N2_sole_profile_selected model := by
  unfold PluginSdk.Compatibility.N2_sole_profile_selected
  intro input profile candidates
  change selectCandidates (EligibleProfiles input) = .selected profile
  rw [candidates]
  rfl

theorem N3_blocking_exact :
    PluginSdk.Compatibility.N3_blocking_exact model := by
  unfold PluginSdk.Compatibility.N3_blocking_exact
  constructor
  · intro input
    cases candidates : EligibleProfiles input with
    | nil => simp [model, select, selectCandidates, candidates]
    | cons first rest =>
      cases rest with
      | nil => simp [model, select, selectCandidates, candidates]
      | cons second tail => simp [model, select, selectCandidates, candidates]
  · intro input
    cases candidates : EligibleProfiles input with
    | nil => simp [model, select, selectCandidates, candidates]
    | cons first rest =>
      cases rest with
      | nil => simp [model, select, selectCandidates, candidates]
      | cons second tail => simp [model, select, selectCandidates, candidates]

theorem N4_selection_enumeration_invariant :
    PluginSdk.Compatibility.N4_selection_enumeration_invariant model := by
  unfold PluginSdk.Compatibility.N4_selection_enumeration_invariant
  intro left right queriesEqual profilesPerm
  change selectCandidates (EligibleProfiles left) =
    selectCandidates (EligibleProfiles right)
  apply selectCandidates_perm
  unfold EligibleProfiles
  rw [← queriesEqual]
  exact profilesPerm.filter (fun profile => decide (Eligible left.query profile))

theorem N5_ownership_exact :
    PluginSdk.Compatibility.N5_ownership_exact model := by
  intro input
  change ownershipCompatible input = true ↔
    UniqueRegistration input.profiles input.current ∧
      UniqueRegistration input.profiles input.retained ∧
      SameAdapter input.current input.retained
  simp [ownershipCompatible, UniqueRegistration, SameAdapter, Bool.and_eq_true, and_assoc]

theorem N6_ownership_isolation :
    PluginSdk.Compatibility.N6_ownership_isolation model := by
  intro input compatible
  have exact := (N5_ownership_exact input).mp compatible
  exact exact.2.2

theorem N7_qualified_version_change_retains_ownership :
    PluginSdk.Compatibility.N7_qualified_version_change_retains_ownership model := by
  intro input currentUnique retainedUnique sameAdapter _versionChange
  exact (N5_ownership_exact input).mpr ⟨currentUnique, retainedUnique, sameAdapter⟩

theorem N8_ownership_enumeration_invariant :
    PluginSdk.Compatibility.N8_ownership_enumeration_invariant model := by
  unfold PluginSdk.Compatibility.N8_ownership_enumeration_invariant
  intro left right currentEqual retainedEqual profilesPerm
  have currentUnique := uniqueRegistration_perm left.profiles right.profiles
    left.current profilesPerm
  have retainedUnique := uniqueRegistration_perm left.profiles right.profiles
    left.retained profilesPerm
  have conditionsEqual :
      (UniqueRegistration left.profiles left.current ∧
        UniqueRegistration left.profiles left.retained ∧
        SameAdapter left.current left.retained) ↔
      (UniqueRegistration right.profiles right.current ∧
        UniqueRegistration right.profiles right.retained ∧
        SameAdapter right.current right.retained) := by
    rw [currentUnique, retainedUnique, currentEqual, retainedEqual]
  have outputsTrueEqual :
      model.ownershipCompatible left = true ↔
        model.ownershipCompatible right = true := by
    rw [N5_ownership_exact left, N5_ownership_exact right]
    exact conditionsEqual
  cases leftResult : model.ownershipCompatible left <;>
    cases rightResult : model.ownershipCompatible right <;>
    simp_all

end PluginSdk.Compatibility.Proofs
