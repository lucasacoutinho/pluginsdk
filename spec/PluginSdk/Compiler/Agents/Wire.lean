import PluginSdk.Compiler.Agents.Model
import PluginSdk.Catalog.Wire

namespace PluginSdk.Compiler.Agents.Wire

open Lean (Json)
open WireJson

private instance (text : String) : Decidable (ValidSkillName text) := by
  unfold ValidSkillName
  infer_instance

private def readName (json : Json) : Except String Name := do
  let text ← json.getStr?
  if valid : ValidSkillName text then return ⟨text, valid⟩
  else throw "expected a portable agent name"

private def trimCharacter (character : Char) : Bool :=
  [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196,
    8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279].contains character.toNat

private def readText (json : Json) : Except String String := do
  let text ← Catalog.Wire.readNonempty json
  let characters := text.toList
  unless !characters.contains '\x00' && !characters.head?.any trimCharacter &&
      !characters.getLast?.any trimCharacter do
    throw "expected canonical agent text without NUL or outer whitespace"
  return text

private def readModel (json : Json) : Except String String := do
  let text ← readText json
  if text == "inherit" then throw "omit a model to select the host default"
  return text

private def readAgent (json : Json) : Except String Agent := do
  checkFields json ["name", "description", "prompt", "model", "shell"]
  let shell ← match ← (← json.getObjVal? "shell").getStr? with
    | "host_default" => pure Shell.hostDefault
    | "deny" => pure Shell.deny
    | value => throw s!"unknown shell policy: {value}"
  return ⟨← readName (← json.getObjVal? "name"),
    ← readText (← json.getObjVal? "description"), ← readText (← json.getObjVal? "prompt"),
    ← readOptional readModel (← json.getObjVal? "model"), shell⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["host", "plugin", "agents"]
  let host ← match ← (← json.getObjVal? "host").getStr? with
    | "claude_code" => pure Process.Host.claudeCode
    | "codex" => pure Process.Host.codex
    | value => throw s!"unsupported agent host: {value}"
  return ⟨host, ← Catalog.Wire.readPluginId (← json.getObjVal? "plugin"),
    ← (← (← json.getObjVal? "agents").getArr?).toList.mapM readAgent⟩

private def writeEntry (entry : Entry) : Json := Json.mkObj [
  ("name", .str entry.name.value), ("qualified", .str entry.qualified),
  ("path", .str entry.path.value), ("document", entry.document.value),
  ("prompt", writeOptional .str entry.prompt)
]

private def writeResult : Result → Json
  | .rendered entries => tagged "rendered" [("entries", .arr (entries.map writeEntry).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map fun issue =>
      match issue with | .duplicateAgent name => tagged "duplicate_agent" [("name", .str name.value)]).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render_agents" do throw "expected render_agents"
  let output := writeResult (model.render (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [("schema", 1), ("type", .str "render_agents"), ("output", output)]

end PluginSdk.Compiler.Agents.Wire
