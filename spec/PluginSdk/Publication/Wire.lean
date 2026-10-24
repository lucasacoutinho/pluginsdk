import PluginSdk.Publication.Model
import PluginSdk.Catalog.Wire
import PluginSdk.WireJson

namespace PluginSdk.Publication.Wire

open Lean (Json)
open PluginSdk.WireJson

private def readPublication (json : Json) : Except String Publication := do
  checkFields json ["plugin", "version", "digest"]
  return ⟨← PluginSdk.Catalog.Wire.readPluginId (← json.getObjVal? "plugin"),
    ← PluginSdk.Catalog.Wire.readNonempty (← json.getObjVal? "version"),
    ← readHex (← json.getObjVal? "digest")⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["history", "desired"]
  return ⟨← (← (← json.getObjVal? "history").getArr?).toList.mapM readPublication,
    ← readPublication (← json.getObjVal? "desired")⟩

private def writePublication (entry : Publication) : Json := Json.mkObj [
  ("plugin", .str entry.plugin),
  ("version", .str entry.version),
  ("digest", .str entry.digest)
]

private def writeHistory (history : List Publication) : Json :=
  .arr (history.map writePublication).toArray

private def writeReason : Reason → String
  | .duplicate => "duplicate"
  | .versionConflict => "version_conflict"

private def writeResult : Result → Json
  | .published history => tagged "published" [("history", writeHistory history)]
  | .unchanged history => tagged "unchanged" [("history", writeHistory history)]
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "publish_release" do
    throw "expected publish_release"
  let output := writeResult (model.publish (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [
    ("schema", 1),
    ("type", .str "publish_release"),
    ("output", output)
  ]

end PluginSdk.Publication.Wire
