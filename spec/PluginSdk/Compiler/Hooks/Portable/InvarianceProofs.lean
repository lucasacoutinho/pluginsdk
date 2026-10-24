import PluginSdk.Compiler.Hooks.Portable.AdmissionProofs

namespace PluginSdk.Compiler.Hooks.Portable.Proofs

theorem PH5_enumeration_invariant : PH5_enumeration_invariant model := by
  intro left right leftNormalized _rightNormalized equivalent
  obtain ⟨hostEq, hooksPerm⟩ := equivalent
  have canonicalEq : Hooks.canonicalHooks left.hooks = Hooks.canonicalHooks right.hooks := by
    apply ordered_eq_of_perm (fun entry : String × Hooks.Hook => [entry.1]) hooksPerm
    intro a aMember b bMember keyEq
    exact key_injective_on Prod.fst (List.pairwise_map.mp leftNormalized.1) a aMember b
      (hooksPerm.symm.subset bMember) (List.singleton_inj.mp keyEq)
  have indexedEq : Hooks.indexedHooks left = Hooks.indexedHooks right := by
    simp [Hooks.indexedHooks, canonicalEq]
  have issuesEq : requiredIssues left = requiredIssues right := by
    apply ordered_unique_eq IssueKey (rawIssues left) (rawIssues right)
    · intro issue
      have canonicalMember (input : Input) :
          issue ∈ rawIssues input ↔ RequiredIssue input issue := by
        simpa only [requiredIssues, mem_ordered, mem_unique] using mem_requiredIssues input issue
      rw [canonicalMember left, canonicalMember right]
      constructor
      · rintro ⟨hook, member, required⟩
        exact ⟨hook, hooksPerm.subset member, by simpa [hostEq] using required⟩
      · rintro ⟨hook, member, required⟩
        exact ⟨hook, hooksPerm.symm.subset member, by simpa [hostEq] using required⟩
    · exact issueKey_injective
  have eventRowsEq : eventRows left = eventRows right := by
    simp [eventRows, Hooks.forEvent, indexedEq, hostEq]
  have emptyIff : left.hooks = [] ↔ right.hooks = [] := by
    constructor
    · intro empty
      exact List.perm_nil.mp (by simpa [empty] using hooksPerm.symm)
    · intro empty
      exact List.perm_nil.mp (by simpa [empty] using hooksPerm)
  have documentEq : document left = document right := by
    by_cases empty : left.hooks = []
    · simp [document, empty, emptyIff.mp empty]
    · have rightNonempty : right.hooks ≠ [] := fun absent => empty (emptyIff.mpr absent)
      simp [document, empty, rightNonempty, eventRowsEq]
  have filesEq : files left = files right := by
    by_cases empty : left.hooks = []
    · simp [files, empty, emptyIff.mp empty]
    · have rightNonempty : right.hooks ≠ [] := fun absent => empty (emptyIff.mpr absent)
      simp [files, empty, rightNonempty, entries, indexedEq]
  change render left = render right
  unfold render
  rw [issuesEq]
  cases problems : requiredIssues right with
  | nil => simp [documentEq, filesEq]
  | cons head tail => rfl

theorem PH7_empty_preserved : PH7_empty_preserved model := by
  intro host
  have absent : requiredIssues ⟨host, []⟩ = [] :=
    (issues_empty_iff _).mpr (by intro name hook member; cases member)
  simp [model, render, absent, document, files]

theorem PH8_process_preserved : PH8_process_preserved model := by
  intro input output accepted name hook member
  have representable := (PH1_exact_admission input).mp ⟨output, accepted⟩
  have absent := (representable name hook member).2
  constructor
  · simp [Process.Portable.Captures.compile, Process.Launcher.compile, absent]
  · intro root ambient
    exact Process.Portable.complete_process hook.plan root ambient

end PluginSdk.Compiler.Hooks.Portable.Proofs
