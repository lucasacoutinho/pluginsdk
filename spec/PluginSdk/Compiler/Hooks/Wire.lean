import PluginSdk.Compiler.Hooks.Model
import PluginSdk.Compiler.Process.Wire

namespace PluginSdk.Compiler.Hooks.Wire

open Lean (Json)
open WireJson

private def readEvent (json : Json) : Except String Event := do
  match ← json.getStr? with
  | "SessionStart" => return .sessionStart
  | "UserPromptSubmit" => return .userPromptSubmit
  | tag => throw s!"unsupported hook event: {tag}"

private def readTimeout (json : Json) : Except String Timeout := do
  let number := (← json.getNum?).toFloat
  unless number.isFinite && number.toUInt64.toFloat == number do
    throw "expected integer hook timeout seconds"
  let value := number.toUInt64.toNat
  if valid : 1 ≤ value ∧ value ≤ 600 then return ⟨value, valid⟩
  else throw "hook timeout must be between 1 and 600 seconds"

private def readHook (json : Json) : Except String Hook := do
  checkFields json ["event", "plan", "timeout"]
  return ⟨← readEvent (← json.getObjVal? "event"),
    ← Process.Wire.readPlan (← json.getObjVal? "plan"),
    ← readTimeout (← json.getObjVal? "timeout")⟩

def readHooks (json : Json) : Except String (List (String × Hook)) := do
  (← json.getObj?).toList.mapM fun (name, hook) => do
    if name.isEmpty then throw "expected a nonempty hook name"
    return (name, ← readHook hook)

def readInput (json : Json) : Except String Input := do
  checkFields json ["host", "hooks"]
  return ⟨← Process.Wire.readHost (← json.getObjVal? "host"),
    ← readHooks (← json.getObjVal? "hooks")⟩

private def writeFile (file : GeneratedFile) : Json := Json.mkObj [
  ("path", .str file.path.value), ("content", .str file.content), ("executable", .bool file.executable)]

private def writeIssue : Issue → Json
  | .environmentReferenceUnsupported hook name => tagged "environment_reference_unsupported" [
      ("hook", .str hook), ("name", .str name.value)]

private def writeOutput : Result → Json
  | .rendered output => tagged "rendered" [
      ("document", output.document.elim .null (fun document => document.value)),
      ("files", .arr (output.files.map writeFile).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render_hooks" do
    throw "expected a hook render request"
  let output := writeOutput (model.render (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [("schema", 1), ("type", .str "render_hooks"), ("output", output)]

end PluginSdk.Compiler.Hooks.Wire
