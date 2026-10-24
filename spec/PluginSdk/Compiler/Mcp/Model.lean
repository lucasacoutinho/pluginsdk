import PluginSdk.Compiler.Mcp.Types

namespace PluginSdk.Compiler.Mcp

def render (input : Input) : Result :=
  match failedIssues input with
  | [] => .rendered ⟨expectedDocument input, expectedGeneratedFiles input⟩
  | issue :: rest => .rejected ⟨issue, rest⟩

def model : Interface := ⟨render⟩

end PluginSdk.Compiler.Mcp
