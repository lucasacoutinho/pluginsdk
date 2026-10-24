import PluginSdk.Compiler.Mcp.Types
import PluginSdk.Compiler.Wire
import PluginSdk.Compiler.Process.Wire

namespace PluginSdk.Compiler.Mcp.Wire

open Lean (Json)
open WireJson

def readInput (json : Json) : Except String Input := do
  checkFields json ["format", "remote", "local"]
  let format ← match ← (← json.getObjVal? "format").getStr? with
    | "claude_code" => pure Format.claudeCode
    | "codex" => pure Format.codex
    | tag => throw s!"unsupported format: {tag}"
  let remote ← (← (← json.getObjVal? "remote").getObj?).toList.mapM fun (name, source) => do
    if name.isEmpty then throw "expected a nonempty MCP name"
    return (name, ← Compiler.Wire.readServer source)
  let locals ← (← (← json.getObjVal? "local").getObj?).toList.mapM fun (name, plan) => do
    if name.isEmpty then throw "expected a nonempty MCP name"
    if remote.any (fun entry => entry.1 == name) then throw "remote and local MCP names must be distinct"
    return (name, ← Process.Wire.readPlan plan)
  return ⟨format, remote, locals⟩

end PluginSdk.Compiler.Mcp.Wire
