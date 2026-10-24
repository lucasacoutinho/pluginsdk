import PluginSdk.Compiler.Portable.Properties

namespace PluginSdk.Compiler.Portable

def combine : Mcp.Portable.Result → Hooks.Portable.Result → Result
  | .rendered mcp, .rendered hooks => .rendered
      ⟨mcp.document, hooks.document, sharedFiles mcp.files hooks.files⟩
  | .rejected mcp, .rendered _ => .rejected ⟨.mcp mcp.head, mcp.tail.map Issue.mcp⟩
  | .rendered _, .rejected hooks => .rejected ⟨.hook hooks.head, hooks.tail.map Issue.hook⟩
  | .rejected mcp, .rejected hooks => .rejected
      ⟨.mcp mcp.head, mcp.tail.map Issue.mcp ++ hooks.toList.map Issue.hook⟩

def render (input : Input) : Result :=
  combine (Mcp.Portable.model.render input.mcp) (Hooks.Portable.model.render (hookInput input))

def model : Interface := ⟨render⟩

end PluginSdk.Compiler.Portable
