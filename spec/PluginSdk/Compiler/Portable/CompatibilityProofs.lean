import PluginSdk.Compiler.Portable.AdmissionProofs
import PluginSdk.Compiler.Portable.FileProofs

namespace PluginSdk.Compiler.Portable.Proofs

theorem PC8_empty_hooks_preserve_mcp : PC8_empty_hooks_preserve_mcp model := by
  intro input empty
  have hooksEmpty : Hooks.Portable.model.render (hookInput input) = .rendered ⟨none, []⟩ := by
    simpa [hookInput, empty] using Hooks.Portable.Proofs.PH7_empty_preserved (Mcp.hostFor input.mcp.format)
  constructor
  · intro mcp accepted
    have mcpFiles := congrArg Mcp.Portable.Output.files
      (Mcp.Portable.Facts.rendered_components input.mcp mcp accepted).2
    have onlyFiles : sharedFiles mcp.files [] = mcp.files := by
      rw [mcpFiles]
      exact mcp_only_files input
    simp [model, render, accepted, hooksEmpty, combine, onlyFiles]
  · intro issues rejected
    simp [model, render, rejected, hooksEmpty, combine]

end PluginSdk.Compiler.Portable.Proofs
