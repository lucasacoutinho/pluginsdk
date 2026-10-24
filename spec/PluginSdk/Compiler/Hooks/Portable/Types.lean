import PluginSdk.Compiler.Hooks.Types
import PluginSdk.Compiler.Process.Portable.Files

namespace PluginSdk.Compiler.Hooks.Portable

abbrev Input := Hooks.Input
abbrev FilePlan := Process.Portable.FilePlan

structure Issue where
  hook : String
  reason : Process.Portable.Issue
  deriving DecidableEq

structure Output where
  document : Option JsonObject
  files : List FilePlan

inductive Result where
  | rendered (output : Output)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  render : Input → Result

end PluginSdk.Compiler.Hooks.Portable
