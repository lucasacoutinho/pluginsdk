import PluginSdk.Compiler.Hooks.Types

namespace PluginSdk.Compiler.Hooks

def render (input : Input) : Result :=
  match failedIssues input with
  | [] => .rendered ⟨expectedDocument input, expectedFiles input⟩
  | issue :: rest => .rejected ⟨issue, rest⟩

def model : Interface := ⟨render⟩

end PluginSdk.Compiler.Hooks
