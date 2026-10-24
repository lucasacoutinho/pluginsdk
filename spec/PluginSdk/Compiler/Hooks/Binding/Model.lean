import PluginSdk.Compiler.Hooks.Binding.Types

namespace PluginSdk.Compiler.Hooks.Binding

def bind (input : Input) : Output :=
  let path := dataPath input.ordinal
  match input.host with
  | .claudeCode => ⟨path, .direct "node" [
      "${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs", "${CLAUDE_PLUGIN_ROOT}", path.value]⟩
  | .codex => ⟨path, .shell (codexBootstrap ++ path.value)⟩

def model : Interface := ⟨bind⟩

end PluginSdk.Compiler.Hooks.Binding
