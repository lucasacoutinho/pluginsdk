import PluginSdk.Installer.Worker.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.Worker.Wire

open Lean (Json)
open PluginSdk.WireJson

private def readState (json : Json) : Except String State := do
  match ← json.getStr? with
  | "waiting" => return .waiting
  | "accepted" => return .accepted
  | "stopped" => return .stopped
  | value => throw s!"unknown worker state: {value}"

private def readSignal (json : Json) : Except String Signal := do
  match ← json.getStr? with
  | "request" => return .request
  | "invalid" => return .invalid
  | "disconnect" => return .disconnect
  | value => throw s!"unknown worker signal: {value}"

private def writeState : State → String
  | .waiting => "waiting"
  | .accepted => "accepted"
  | .stopped => "stopped"

private def writeAction : Action → String
  | .start => "start"
  | .stop => "stop"
  | .ignore => "ignore"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "admit_worker_request" do
    throw "expected admit_worker_request"
  let input ← request.getObjVal? "input"
  checkFields input ["state", "signal"]
  let output := model.admit ⟨← readState (← input.getObjVal? "state"), ← readSignal (← input.getObjVal? "signal")⟩
  return Json.mkObj [("schema", 1), ("type", .str "admit_worker_request"),
    ("output", Json.mkObj [("state", .str (writeState output.state)), ("action", .str (writeAction output.action))])]

end PluginSdk.Installer.Worker.Wire
