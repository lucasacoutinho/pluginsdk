import PluginSdk.Compiler.Bundle.Model
import PluginSdk.Compiler.Bundle.Properties

namespace PluginSdk.Compiler.Bundle

@[simp] theorem mem_issues (input : Input) (issue : Issue) :
    issue ∈ issues input ↔ RequiredIssue input issue := by
  cases issue <;> simp [issues, rawIssues, RequiredIssue]

theorem valid_iff (input : Input) : model.check input = .valid ↔ issues input = [] := by
  change check input = .valid ↔ _
  unfold check
  split <;> simp_all

theorem issue_rejected (input : Input) (issue : Issue) : issue ∈ issues input ↔
    ∃ output, model.check input = .rejected output ∧ issue ∈ output.toList := by
  cases present : issues input with
  | nil => simp [model, check, present]
  | cons head tail => simp [model, check, present, NonemptyList.toList]

theorem rejected_list {input : Input} {output : NonemptyList Issue}
    (rejected : model.check input = .rejected output) : output.toList = issues input := by
  change check input = .rejected output at rejected
  unfold check at rejected
  split at rejected
  · cases rejected
  · rename_i head tail present
    cases rejected
    exact present.symm

theorem issueKey_injective {left right : Issue} (equal : IssueKey left = IssueKey right) : left = right := by
  cases left <;> cases right <;> simp_all [IssueKey]

namespace Proofs

theorem V1_digest_checked : Bundle.V1_digest_checked model := by
  intro input accepted
  have absent := (valid_iff input).mp accepted
  by_cases equal : input.digest = input.computed
  · exact equal
  · have required : RequiredIssue input .digestMismatch := equal
    have member := (mem_issues input .digestMismatch).mpr required
    simp [absent] at member

theorem V2_paths_canonical : Bundle.V2_paths_canonical model := by
  intro input accepted
  have absent := (valid_iff input).mp accepted
  constructor
  · by_cases sorted : (paths input).Pairwise Utf8Before
    · exact sorted
    · have member := (mem_issues input .noncanonicalOrder).mpr sorted
      simp [absent] at member
  · apply (no_pathCollisions _).mp
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro key member
    have required : RequiredIssue input (.pathCollision key) := (mem_pathCollisions ..).mp member
    have diagnostic := (mem_issues input (.pathCollision key)).mpr required
    simp [absent] at diagnostic

theorem V3_diagnostics_exact : Bundle.V3_diagnostics_exact model := by
  refine ⟨fun input issue => (mem_issues input issue).symm.trans (issue_rejected input issue), ?_⟩
  intro input output rejected
  rw [rejected_list rejected]
  apply List.pairwise_map.mpr
  apply ordered_strict
  exact (unique_nodup _).imp (fun different equal => different (issueKey_injective equal))

theorem V4_valid_bundle_accepted : Bundle.V4_valid_bundle_accepted model := by
  intro input digestEqual sorted unique
  apply (valid_iff input).mpr
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro issue member
  have required := (mem_issues input issue).mp member
  cases issue with
  | digestMismatch => exact required digestEqual
  | noncanonicalOrder => exact required sorted
  | pathCollision path =>
    obtain ⟨left, right, sublist, collision⟩ := required
    exact unique.forall_sublist sublist (collision_conflict collision)

end Proofs
end PluginSdk.Compiler.Bundle
