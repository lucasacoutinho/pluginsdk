import PluginSdk.Compiler.Hooks.Portable.Model
import PluginSdk.Compiler.Hooks.Wire
import PluginSdk.Compiler.Process.Portable.FilesWire

namespace PluginSdk.Compiler.Hooks.Portable.Wire

open Lean (Json)
open WireJson

def writeIssue (issue : Issue) : Json := Json.mkObj [
  ("hook", .str issue.hook), ("reason", Process.Portable.Wire.writeIssue issue.reason)]

private def writeResult : Result → Json
  | .rendered output => tagged "rendered" [
      ("document", output.document.elim .null (fun document => document.value)),
      ("files", .arr (output.files.map Process.Portable.Wire.writeFile).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render_portable_hooks" do
    throw "expected a portable hook render request"
  let input ← Hooks.Wire.readInput (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "render_portable_hooks"),
    ("output", writeResult (model.render input))]

end PluginSdk.Compiler.Hooks.Portable.Wire
