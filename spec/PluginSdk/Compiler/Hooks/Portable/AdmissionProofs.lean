import PluginSdk.Compiler.Hooks.Portable.Facts
import PluginSdk.Compiler.Process.Portable.Proofs

namespace PluginSdk.Compiler.Hooks.Portable.Proofs

private theorem reasons_empty_iff (host : Process.Host) (hook : Hooks.Hook) :
    reasons host hook = [] ↔
      Process.Portable.Representable (validationInput host hook) ∧
      Process.Launcher.sourceNames hook.plan = [] := by
  simp only [reasons, List.append_eq_nil_iff, List.map_eq_nil_iff,
    Process.Portable.Proofs.issues_empty_iff]

theorem issues_empty_iff (input : Input) : requiredIssues input = [] ↔ Representable input := by
  have rawEmpty : requiredIssues input = [] ↔ rawIssues input = [] := by
    simp only [List.eq_nil_iff_forall_not_mem, requiredIssues, mem_ordered, mem_unique]
  rw [rawEmpty, rawIssues, List.flatMap_eq_nil_iff]
  constructor
  · intro empty name hook member
    have absent := List.map_eq_nil_iff.mp (empty (name, hook) member)
    exact (reasons_empty_iff input.host hook).mp absent
  · intro representable item member
    rcases item with ⟨name, hook⟩
    apply List.map_eq_nil_iff.mpr
    exact (reasons_empty_iff input.host hook).mpr (representable name hook member)

theorem PH1_exact_admission : PH1_exact_admission model := by
  intro input
  constructor
  · rintro ⟨output, accepted⟩
    exact (issues_empty_iff input).mp (Facts.rendered_components input output accepted).1
  · intro representable
    have absent := (issues_empty_iff input).mpr representable
    exact ⟨⟨document input, files input⟩, by simp [model, render, absent]⟩

private theorem mem_reasons (host : Process.Host) (hook : Hooks.Hook)
    (reason : Process.Portable.Issue) : reason ∈ reasons host hook ↔ RequiredReason host hook reason := by
  simp only [reasons, List.mem_append, Process.Portable.Proofs.mem_issues, List.mem_map]
  constructor
  · intro member
    rcases member with required | ⟨source, member, rfl⟩
    · exact Or.inl required
    · exact Or.inr ⟨source, rfl, member⟩
  · intro required
    rcases required with required | ⟨source, rfl, member⟩
    · exact Or.inl required
    · exact Or.inr ⟨source, member, rfl⟩

private theorem mem_hook_map (name : String) (reasons : List Process.Portable.Issue) (issue : Issue) :
    issue ∈ reasons.map (Issue.mk name) ↔ issue.hook = name ∧ issue.reason ∈ reasons := by
  cases issue with
  | mk issueName issueReason =>
    simp only [List.mem_map]
    constructor
    · rintro ⟨reason, member, equal⟩
      cases equal
      exact ⟨rfl, member⟩
    · rintro ⟨rfl, member⟩
      exact ⟨issueReason, member, rfl⟩

theorem mem_requiredIssues (input : Input) (issue : Issue) :
    issue ∈ requiredIssues input ↔ RequiredIssue input issue := by
  simp only [requiredIssues, mem_ordered, mem_unique, rawIssues, List.mem_flatMap]
  constructor
  · rintro ⟨⟨name, hook⟩, member, mapped⟩
    obtain ⟨nameEq, reasonMember⟩ := (mem_hook_map name (reasons input.host hook) issue).mp mapped
    exact ⟨hook, by simpa [nameEq] using member, (mem_reasons input.host hook issue.reason).mp reasonMember⟩
  · rintro ⟨hook, member, required⟩
    refine ⟨(issue.hook, hook), member, ?_⟩
    exact (mem_hook_map issue.hook (reasons input.host hook) issue).mpr
      ⟨rfl, (mem_reasons input.host hook issue.reason).mpr required⟩

private theorem reasonKey_injective (left right : Process.Portable.Issue)
    (equal : Process.Portable.IssueKey left = Process.Portable.IssueKey right) : left = right := by
  cases left with
  | environmentCollision name =>
    cases right with
    | environmentCollision other =>
      exact congrArg Process.Portable.Issue.environmentCollision
        (by simpa [Process.Portable.IssueKey] using equal)
    | environmentReferenceUnsupported _ => simp [Process.Portable.IssueKey] at equal
  | environmentReferenceUnsupported name =>
    cases right with
    | environmentCollision _ => simp [Process.Portable.IssueKey] at equal
    | environmentReferenceUnsupported other =>
      exact congrArg Process.Portable.Issue.environmentReferenceUnsupported
        (Process.environmentName_eq_of_value_eq (by simpa [Process.Portable.IssueKey] using equal))

theorem issueKey_injective (left right : Issue) (equal : IssueKey left = IssueKey right) : left = right := by
  cases left with
  | mk name reason =>
    cases right with
    | mk otherName otherReason =>
      change name :: Process.Portable.IssueKey reason = otherName :: Process.Portable.IssueKey otherReason at equal
      obtain ⟨rfl, reasonsEq⟩ := List.cons.inj equal
      exact congrArg (Issue.mk name) (reasonKey_injective reason otherReason reasonsEq)

private theorem rejected_member_iff (input : Input) (issue : Issue) :
    (∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList) ↔
      issue ∈ requiredIssues input := by
  constructor
  · rintro ⟨issues, rejected, member⟩
    rw [Facts.rejected_issues input issues rejected] at member
    exact member
  · intro member
    cases problems : requiredIssues input with
    | nil => simp [problems] at member
    | cons head tail =>
      exact ⟨⟨head, tail⟩, by simp [model, render, problems],
        by simpa [NonemptyList.toList, problems] using member⟩

theorem PH6_diagnostics : PH6_diagnostics model := by
  constructor
  · intro input issue
    exact (mem_requiredIssues input issue).symm.trans (rejected_member_iff input issue).symm
  · intro input issues rejected
    have exactIssues := Facts.rejected_issues input issues rejected
    refine ⟨exactIssues, ?_⟩
    rw [exactIssues]
    apply ordered_strict
    exact (unique_nodup (rawIssues input)).imp
      (fun {left right} different equal => different (issueKey_injective left right equal))

end PluginSdk.Compiler.Hooks.Portable.Proofs
