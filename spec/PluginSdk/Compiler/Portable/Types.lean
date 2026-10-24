import PluginSdk.Compiler.Mcp.Portable.Types
import PluginSdk.Compiler.Hooks.Portable.Types

namespace PluginSdk.Compiler.Portable

structure Input where
  mcp : Mcp.Input
  hooks : List (String × Hooks.Hook)

def hookInput (input : Input) : Hooks.Input := ⟨Mcp.hostFor input.mcp.format, input.hooks⟩

abbrev FilePlan := Process.Portable.FilePlan

inductive Issue where
  | mcp (issue : Mcp.Portable.Issue)
  | hook (issue : Hooks.Portable.Issue)
  deriving DecidableEq

structure Output where
  mcpDocument : Option JsonObject
  hooksDocument : Option JsonObject
  files : List FilePlan

inductive Result where
  | rendered (output : Output)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  render : Input → Result

def Normalized (input : Input) : Prop := Mcp.Normalized input.mcp ∧ Hooks.Normalized (hookInput input)

def EnumerationEquivalent (left right : Input) : Prop :=
  Mcp.EnumerationEquivalent left.mcp right.mcp ∧ left.hooks.Perm right.hooks

end PluginSdk.Compiler.Portable
