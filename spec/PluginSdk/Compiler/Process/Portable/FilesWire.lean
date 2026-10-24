import PluginSdk.Compiler.Process.Portable.Files
import PluginSdk.Compiler.Process.Portable.Wire

namespace PluginSdk.Compiler.Process.Portable.Wire

open Lean (Json)
open WireJson

private def writeData (data : ProcessData) : Json := Json.mkObj [
  ("schema", 1),
  ("posix", .str data.posix.value),
  ("script", writeScript data.script)]

def writeFile : FilePlan → Json
  | .runtime path => tagged "runtime" [("path", .str path.value)]
  | .process path data => tagged "process" [("path", .str path.value), ("data", writeData data)]
  | .posix path content => tagged "posix" [("path", .str path.value), ("content", .str content)]

end PluginSdk.Compiler.Process.Portable.Wire
