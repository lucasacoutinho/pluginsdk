import PluginSdk.Lifecycle.Wire
import PluginSdk.Compiler.Wire
import PluginSdk.Compiler.Bundle.Wire

private def evaluate (request : Lean.Json) : Except String Lean.Json := do
  match ← (← request.getObjVal? "type").getStr? with
  | "render" => PluginSdk.Compiler.Wire.evaluate request
  | "check_bundle" => PluginSdk.Compiler.Bundle.Wire.evaluate request
  | _ => PluginSdk.Lifecycle.Wire.evaluate request

def main : IO UInt32 := do
  let input ← IO.getStdin
  let output ← IO.getStdout
  let errors ← IO.getStderr
  repeat
    let line ← input.getLine
    if line.isEmpty then return 0
    match PluginSdk.WireJson.parse line >>= evaluate with
    | .ok response =>
      output.putStrLn response.compress
      output.flush
    | .error message =>
      errors.putStrLn s!"oracle: {message}"
      return 1
