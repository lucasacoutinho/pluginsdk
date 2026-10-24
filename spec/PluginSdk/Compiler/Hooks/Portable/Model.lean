import PluginSdk.Compiler.Hooks.Portable.Properties

namespace PluginSdk.Compiler.Hooks.Portable

def render (input : Input) : Result :=
  match requiredIssues input with
  | [] => .rendered ⟨document input, files input⟩
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨render⟩

end PluginSdk.Compiler.Hooks.Portable
