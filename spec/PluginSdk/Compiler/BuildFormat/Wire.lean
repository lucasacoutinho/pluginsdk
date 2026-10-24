import PluginSdk.Catalog.Wire
import PluginSdk.Compiler.BuildFormat.Model
import PluginSdk.Compiler.Process.Wire
import PluginSdk.WireJson

namespace PluginSdk.Compiler.BuildFormat.Wire

open Lean (Json)
open WireJson

private def readInput (json : Json) : Except String Input := do
  checkFields json ["client", "hasAgents", "hasHooks", "hasStdio"]
  return ⟨
    ← Process.Wire.readHost (← json.getObjVal? "client"),
    ← (← json.getObjVal? "hasAgents").getBool?,
    ← (← json.getObjVal? "hasHooks").getBool?,
    ← (← json.getObjVal? "hasStdio").getBool?
  ⟩

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "select_build_format" do
    throw "expected a build format selection request"
  let input ← readInput (← request.getObjVal? "input")
  let output := Catalog.Wire.writePackageFormat (model.select input)
  return Json.mkObj [
    ("schema", 1),
    ("type", .str "select_build_format"),
    ("output", .str output)
  ]

end PluginSdk.Compiler.BuildFormat.Wire
