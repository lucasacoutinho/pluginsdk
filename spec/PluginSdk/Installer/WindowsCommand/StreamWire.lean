import PluginSdk.Installer.WindowsCommand.Streams
import PluginSdk.WireJson

namespace PluginSdk.Installer.WindowsCommand.Streams.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readBytes (json : Json) : Except String Nat := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= (0.0 : Float) && value <= (9007199254740991.0 : Float) &&
      value.toUInt64.toFloat == value do
    throw "expected a nonnegative safe integer byte count"
  return value.toUInt64.toNat

private def readInputState (json : Json) : Except String InputState := do
  checkFields json ["type", "remaining"]
  let remaining ← readBytes (← json.getObjVal? "remaining")
  match ← (← json.getObjVal? "type").getStr? with
  | "open" => return .open remaining
  | "closed" => return .closed remaining
  | value => throw s!"unknown input state: {value}"

private def readState (json : Json) : Except String StreamState := do
  checkFields json ["input", "outputRemaining"]
  return ⟨← readInputState (← json.getObjVal? "input"),
    ← readBytes (← json.getObjVal? "outputRemaining")⟩

private def readSignal (json : Json) : Except String StreamSignal := do
  match ← (← json.getObjVal? "type").getStr? with
  | "input" =>
    checkFields json ["type", "bytes"]
    return .input (← readBytes (← json.getObjVal? "bytes"))
  | "output" =>
    checkFields json ["type", "bytes"]
    return .output (← readBytes (← json.getObjVal? "bytes"))
  | "end_input" => checkFields json ["type"]; return .endInput
  | value => throw s!"unknown stream signal: {value}"

private def readStreamInput (json : Json) : Except String StreamInput := do
  checkFields json ["state", "signal"]
  return ⟨← readState (← json.getObjVal? "state"), ← readSignal (← json.getObjVal? "signal")⟩

private def readIoPhase (json : Json) : Except String IoPhase := do
  match ← json.getStr? with
  | "pending" => return .pending
  | "cancelling" => return .cancelling
  | "terminal" => return .terminal
  | "released" => return .released
  | value => throw s!"unknown I/O phase: {value}"

private def readIoSignal (json : Json) : Except String IoSignal := do
  match ← json.getStr? with
  | "cancel" => return .cancel
  | "completed" => return .completed
  | "release" => return .release
  | value => throw s!"unknown I/O signal: {value}"

private def readIoInput (json : Json) : Except String IoInput := do
  checkFields json ["phase", "signal"]
  return ⟨← readIoPhase (← json.getObjVal? "phase"), ← readIoSignal (← json.getObjVal? "signal")⟩

private def writeInputState : InputState → Json
  | .open remaining => tagged "open" [("remaining", toJson remaining)]
  | .closed remaining => tagged "closed" [("remaining", toJson remaining)]

private def writeState (state : StreamState) : Json :=
  Json.mkObj [("input", writeInputState state.input), ("outputRemaining", toJson state.outputRemaining)]

private def writeBlockedReason : BlockedReason → Json
  | .inputClosed => .str "input_closed"
  | .inputLimit => .str "input_limit"
  | .outputLimit => .str "output_limit"

private def writeAction : StreamAction → Json
  | .accepted => tagged "accepted"
  | .closeInput => tagged "close_input"
  | .ignore => tagged "ignore"
  | .blocked reason => tagged "blocked" [("reason", writeBlockedReason reason)]

private def writeStreamStep (step : StreamStep) : Json :=
  Json.mkObj [("state", writeState step.state), ("action", writeAction step.action)]

private def writeIoPhase : IoPhase → Json
  | .pending => .str "pending"
  | .cancelling => .str "cancelling"
  | .terminal => .str "terminal"
  | .released => .str "released"

private def writeIoAction : IoAction → Json
  | .cancel => .str "cancel"
  | .wait => .str "wait"
  | .release => .str "release"
  | .ignore => .str "ignore"

private def writeIoStep (step : IoStep) : Json :=
  Json.mkObj [("phase", writeIoPhase step.phase), ("action", writeIoAction step.action)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "windows_stream_step" => pure (writeStreamStep (model.stream (← readStreamInput input)))
    | "windows_io_step" => pure (writeIoStep (model.io (← readIoInput input)))
    | value => throw s!"unknown Windows stream request: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Installer.WindowsCommand.Streams.Wire
