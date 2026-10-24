import PluginSdk.Compiler.Mcp.Portable.Facts
import PluginSdk.Compiler.Process.Portable.Proofs

namespace PluginSdk.Compiler.Mcp.Portable.Proofs

private theorem launcher_representable_path_irrelevant (input : Input) (entry : Entry) :
    Process.Portable.Representable (launcherInput input entry) ↔
      Process.Portable.Representable
        ⟨Mcp.hostFor input.format, dataPath 0, entry.plan⟩ := Iff.rfl

private theorem launcher_issues_path_irrelevant (input : Input) (entry : Entry) :
    Process.Portable.issues (launcherInput input entry) =
      Process.Portable.issues ⟨Mcp.hostFor input.format, dataPath 0, entry.plan⟩ := rfl

private theorem requiredIssues_empty_iff_entries_representable (input : Input) :
    requiredIssues input = [] ↔
      ∀ entry, entry ∈ entries input →
        Process.Portable.Representable (launcherInput input entry) := by
  rw [requiredIssues, List.flatMap_eq_nil_iff]
  constructor
  · intro empty entry member
    have noMapped := empty entry member
    have noIssues := List.map_eq_nil_iff.mp noMapped
    exact (Process.Portable.Proofs.issues_empty_iff (launcherInput input entry)).mp noIssues
  · intro representable entry member
    rw [List.map_eq_nil_iff]
    exact (Process.Portable.Proofs.issues_empty_iff (launcherInput input entry)).mpr
      (representable entry member)

private theorem representable_iff_entries (input : Input) :
    Representable input ↔
      ∀ entry, entry ∈ entries input →
        Process.Portable.Representable (launcherInput input entry) := by
  constructor
  · intro representable entry member
    have source := Facts.entries_source input entry member
    exact (launcher_representable_path_irrelevant input entry).mpr
      (representable entry.name entry.plan source)
  · intro representable name plan member
    obtain ⟨entry, entryMember, nameEq, planEq⟩ :=
      Facts.source_entry input name plan member
    subst name
    subst plan
    exact (launcher_representable_path_irrelevant input entry).mp
      (representable entry entryMember)

theorem PM1_exact_admission : PM1_exact_admission model := by
  intro input
  constructor
  · rintro ⟨output, accepted⟩
    have noIssues := (Facts.rendered_components input output accepted).1
    apply (representable_iff_entries input).mpr
    exact (requiredIssues_empty_iff_entries_representable input).mp noIssues
  · intro representable
    have entriesRepresentable := (representable_iff_entries input).mp representable
    have noIssues := (requiredIssues_empty_iff_entries_representable input).mpr
      entriesRepresentable
    refine ⟨⟨document input, files input⟩, ?_⟩
    change render input = .rendered ⟨document input, files input⟩
    simp [render, noIssues]

private theorem mem_issue_server_map (server : String) (reasons : List Process.Portable.Issue)
    (issue : Issue) :
    issue ∈ reasons.map (fun reason => Issue.mk server reason) ↔
      issue.server = server ∧ issue.reason ∈ reasons := by
  cases issue with
  | mk issueServer issueReason =>
    simp only [List.mem_map]
    constructor
    · rintro ⟨reason, member, equal⟩
      cases equal
      exact ⟨rfl, member⟩
    · rintro ⟨rfl, member⟩
      exact ⟨issueReason, member, rfl⟩

