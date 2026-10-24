import PluginSdk.Compiler.Hooks.Binding.Model
import PluginSdk.Compiler.Process.Wire
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Hooks.Binding.Wire

open Lean (Json)
open WireJson

private def readOrdinal (json : Json) : Except String Nat := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= (0.0 : Float) && value <= (9007199254740991.0 : Float) &&
      value.toUInt64.toFloat == value do
    throw "expected a nonnegative safe integer hook ordinal"
  return value.toUInt64.toNat

private def writeOutput (output : Output) : Json :=
  match output.native with
  | .direct command args => tagged "direct" [
      ("path", .str output.path.value), ("command", .str command),
      ("args", .arr (args.map Json.str).toArray)]
  | .shell command => tagged "shell" [("path", .str output.path.value), ("command", .str command)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "bind_hook" do
    throw "expected a hook binding request"
  let inputJson ← request.getObjVal? "input"
  checkFields inputJson ["host", "ordinal"]
  let input : Input := ⟨← Process.Wire.readHost (← inputJson.getObjVal? "host"),
    ← readOrdinal (← inputJson.getObjVal? "ordinal")⟩
  return Json.mkObj [
    ("schema", 1), ("type", .str "bind_hook"), ("output", writeOutput (model.bind input))]

end PluginSdk.Compiler.Hooks.Binding.Wire
