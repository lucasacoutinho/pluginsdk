import PluginSdk.Compiler.Portable.Model
import PluginSdk.Compiler.Mcp.Portable.Wire
import PluginSdk.Compiler.Hooks.Portable.Wire

namespace PluginSdk.Compiler.Portable.Wire

open Lean (Json)
open WireJson

private def readInput (json : Json) : Except String Input := do
  checkFields json ["mcp", "hooks"]
  return ⟨← Mcp.Wire.readInput (← json.getObjVal? "mcp"),
    ← Hooks.Wire.readHooks (← json.getObjVal? "hooks")⟩

private def writeIssue : Issue → Json
  | .mcp issue => tagged "mcp" [("issue", Mcp.Portable.Wire.writeIssue issue)]
  | .hook issue => tagged "hook" [("issue", Hooks.Portable.Wire.writeIssue issue)]

private def writeResult : Result → Json
  | .rendered output => tagged "rendered" [
      ("mcpDocument", output.mcpDocument.elim .null (fun document => document.value)),
      ("hooksDocument", output.hooksDocument.elim .null (fun document => document.value)),
      ("files", .arr (output.files.map Process.Portable.Wire.writeFile).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render_portable_features" do
    throw "expected a portable feature render request"
  let input ← readInput (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "render_portable_features"),
    ("output", writeResult (model.render input))]

end PluginSdk.Compiler.Portable.Wire
