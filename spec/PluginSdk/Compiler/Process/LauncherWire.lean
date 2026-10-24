import PluginSdk.Compiler.Process.Launcher
import PluginSdk.Compiler.Process.Wire

namespace PluginSdk.Compiler.Process.Launcher.Wire

open Lean (Json)
open WireJson

private def writeNative (native : Native) : Json := Json.mkObj [
  ("command", .str native.command),
  ("args", .arr (native.args.map Json.str).toArray),
  ("env", Json.mkObj (native.environment.map (fun binding => (binding.1, .str binding.2)))),
  ("cwd", native.cwd.elim .null Json.str)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render_launcher" do
    throw "expected a launcher request"
  let input ← request.getObjVal? "input"
  checkFields input ["host", "path", "plan"]
  let host ← Process.Wire.readHost (← input.getObjVal? "host")
  let path ← readPackagePath (← input.getObjVal? "path")
  if '$' ∈ path.value.toList then throw "native launcher paths cannot contain expansion syntax"
  let script := model.compile (← Process.Wire.readPlan (← input.getObjVal? "plan"))
  let output := Json.mkObj [
    ("script", .str (serialize script)),
    ("native", (model.native host path script).elim .null writeNative)]
  return Json.mkObj [("schema", 1), ("type", .str "render_launcher"), ("output", output)]

end PluginSdk.Compiler.Process.Launcher.Wire
