import PluginSdk.Installer.CompanionFile.Model
import PluginSdk.Installer.ProjectFile.Wire

namespace PluginSdk.Installer.CompanionFile.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def writeReason : Reason → String
  | .mode => "mode"
  | .metadata .platform => "platform"
  | .metadata .representation => "representation"
  | .metadata .attributes => "attributes"
  | .metadata .streams => "streams"
  | .metadata .changed => "changed"

private def writeDecision : Decision → Json
  | .ready basis => tagged "ready" [("basis", ProjectFile.Wire.writeBasis basis)]
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

private def writeObservation : Companions.Observation → Json
  | .absent => tagged "absent"
  | .file digest => tagged "file" [("digest", .str digest.value)]
  | .unknown => tagged "unknown"
  | .conflict => tagged "conflict"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← readUInt32 (← request.getObjVal? "schema")
  unless schema == 1 do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "admit_companion_file" =>
      pure (writeDecision (model.admit (← ProjectFile.Wire.readInput input)))
    | "review_companion_file" =>
      pure (writeDecision (model.review (← ProjectFile.Wire.readReviewInput input)))
    | "observe_companion_file" =>
      pure (writeObservation (model.observe (← ProjectFile.Wire.readInput input)))
    | value => throw s!"unknown companion file request: {value}"
  return Json.mkObj [("schema", toJson (1 : Nat)), ("type", .str tag), ("output", output)]

end PluginSdk.Installer.CompanionFile.Wire
