import PluginSdk.Installer.ProcessDirectory.Model
import PluginSdk.Compiler.Process.Wire
import PluginSdk.Compiler.Process.Portable.Runtime.Wire
import PluginSdk.WireJson

namespace PluginSdk.Installer.ProcessDirectory.Wire

open Lean (Json)
open WireJson

private def readInput (json : Json) : Except String Input := do
  checkFields json ["root", "script"]
  return ⟨(← Compiler.Process.Wire.readText (← json.getObjVal? "root")).value,
    ← Compiler.Process.Portable.Runtime.Wire.readScript (← json.getObjVal? "script")⟩

private def writeAdmission : Admission → Json
  | .accepted directory => tagged "accepted" [("directory", .str directory)]
  | .unresolved => tagged "unresolved"
  | .tooLong units => tagged "too_long" [("units", .num units)]

private def admitProcessDirectory (input : Json) : Except String Json := do
  let input ← readInput input
  return writeAdmission (model.admit input)

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "admit_process_directory" => admitProcessDirectory input
    | value => throw s!"unknown process directory operation: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Installer.ProcessDirectory.Wire
