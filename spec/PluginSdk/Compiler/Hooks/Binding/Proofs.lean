import PluginSdk.Compiler.Hooks.Binding.Model
import PluginSdk.Compiler.Hooks.Binding.Properties

namespace PluginSdk.Compiler.Hooks.Binding.Proofs

theorem HB1_claude_binding_exact : HB1_claude_binding_exact model := by
  intro ordinal
  rfl

theorem HB2_codex_binding_exact : HB2_codex_binding_exact model := by
  intro ordinal
  rfl

private theorem bind_path (input : Input) : (model.bind input).path = dataPath input.ordinal := by
  cases input with
  | mk host ordinal => cases host <;> rfl

theorem HB3_data_paths_safe : HB3_data_paths_safe model := by
  intro input
  rw [bind_path]
  exact ⟨by simpa only [dataPath, Generated.directory,
      show ".psdk/" ++ "hooks" ++ "/" = ".psdk/hooks/" from by decide]
      using Generated.dataPath_value .hooks input.ordinal,
    (dataPath input.ordinal).contained, Generated.dataPath_no_dollar .hooks input.ordinal⟩

theorem HB4_data_path_identity : HB4_data_path_identity model := by
  intro left right
  rw [bind_path, bind_path]
  constructor
  · exact Generated.dataPath_value_injective .hooks
  · intro equal
    rw [equal]

end PluginSdk.Compiler.Hooks.Binding.Proofs
