import PluginSdk.Compiler.Mcp.Model
import PluginSdk.Compiler.Wire
import PluginSdk.Compiler.Process.Wire

namespace PluginSdk.Compiler.Mcp.Wire

open Lean (Json)
open WireJson

def readInput (json : Json) : Except String Input := do
  checkFields json ["format", "remote", "local"]
  let format ← match ← (← json.getObjVal? "format").getStr? with
    | "agent_plugins_v1" => pure Format.agentPluginsV1
    | "claude_code_v1" => pure Format.claudeCodeV1
    | "codex_plugin_v1" => pure Format.codexPluginV1
    | tag => throw s!"unsupported format: {tag}"
  let remote ← (← (← json.getObjVal? "remote").getObj?).toList.mapM fun (name, source) => do
    if name.isEmpty then throw "expected a nonempty MCP name"
    return (name, ← Compiler.Wire.readServer source)
  let locals ← (← (← json.getObjVal? "local").getObj?).toList.mapM fun (name, plan) => do
    if name.isEmpty then throw "expected a nonempty MCP name"
    if remote.any (fun entry => entry.1 == name) then throw "remote and local MCP names must be distinct"
    return (name, ← Process.Wire.readPlan plan)
  return ⟨format, remote, locals⟩

private def writeFile (file : GeneratedFile) : Json := Json.mkObj [
  ("path", .str file.path.value), ("content", .str file.content), ("executable", .bool file.executable)]

private def writeIssue : Issue → Json
  | .unsupportedLauncher server => tagged "unsupported_launcher" [("server", .str server)]

private def writeOutput : Result → Json
  | .rendered output => tagged "rendered" [
      ("document", output.document.elim .null (fun document => document.value)),
      ("files", .arr (output.files.map writeFile).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render_mcp" do throw "expected an MCP render request"
  let output := writeOutput (model.render (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [("schema", 1), ("type", .str "render_mcp"), ("output", output)]

end PluginSdk.Compiler.Mcp.Wire
