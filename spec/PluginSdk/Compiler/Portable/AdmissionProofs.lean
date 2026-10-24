import PluginSdk.Compiler.Portable.Facts
import PluginSdk.Compiler.Mcp.Portable.Proofs
import PluginSdk.Compiler.Hooks.Portable.Proofs

namespace PluginSdk.Compiler.Portable.Proofs

theorem PC1_exact_admission : PC1_exact_admission model := by
  intro input
  constructor
  · rintro ⟨output, accepted⟩
    obtain ⟨mcp, hooks, mcpAccepted, hooksAccepted, _⟩ := (Facts.rendered_iff input output).mp accepted
    exact ⟨(Mcp.Portable.Proofs.PM1_exact_admission input.mcp).mp ⟨mcp, mcpAccepted⟩,
      (Hooks.Portable.Proofs.PH1_exact_admission (hookInput input)).mp ⟨hooks, hooksAccepted⟩⟩
  · rintro ⟨mcpValid, hooksValid⟩
    obtain ⟨mcp, mcpAccepted⟩ := (Mcp.Portable.Proofs.PM1_exact_admission input.mcp).mpr mcpValid
    obtain ⟨hooks, hooksAccepted⟩ := (Hooks.Portable.Proofs.PH1_exact_admission (hookInput input)).mpr hooksValid
    exact ⟨_, (Facts.rendered_iff input _).mpr ⟨mcp, hooks, mcpAccepted, hooksAccepted, rfl⟩⟩

theorem PC2_documents_preserved : PC2_documents_preserved model := by
  intro input output accepted
  obtain ⟨mcp, hooks, mcpAccepted, hooksAccepted, rfl⟩ := (Facts.rendered_iff input output).mp accepted
  exact ⟨mcp, hooks, mcpAccepted, hooksAccepted, rfl, rfl⟩

private theorem mcp_member_iff (input : Mcp.Input) (issue : Mcp.Portable.Issue) :
    issue ∈ Mcp.Portable.requiredIssues input ↔ Mcp.Portable.RequiredIssue input issue := by
  rw [(Mcp.Portable.Proofs.PM6_diagnostics).1 input issue]
  constructor
  · intro member
    cases result : Mcp.Portable.model.render input with
    | rendered output =>
      have absent := (Mcp.Portable.Facts.rendered_components input output result).1
      simp [absent] at member
    | rejected issues =>
      exact ⟨issues, rfl, by simpa [Mcp.Portable.Facts.rejected_issues input issues result] using member⟩
  · rintro ⟨issues, rejected, member⟩
    simpa [Mcp.Portable.Facts.rejected_issues input issues rejected] using member

private theorem mem_requiredIssues (input : Input) (issue : Issue) :
    issue ∈ requiredIssues input ↔ RequiredIssue input issue := by
  cases issue with
  | mcp reason =>
    simpa [requiredIssues, RequiredIssue, List.mem_map] using mcp_member_iff input.mcp reason
  | hook reason =>
    simpa [requiredIssues, RequiredIssue, List.mem_map] using
      Hooks.Portable.Proofs.mem_requiredIssues (hookInput input) reason

private theorem rendered_no_issues (input : Input) (output : Output)
    (accepted : model.render input = .rendered output) : requiredIssues input = [] := by
  obtain ⟨mcp, hooks, mcpAccepted, hooksAccepted, _⟩ := (Facts.rendered_iff input output).mp accepted
  have mcpEmpty := (Mcp.Portable.Facts.rendered_components input.mcp mcp mcpAccepted).1
  have hooksEmpty := (Hooks.Portable.Facts.rendered_components (hookInput input) hooks hooksAccepted).1
  simp [requiredIssues, mcpEmpty, hooksEmpty]

theorem rejected_issues (input : Input) (issues : NonemptyList Issue)
    (rejected : model.render input = .rejected issues) : issues.toList = requiredIssues input := by
  cases mcpResult : Mcp.Portable.model.render input.mcp with
  | rendered mcp =>
    have mcpEmpty := (Mcp.Portable.Facts.rendered_components input.mcp mcp mcpResult).1
    cases hooksResult : Hooks.Portable.model.render (hookInput input) with
    | rendered hooks => simp [model, render, combine, mcpResult, hooksResult] at rejected
    | rejected hooks =>
      have hooksSame := Hooks.Portable.Facts.rejected_issues (hookInput input) hooks hooksResult
      simp only [model, render, combine, mcpResult, hooksResult, Result.rejected.injEq] at rejected
      subst issues
      simp [requiredIssues, mcpEmpty, ← hooksSame, NonemptyList.toList]
  | rejected mcp =>
    have mcpSame := Mcp.Portable.Facts.rejected_issues input.mcp mcp mcpResult
    cases hooksResult : Hooks.Portable.model.render (hookInput input) with
    | rendered hooks =>
      have hooksEmpty := (Hooks.Portable.Facts.rendered_components (hookInput input) hooks hooksResult).1
      simp only [model, render, combine, mcpResult, hooksResult, Result.rejected.injEq] at rejected
      subst issues
      simp [requiredIssues, hooksEmpty, ← mcpSame, NonemptyList.toList]
    | rejected hooks =>
      have hooksSame := Hooks.Portable.Facts.rejected_issues (hookInput input) hooks hooksResult
      simp only [model, render, combine, mcpResult, hooksResult, Result.rejected.injEq] at rejected
      subst issues
      simp [requiredIssues, ← mcpSame, ← hooksSame, NonemptyList.toList]

private theorem rejected_member_iff (input : Input) (issue : Issue) :
    (∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList) ↔ issue ∈ requiredIssues input := by
  constructor
  · rintro ⟨issues, rejected, member⟩
    simpa [rejected_issues input issues rejected] using member
  · intro member
    cases result : model.render input with
    | rendered output => simp [rendered_no_issues input output result] at member
    | rejected issues =>
      exact ⟨issues, rfl, by simpa [rejected_issues input issues result] using member⟩

theorem PC7_diagnostics : PC7_diagnostics model := by
  exact ⟨fun input issue => (mem_requiredIssues input issue).symm.trans (rejected_member_iff input issue).symm,
    rejected_issues⟩

theorem PC6_enumeration_invariant : PC6_enumeration_invariant model := by
  intro left right leftNormalized rightNormalized equivalent
  have mcpEq := Mcp.Portable.Proofs.PM5_enumeration_invariant left.mcp right.mcp
    leftNormalized.1 rightNormalized.1 equivalent.1
  have hookEquivalent : Hooks.EnumerationEquivalent (hookInput left) (hookInput right) :=
    ⟨congrArg Mcp.hostFor equivalent.1.1, equivalent.2⟩
  have hooksEq := Hooks.Portable.Proofs.PH5_enumeration_invariant (hookInput left) (hookInput right)
    leftNormalized.2 rightNormalized.2 hookEquivalent
  simp [model, render, mcpEq, hooksEq]

end PluginSdk.Compiler.Portable.Proofs
