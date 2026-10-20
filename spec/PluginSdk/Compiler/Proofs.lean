import PluginSdk.Compiler.Enumeration

namespace PluginSdk.Compiler.Proofs

theorem B1_render_deterministic : Compiler.B1_render_deterministic model := by
  refine ⟨fun _ _ equal => congrArg model.render equal, ?_, ?_⟩
  · intro input output success
    obtain ⟨absent, equal⟩ := rendered_facts success
    rw [equal]
    have distinct : (rawFiles input).Pairwise (fun a b => fileKey a ≠ fileKey b) :=
      (rawFiles_unique absent).imp (fun noConflict sameKey => noConflict
        (Or.inl (congrArg asciiFold (List.singleton_inj.mp sameKey))))
    have sorted := ordered_strict fileKey (rawFiles input) distinct
    exact sorted.imp (fun less => (List.cons_lex_cons_iff.mp less).elim id (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))
  · intro input output failure
    rw [rejected_facts failure]
    apply List.pairwise_map.mpr
    apply ordered_strict
    exact (unique_nodup _).imp (fun different equal => different (issueKey_injective equal))

theorem B2_source_content_preserved : Compiler.B2_source_content_preserved model := by
  intro input output _ success path captured source
  obtain ⟨absent, equal⟩ := rendered_facts success
  rw [equal]
  let selected : RenderedFile → Bool := fun output => match output with
    | .copy destination file => decide (destination.value = path ∧ file = captured)
    | .json _ _ => false
  apply countP_one selected
  · apply (files_unique absent).imp
    intro left right noConflict ⟨leftMatch, rightMatch⟩
    cases left <;> cases right <;> simp only [selected, Bool.false_eq_true] at leftMatch rightMatch
    rename_i leftPath leftFile rightPath rightFile
    have leftEqual := (of_decide_eq_true leftMatch).1
    have rightEqual := (of_decide_eq_true rightMatch).1
    exact noConflict (Or.inl (congrArg asciiFold (leftEqual.trans rightEqual.symm)))
  · obtain ⟨destination, member, pathEqual⟩ := (source_copy_member ..).mp source
    refine ⟨.copy destination captured, (mem_ordered ..).mpr member, ?_⟩
    simp [selected, pathEqual]

theorem B3_output_paths_unique : Compiler.B3_output_paths_unique model := by
  refine ⟨?_, ?_, ?_⟩
  · intro input output success
    obtain ⟨absent, equal⟩ := rendered_facts success
    rw [equal]
    exact files_unique absent
  · intro input path _ collision
    exact issues_reject ((issues_path input path).mpr collision)
  · intro input output path _ failure member
    rw [rejected_facts failure] at member
    exact (issues_path input path).mp member

theorem rejection_accounts : RejectionAccountsForRequests model := by
  intro input server reason _ unsupported
  exact issues_reject ((issues_mcp input server reason).mpr unsupported)

theorem B4_requested_content_accounted_for : Compiler.B4_requested_content_accounted_for model := by
  refine ⟨?_, rejection_accounts, ?_⟩
  · intro input output normalized success
    rw [(rendered_facts success).2]
    refine ⟨⟨manifest input, (mem_ordered ..).mpr List.mem_cons_self, manifest_native input⟩, ?_, ?_, ?_⟩
    · intro present
      exact ⟨mcp input, (mem_ordered ..).mpr (mcp_member input present), mcp_native input normalized present⟩
    · intro path captured source
      obtain ⟨destination, member, equal⟩ := (source_copy_member ..).mp source
      exact ⟨destination, (mem_ordered ..).mpr member, equal⟩
    · intro file member
      have rawMember := (mem_ordered ..).mp member
      cases file with
      | copy path captured => exact (source_copy_member ..).mpr ⟨path, rawMember, rfl⟩
      | json path value => exact raw_json_native input normalized rawMember
  · intro input _ representable
    have absent : issues input = [] := by
      apply List.eq_nil_iff_forall_not_mem.mpr
      intro issue member
      cases issue with
      | pathCollision path =>
        obtain ⟨left, right, sublist, collision⟩ := (issues_path input path).mp member
        exact representable.1.forall_sublist sublist (collision_conflict collision)
      | unsupportedMcp server reason => exact representable.2 server reason ((issues_mcp ..).mp member)
    change ∃ output, render input = .rendered output
    simp only [render, absent]
    exact ⟨_, rfl⟩

theorem B5_enumeration_order_irrelevant : Compiler.B5_enumeration_order_irrelevant model := by
  intro left right normalized _ equivalent
  have issuesEqual := issues_equivalent normalized equivalent
  change render left = render right
  cases present : issues left with
  | nil =>
    have filesEqual := files_equivalent normalized equivalent present
    simp only [render, ← issuesEqual, present]
    apply congrArg RenderResult.rendered
    have injective : ∀ {a b : NonemptyList RenderedFile}, a.toList = b.toList → a = b := by
      intro a b equal
      cases a
      cases b
      cases equal
      rfl
    apply injective
    simpa only [nonempty_toList] using filesEqual
  | cons head tail => simp only [render, ← issuesEqual, present]

theorem B6_output_paths_contained : Compiler.B6_output_paths_contained model := by
  intro _ _ _ file _
  exact file.path.contained

theorem B7_copy_references_from_input : Compiler.B7_copy_references_from_input model := by
  intro input output _ success path captured member
  rw [(rendered_facts success).2] at member
  exact (source_copy_member ..).mpr ⟨path, (mem_ordered ..).mp member, rfl⟩

theorem B8_header_meaning_preserved : Compiler.B8_header_meaning_preserved model := by
  refine ⟨?_, rejection_accounts⟩
  intro input output normalized success server source header requested sourceMember headerMember
  obtain ⟨absent, equal⟩ := rendered_facts success
  rw [equal]
  have present : input.mcp ≠ [] := by intro empty; simp [empty] at sourceMember
  exact ⟨mcp input, (mem_ordered ..).mpr (mcp_member input present), mcp_native input normalized present,
    headerText requested, mcp_header input normalized sourceMember headerMember,
    header_meaning absent sourceMember headerMember⟩

end PluginSdk.Compiler.Proofs