private theorem mem_requiredIssues (input : Input) (issue : Issue) :
    RequiredIssue input issue ↔ issue ∈ requiredIssues input := by
  constructor
  · rintro ⟨plan, sourceMember, required⟩
    obtain ⟨entry, entryMember, nameEq, planEq⟩ :=
      Facts.source_entry input issue.server plan sourceMember
    have requiredAtEntry :
        Process.Portable.RequiredIssue
          ⟨Mcp.hostFor input.format, dataPath 0, entry.plan⟩ issue.reason := by
      rw [planEq]
      exact required
    have reasonMember :=
      (Process.Portable.Proofs.mem_issues
        ⟨Mcp.hostFor input.format, dataPath 0, entry.plan⟩ issue.reason).mpr requiredAtEntry
    have reasonMemberActual :
        issue.reason ∈ Process.Portable.issues (launcherInput input entry) := by
      rw [launcher_issues_path_irrelevant input entry]
      exact reasonMember
    rw [requiredIssues]
    apply List.mem_flatMap.mpr
    refine ⟨entry, entryMember, ?_⟩
    exact (mem_issue_server_map entry.name
      (Process.Portable.issues (launcherInput input entry)) issue).mpr
        ⟨nameEq.symm, reasonMemberActual⟩
  · intro member
    rw [requiredIssues] at member
    obtain ⟨entry, entryMember, mappedMember⟩ := List.mem_flatMap.mp member
    obtain ⟨serverEq, reasonMember⟩ :=
      (mem_issue_server_map entry.name
        (Process.Portable.issues (launcherInput input entry)) issue).mp mappedMember
    have sourceMember := Facts.entries_source input entry entryMember
    have reasonMemberAtZero :
        issue.reason ∈ Process.Portable.issues
          ⟨Mcp.hostFor input.format, dataPath 0, entry.plan⟩ := by
      rw [← launcher_issues_path_irrelevant input entry]
      exact reasonMember
    have required :=
      (Process.Portable.Proofs.mem_issues
        ⟨Mcp.hostFor input.format, dataPath 0, entry.plan⟩ issue.reason).mp
          reasonMemberAtZero
    refine ⟨entry.plan, ?_, required⟩
    simpa [serverEq] using sourceMember

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
      refine ⟨⟨head, tail⟩, ?_, ?_⟩
      · simp [model, render, problems]
      · simpa [NonemptyList.toList, problems] using member

private theorem process_issues_ordered (input : Process.Portable.Input) :
    (Process.Portable.issues input).Pairwise
      (fun left right => KeyBefore (Process.Portable.IssueKey left)
        (Process.Portable.IssueKey right)) := by
  cases problems : Process.Portable.issues input with
  | nil => simp
  | cons head tail =>
    have rejected : Process.Portable.model.build input = .rejected ⟨head, tail⟩ := by
      simp [Process.Portable.model, Process.Portable.build, problems]
    exact (Process.Portable.Proofs.PL7_diagnostics).2 input ⟨head, tail⟩ rejected

private theorem entry_issues_ordered (input : Input) (entry : Entry) :
    (Process.Portable.issues (launcherInput input entry)).map
      (fun reason => Issue.mk entry.name reason) |>.Pairwise IssueBefore := by
  exact List.Pairwise.map
    (fun reason => Issue.mk entry.name reason)
    (fun _ _ before => Or.inr ⟨rfl, before⟩)
    (process_issues_ordered (launcherInput input entry))

private theorem requiredIssues_ordered (input : Input) (normalized : Mcp.Normalized input) :
    (requiredIssues input).Pairwise IssueBefore := by
  rw [requiredIssues, List.pairwise_flatMap]
  constructor
  · intro entry member
    exact entry_issues_ordered input entry
  · exact (Facts.entries_names_ordered input normalized).imp
      (fun {left right} namesBefore leftIssue leftMember rightIssue rightMember => by
        obtain ⟨leftServer, _⟩ :=
          (mem_issue_server_map left.name
            (Process.Portable.issues (launcherInput input left)) leftIssue).mp leftMember
        obtain ⟨rightServer, _⟩ :=
          (mem_issue_server_map right.name
            (Process.Portable.issues (launcherInput input right)) rightIssue).mp rightMember
        exact Or.inl (by simpa [leftServer, rightServer] using namesBefore))

theorem PM6_diagnostics : PM6_diagnostics model := by
  constructor
  · intro input issue
    exact (mem_requiredIssues input issue).trans (rejected_member_iff input issue).symm
  · intro input issues normalized rejected
    rw [Facts.rejected_issues input issues rejected]
    exact requiredIssues_ordered input normalized

end PluginSdk.Compiler.Mcp.Portable.Proofs
