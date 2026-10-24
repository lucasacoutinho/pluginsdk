import PluginSdk.Compiler.Portable.Model
import PluginSdk.Compiler.Mcp.Portable.Facts
import PluginSdk.Compiler.Hooks.Portable.Facts

namespace PluginSdk.Compiler.Portable.Facts

theorem rendered_iff (input : Input) (output : Output) :
    model.render input = .rendered output ↔
      ∃ mcp hooks,
        Mcp.Portable.model.render input.mcp = .rendered mcp ∧
        Hooks.Portable.model.render (hookInput input) = .rendered hooks ∧
        output = ⟨mcp.document, hooks.document, sharedFiles mcp.files hooks.files⟩ := by
  cases mcpEq : Mcp.Portable.model.render input.mcp <;>
    cases hooksEq : Hooks.Portable.model.render (hookInput input) <;>
    simp [model, render, combine, mcpEq, hooksEq, eq_comm]

theorem rendered_files (input : Input) (output : Output)
    (accepted : model.render input = .rendered output) : output.files = expectedFiles input := by
  obtain ⟨mcp, hooks, mcpAccepted, hooksAccepted, rfl⟩ := (rendered_iff input output).mp accepted
  obtain ⟨_, rfl⟩ := Mcp.Portable.Facts.rendered_components input.mcp mcp mcpAccepted
  obtain ⟨_, rfl⟩ := Hooks.Portable.Facts.rendered_components (hookInput input) hooks hooksAccepted
  rfl

end PluginSdk.Compiler.Portable.Facts
