import PluginSdk.Compiler.Assembly.Facts
import PluginSdk.Compiler.Facts

namespace PluginSdk.Compiler.Assembly

namespace Proofs

private theorem nonemptyList_toList_injective {α : Type} {left right : NonemptyList α}
    (equal : left.toList = right.toList) : left = right := by
  cases left with
  | mk leftHead leftTail =>
    cases right with
    | mk rightHead rightTail =>
      cases equal
      rfl

theorem A1_deterministic_canonical : A1_deterministic_canonical model := by
  refine ⟨?_, ?_, ?_⟩
  · intro left right equal
    exact congrArg model.assemble equal
  · intro input output success
    obtain ⟨absent, outputEqual⟩ := assembled_facts success
    rw [outputEqual]
    have sorted := ordered_strict assetKey (requestedAssets input) (requested_keys_distinct absent)
    have strictPaths : (files input).Pairwise PathBefore := by
      unfold files
      exact sorted.imp (fun less => by
        unfold assetKey PathBefore at *
        exact (List.cons_lex_cons_iff.mp less).elim id
          (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))
    exact strictPaths
  · intro input output failure
    rw [rejected_facts failure]
    apply List.pairwise_map.mpr
    apply ordered_strict
    exact (unique_nodup _).imp (fun different equal => different (issueKey_injective equal))

theorem A2_preserves_requested_files_once : A2_preserves_requested_files_once model := by
  intro input output success asset requested
  obtain ⟨absent, outputEqual⟩ := assembled_facts success
  rw [outputEqual]
  let selected : Asset → Bool := fun value => decide (value = asset)
  apply countP_one selected (files input)
  · apply (files_unique absent).imp
    intro left right noConflict ⟨leftSelected, rightSelected⟩
    have leftEqual := of_decide_eq_true leftSelected
    have rightEqual := of_decide_eq_true rightSelected
    have pathEqual : left.path.value = right.path.value :=
      congrArg (fun value : Asset => value.path.value) (leftEqual.trans rightEqual.symm)
    exact noConflict (Or.inl (congrArg asciiFold pathEqual))
  · refine ⟨asset, (mem_ordered assetKey (requestedAssets input) asset).mpr
      (by simpa [requestedAssets] using requested), ?_⟩
    simp [selected]

theorem A3_no_invented_files : A3_no_invented_files model := by
  intro input output success asset member
  obtain ⟨_, outputEqual⟩ := assembled_facts success
  rw [outputEqual] at member
  exact (mem_ordered assetKey (requestedAssets input) asset).mp member

theorem A4_contained_conflict_free : A4_contained_conflict_free model := by
  intro input output success
  obtain ⟨absent, outputEqual⟩ := assembled_facts success
  rw [outputEqual]
  exact ⟨fun asset _ => asset.path.contained, files_unique absent⟩

theorem A5_diagnostics_complete : A5_diagnostics_complete model := by
  intro input issue
  constructor
  · intro required
    exact issues_reject ((mem_issues input issue).mpr required)
  · rintro ⟨output, failure, member⟩
    rw [rejected_facts failure] at member
    exact (mem_issues input issue).mp member

theorem A6_permutation_invariant : A6_permutation_invariant model := by
  intro left right basePermutation assetPermutation
  have issueEqual := issues_permutation basePermutation assetPermutation
  have requestedPermutation : requestedAssets left |>.Perm (requestedAssets right) := by
    unfold requestedAssets
    exact basePermutation.append assetPermutation
  change assemble left = assemble right
  unfold assemble
  rw [← issueEqual]
  cases present : issues left with
  | nil =>
    have fileEqual : files left = files right := by
      apply ordered_eq_of_perm assetKey requestedPermutation
      intro a aMember b bMember keyEqual
      exact key_injective_on assetKey (requested_keys_distinct present) a aMember b
        (requestedPermutation.mem_iff.mpr bMember) keyEqual
    apply congrArg Result.assembled
    apply nonemptyList_toList_injective
    simpa only [nonempty_toList] using fileEqual
  | cons head tail =>
    rfl

private theorem files_nonempty (input : Input) : files input ≠ [] := by
  intro empty
  have sameLength := (ordered_perm assetKey (requestedAssets input)).length_eq
  have emptyOrdered : ordered assetKey (requestedAssets input) = [] := by simpa [files] using empty
  rw [emptyOrdered] at sameLength
  simp only [requestedAssets, NonemptyList.toList, List.length_append,
    List.length_cons, List.length_nil] at sameLength
  omega

theorem A7_valid_input_accepted : A7_valid_input_accepted model := by
  intro input noConflicts noReserved
  have absent : issues input = [] := by
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro issue member
    have required := (mem_issues input issue).mp member
    cases issue with
    | pathCollision path =>
      obtain ⟨left, right, sublist, collision⟩ := required
      exact noConflicts.forall_sublist sublist (collision_conflict collision)
    | reservedAsset path =>
      obtain ⟨asset, assetMember, pathEqual, reserved⟩ := required
      exact noReserved asset assetMember (by rw [pathEqual]; exact reserved)
  change ∃ output, assemble input = .assembled output
  refine ⟨nonempty (files input) (files_nonempty input), ?_⟩
  simp only [assemble, absent]

end Proofs
end PluginSdk.Compiler.Assembly
