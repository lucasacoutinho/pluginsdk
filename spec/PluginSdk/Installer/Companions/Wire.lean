import PluginSdk.Installer.Companions.Model
import PluginSdk.Catalog.Wire

namespace PluginSdk.Installer.Companions.Wire

open Lean (Json)
open WireJson

private def readName (json : Json) : Except String RoleName := do
  let text ← Catalog.Wire.readNonempty json
  if text.contains '\x00' then throw "role identity contains NUL"
  return ⟨text⟩

private def readFile (json : Json) : Except String FileIdentity := do
  checkFields json ["name", "digest"]
  return ⟨← readName (← json.getObjVal? "name"), ⟨← readHex (← json.getObjVal? "digest")⟩⟩

private def readObservation (json : Json) : Except String Observation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" => checkFields json ["type"]; return .absent
  | "file" => checkFields json ["type", "digest"]; return .file ⟨← readHex (← json.getObjVal? "digest")⟩
  | "conflict" => checkFields json ["type"]; return .conflict
  | "unknown" => checkFields json ["type"]; return .unknown
  | value => throw s!"unknown file observation: {value}"

private def readObservedFile (json : Json) : Except String ObservedFile := do
  checkFields json ["name", "observed"]
  return ⟨← readName (← json.getObjVal? "name"), ← readObservation (← json.getObjVal? "observed")⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["previous", "desired", "observed"]
  return ⟨← (← (← json.getObjVal? "previous").getArr?).toList.mapM readFile,
    ← (← (← json.getObjVal? "desired").getArr?).toList.mapM readFile,
    ← (← (← json.getObjVal? "observed").getArr?).toList.mapM readObservedFile⟩

private def writeChange : Change → Json
  | .create name after => tagged "create" [("name", .str name.value), ("after", .str after.value)]
  | .replace name before after => tagged "replace" [("name", .str name.value), ("before", .str before.value), ("after", .str after.value)]
  | .remove name before => tagged "remove" [("name", .str name.value), ("before", .str before.value)]
  | .keep name digest => tagged "keep" [("name", .str name.value), ("digest", .str digest.value)]

private def writeResult : Result → Json
  | .ready changes => tagged "ready" [("changes", .arr (changes.map writeChange).toArray)]
  | .blocked issues => tagged "blocked" [("issues", .arr (issues.toList.map fun issue =>
      Json.mkObj [("name", .str issue.name.value), ("reason", .str (ReasonName issue.reason))]).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "review_companions" do throw "expected review_companions"
  let output := writeResult (model.review (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [("schema", 1), ("type", .str "review_companions"), ("output", output)]

end PluginSdk.Installer.Companions.Wire
