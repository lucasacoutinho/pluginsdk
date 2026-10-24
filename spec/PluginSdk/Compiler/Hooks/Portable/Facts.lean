import PluginSdk.Compiler.Hooks.Portable.Model

namespace PluginSdk.Compiler.Hooks.Portable.Facts

theorem rendered_components (input : Input) (output : Output)
    (accepted : model.render input = .rendered output) :
    requiredIssues input = [] ∧ output = ⟨document input, files input⟩ := by
  change render input = .rendered output at accepted
  cases problems : requiredIssues input with
  | nil =>
    simp [render, problems] at accepted
    exact ⟨rfl, accepted.symm⟩
  | cons head tail => simp [render, problems] at accepted

theorem rejected_issues (input : Input) (issues : NonemptyList Issue)
    (rejected : model.render input = .rejected issues) : issues.toList = requiredIssues input := by
  change render input = .rejected issues at rejected
  cases problems : requiredIssues input with
  | nil => simp [render, problems] at rejected
  | cons head tail =>
    simp [render, problems] at rejected
    subst issues
    rfl

end PluginSdk.Compiler.Hooks.Portable.Facts
