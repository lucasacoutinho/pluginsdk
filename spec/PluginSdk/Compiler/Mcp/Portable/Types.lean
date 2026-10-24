import PluginSdk.Compiler.Mcp.Types
import PluginSdk.Compiler.Process.Portable.Files

namespace PluginSdk.Compiler.Mcp.Portable

abbrev Input := Mcp.Input

abbrev ProcessData := Process.Portable.ProcessData

abbrev FilePlan := Process.Portable.FilePlan

def FilePlan.path : FilePlan → PackagePath := Process.Portable.FilePlan.path

structure Issue where
  server : String
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

end PluginSdk.Compiler.Mcp.Portable
