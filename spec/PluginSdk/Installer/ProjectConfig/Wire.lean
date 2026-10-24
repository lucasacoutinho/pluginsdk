import PluginSdk.Installer.ProjectConfig.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.ProjectConfig.Wire

open Lean (Json)
open PluginSdk.WireJson

private def readSegment (json : Json) : Except String Segment := do
  match ← (← json.getObjVal? "type").getStr? with
  | "external" =>
    checkFields json ["type", "content"]
    return .external (← (← json.getObjVal? "content").getStr?)
  | "managed" =>
    checkFields json ["type", "key", "content"]
    return .managed (← readHex (← json.getObjVal? "key"))
      (← (← json.getObjVal? "content").getStr?)
  | tag => throw s!"unknown project-config segment type: {tag}"

private def readInput (json : Json) : Except String Input := do
  checkFields json ["key", "previous", "desired", "document"]
  return ⟨← readHex (← json.getObjVal? "key"),
    ← readOptional Json.getStr? (← json.getObjVal? "previous"),
    ← readOptional Json.getStr? (← json.getObjVal? "desired"),
    ← (← (← json.getObjVal? "document").getArr?).toList.mapM readSegment⟩

private def writeSegment : Segment → Json
  | .external content => tagged "external" [("content", .str content)]
  | .managed key content => tagged "managed" [("key", .str key), ("content", .str content)]

private def writeReason : Reason → String
  | .duplicate => "duplicate"
  | .unowned => "unowned"
  | .drift => "drift"

private def writeResult : Result → Json
  | .ready document => tagged "ready" [("document", .arr (document.map writeSegment).toArray)]
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "edit_project_config" do
    throw "expected edit_project_config"
  let output := writeResult (model.edit (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [("schema", 1), ("type", .str "edit_project_config"), ("output", output)]

end PluginSdk.Installer.ProjectConfig.Wire
