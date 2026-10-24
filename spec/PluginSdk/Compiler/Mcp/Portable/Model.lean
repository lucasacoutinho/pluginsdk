import PluginSdk.Compiler.Mcp.Portable.Properties

namespace PluginSdk.Compiler.Mcp.Portable

def render (input : Input) : Result :=
  match requiredIssues input with
  | [] => .rendered ⟨document input, files input⟩
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨render⟩

end PluginSdk.Compiler.Mcp.Portable
