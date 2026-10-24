import PluginSdk.WindowsPath.Model
import PluginSdk.FileRead.Wire
import PluginSdk.WireJson

namespace PluginSdk.WindowsPath.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readInput (json : Json) : Except String Input := do
  checkFields json ["path", "capacity"]
  let capacity ← json.getObjVal? "capacity"
  checkFields capacity ["maxComponentUnits", "remainingPathUnits"]
  return ⟨← readPackagePath (← json.getObjVal? "path"),
    ⟨← readUInt32 (← capacity.getObjVal? "maxComponentUnits"),
      ← readUInt32 (← capacity.getObjVal? "remainingPathUnits")⟩⟩

private def writeDecision : Decision → String
  | .accepted => "accepted"
  | .syntax => "syntax"
  | .device => "device"
  | .componentLimit => "component_limit"
  | .pathLimit => "path_limit"

private def readRootView (json : Json) : Except String RootView := do
  checkFields json ["root", "maxPathBufferUnits"]
  return ⟨← PluginSdk.FileRead.Wire.readFinalPath (← json.getObjVal? "root"),
    ← readUInt32 (← json.getObjVal? "maxPathBufferUnits")⟩

private def readRootInput (json : Json) : Except String RootInput := do
  checkFields json ["maxComponentUnits", "views"]
  let componentLimit ← readUInt32 (← json.getObjVal? "maxComponentUnits")
  let views ← (← (← json.getObjVal? "views").getArr?).toList.mapM readRootView
  match views with
  | head :: tail => return ⟨componentLimit, head, tail⟩
  | [] => throw "expected at least one native root view"

private def writeRootResolution : RootResolution → Json
  | .refused => tagged "refused"
  | .available capacity => tagged "available" [("capacity", Json.mkObj [
      ("maxComponentUnits", toJson capacity.maxComponentUnits),
      ("remainingPathUnits", toJson capacity.remainingPathUnits)])]

private def readNativePathInput (json : Json) : Except String NativePathInput := do
  checkFields json ["platform", "expected", "reported"]
  let platform ← (← json.getObjVal? "platform").getStr?
  if platform.isEmpty then throw "expected a nonempty runtime platform"
  return ⟨platform,
    ← PluginSdk.FileRead.Wire.readFinalPath (← json.getObjVal? "expected"),
    ← PluginSdk.FileRead.Wire.readFinalPath (← json.getObjVal? "reported")⟩

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).normalize == (1, 1, 1) do
    throw "unsupported schema version"
  let operation ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match operation with
    | "windows_path" => pure (.str (writeDecision (model.classify (← readInput input))))
    | "windows_root_capacity" => pure (writeRootResolution (model.rootCapacity (← readRootInput input)))
    | "native_path_match" => pure (toJson (model.matchesNativePath (← readNativePathInput input)))
    | value => throw s!"unknown Windows path operation: {value}"
  return Json.mkObj [("schema", 1), ("type", .str operation), ("output", output)]

end PluginSdk.WindowsPath.Wire
