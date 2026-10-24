import PluginSdk.Compiler.Hooks.Binding.Types

namespace PluginSdk.Compiler.Hooks.Binding

def HB1_claude_binding_exact (model : Interface) : Prop :=
  ∀ ordinal, model.bind ⟨.claudeCode, ordinal⟩ = ⟨dataPath ordinal,
    .direct "node" ["${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs",
      "${CLAUDE_PLUGIN_ROOT}", (dataPath ordinal).value]⟩

def HB2_codex_binding_exact (model : Interface) : Prop :=
  ∀ ordinal, model.bind ⟨.codex, ordinal⟩ =
    ⟨dataPath ordinal, .shell (codexBootstrap ++ (dataPath ordinal).value)⟩

def HB3_data_paths_safe (model : Interface) : Prop :=
  ∀ input,
    (model.bind input).path.value = ".psdk/hooks/" ++ Nat.repr input.ordinal ++ ".json" ∧
    Contained (model.bind input).path.value ∧
    '$' ∉ (model.bind input).path.value.toList

def HB4_data_path_identity (model : Interface) : Prop :=
  ∀ left right,
    (model.bind left).path.value = (model.bind right).path.value ↔ left.ordinal = right.ordinal

end PluginSdk.Compiler.Hooks.Binding
