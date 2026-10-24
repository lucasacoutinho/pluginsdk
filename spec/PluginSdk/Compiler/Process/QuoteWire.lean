import PluginSdk.Compiler.Process.Quoting
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Process.Quoting.Wire

open Lean (Json)
open WireJson

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "quote_process_text" do
    throw "expected a process quoting request"
  let input ← request.getObjVal? "input"
  checkFields input ["text"]
  let text ← (← input.getObjVal? "text").getStr?
  if '\x00' ∈ text.toList then throw "process text cannot contain NUL"
  return Json.mkObj [
    ("schema", 1), ("type", .str "quote_process_text"),
    ("output", Json.mkObj [("quoted", .str (model.quote text))])]

end PluginSdk.Compiler.Process.Quoting.Wire
