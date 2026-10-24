import PluginSdk.Installer.WindowsCommand.Quoting
import PluginSdk.WireJson

namespace PluginSdk.Installer.WindowsCommand.Quoting.Wire

open Lean (Json)
open WireJson

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "quote_windows_argument" do
    throw "expected a Windows argument quoting request"
  let input ← request.getObjVal? "input"
  checkFields input ["text"]
  let text ← (← input.getObjVal? "text").getStr?
  if '\x00' ∈ text.toList then throw "Windows argument cannot contain NUL"
  return Json.mkObj [
    ("schema", 1), ("type", .str "quote_windows_argument"),
    ("output", Json.mkObj [("quoted", .str (model.quote text))])]

end PluginSdk.Installer.WindowsCommand.Quoting.Wire
