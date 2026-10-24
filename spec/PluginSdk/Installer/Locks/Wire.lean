import PluginSdk.Installer.Locks.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.Locks.Wire

open Lean (Json)
open PluginSdk.WireJson

private def readDirectory (json : Json) : Except String String := do
  let directory ← json.getStr?
  unless directory != "" do throw "expected a nonempty directory"
  return directory

private def validateHost (json : Json) : Except String Unit := do
  match ← json.getStr? with
  | "claude_code" => pure ()
  | "codex" => pure ()
  | "cursor" => pure ()
  | "grok_bot" => pure ()
  | "muse" => pure ()
  | host => throw s!"unknown installation host: {host}"

private def readDestination (json : Json) : Except String Scope := do
  match ← (← json.getObjVal? "type").getStr? with
  | "user" =>
    checkFields json ["type", "host", "home"]
    validateHost (← json.getObjVal? "host")
    return .user (← readDirectory (← json.getObjVal? "home"))
  | "project" =>
    checkFields json ["type", "host", "home", "root"]
    validateHost (← json.getObjVal? "host")
    return .project (← readDirectory (← json.getObjVal? "home"))
      (← readDirectory (← json.getObjVal? "root"))
  | tag => throw s!"unknown installation destination type: {tag}"

private def writeSubject : Subject → Json
  | .home root => tagged "home" [("root", .str root)]
  | .project root => tagged "project" [("root", .str root)]

private def readSchema (json : Json) : Except String Unit := do
  unless (← readUInt32 json) == 1 do throw "unsupported schema version"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  readSchema (← request.getObjVal? "schema")
  unless (← (← request.getObjVal? "type").getStr?) == "installation_lock_subjects" do
    throw "expected installation_lock_subjects"
  let selected := model.subjects (← readDestination (← request.getObjVal? "input"))
  return Json.mkObj [
    ("schema", 1),
    ("type", .str "installation_lock_subjects"),
    ("output", .arr (selected.map writeSubject).toArray)
  ]

end PluginSdk.Installer.Locks.Wire
