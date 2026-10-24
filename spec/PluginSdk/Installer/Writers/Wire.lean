import PluginSdk.Installer.Writers.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.Writers.Wire

open Lean (Json toJson)
open PluginSdk.WireJson
open PluginSdk.Installer.Execution (ProcessId)

private def readProcessId (json : Json) : Except String ProcessId := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= (1.0 : Float) && value <= (4294967295.0 : Float) &&
      value.toUInt64.toFloat == value do
    throw "expected an integral process ID from 1 through 4294967295"
  return ⟨value.toUInt64.toNat⟩

private def readCreationTime (json : Json) : Except String CreationTime := do
  let value ← json.getStr?
  unless value.toList.length == 16 && value.toList.all ("0123456789abcdef".contains ·) do
    throw "expected 16 lowercase hexadecimal creation-time digits"
  return ⟨value⟩

private def readWriter (json : Json) : Except String Writer := do
  checkFields json ["pid", "creation"]
  return ⟨← readProcessId (← json.getObjVal? "pid"),
    ← readCreationTime (← json.getObjVal? "creation")⟩

private def readWriters (json : Json) : Except String (List Writer) := do
  (← json.getArr?).toList.mapM readWriter

private def readProcessState (json : Json) : Except String ProcessState := do
  match ← json.getStr? with
  | "terminated" => return .terminated
  | "active" => return .active
  | "unknown" => return .unknown
  | value => throw s!"unknown writer observation: {value}"

private def readObservation (json : Json) : Except String Observation := do
  checkFields json ["writer", "state"]
  return ⟨← readWriter (← json.getObjVal? "writer"),
    ← readProcessState (← json.getObjVal? "state")⟩

private def readLookup (json : Json) : Except String Lookup := do
  match ← (← json.getObjVal? "type").getStr? with
  | "opened" =>
    checkFields json ["type", "writer", "state"]
    return .opened (← readWriter (← json.getObjVal? "writer"))
      (← readProcessState (← json.getObjVal? "state"))
  | "missing" =>
    checkFields json ["type", "pid"]
    return .missing (← readProcessId (← json.getObjVal? "pid"))
  | "unavailable" => checkFields json ["type"]; return .unavailable
  | value => throw s!"unknown writer lookup: {value}"

private def readObservationInput (json : Json) : Except String ObservationInput := do
  checkFields json ["writer", "lookup"]
  return ⟨← readWriter (← json.getObjVal? "writer"),
    ← readLookup (← json.getObjVal? "lookup")⟩

private def readObservations (json : Json) : Except String (List Observation) := do
  (← json.getArr?).toList.mapM readObservation

private def readCompletionInput (json : Json) : Except String CompletionInput := do
  checkFields json ["writers", "observed"]
  return ⟨← readWriters (← json.getObjVal? "writers"),
    ← readObservations (← json.getObjVal? "observed")⟩

private def readPriorOwnersInput (json : Json) : Except String PriorOwnersInput := do
  checkFields json ["current", "owners", "observed"]
  return ⟨← readWriter (← json.getObjVal? "current"),
    ← readWriters (← json.getObjVal? "owners"),
    ← readObservations (← json.getObjVal? "observed")⟩

private def readGateState (json : Json) : Except String GateState := do
  match ← (← json.getObjVal? "type").getStr? with
  | "open" =>
    checkFields json ["type", "writers"]
    return .open (← readWriters (← json.getObjVal? "writers"))
  | "retaining" =>
    checkFields json ["type", "writers", "writer"]
    return .retaining (← readWriters (← json.getObjVal? "writers"))
      (← readWriter (← json.getObjVal? "writer"))
  | "closed" =>
    checkFields json ["type", "writers"]
    return .closed (← readWriters (← json.getObjVal? "writers"))
  | "stopped" =>
    checkFields json ["type", "writers"]
    return .stopped (← readWriters (← json.getObjVal? "writers"))
  | value => throw s!"unknown writer gate state: {value}"

private def readGateSignal (json : Json) : Except String GateSignal := do
  match ← (← json.getObjVal? "type").getStr? with
  | "birth" =>
    checkFields json ["type", "writer"]
    return .birth (← readWriter (← json.getObjVal? "writer"))
  | "retained" =>
    checkFields json ["type", "writers"]
    return .retained (← readWriters (← json.getObjVal? "writers"))
  | "failed" => checkFields json ["type"]; return .failed
  | "close" =>
    checkFields json ["type", "observed"]
    return .close (← readObservations (← json.getObjVal? "observed"))
  | "stop" => checkFields json ["type"]; return .stop
  | value => throw s!"unknown writer gate signal: {value}"

private def readGateInput (json : Json) : Except String GateInput := do
  checkFields json ["state", "signal"]
  return ⟨← readGateState (← json.getObjVal? "state"),
    ← readGateSignal (← json.getObjVal? "signal")⟩

private def writeWriter (writer : Writer) : Json :=
  Json.mkObj [("pid", toJson writer.pid.value), ("creation", .str writer.creation.value)]

private def writeWriters (writers : List Writer) : Json :=
  .arr (writers.map writeWriter).toArray

private def writeProcessState : ProcessState → Json
  | .terminated => .str "terminated"
  | .active => .str "active"
  | .unknown => .str "unknown"

private def writeObservation (observation : Observation) : Json :=
  Json.mkObj [("writer", writeWriter observation.writer), ("state", writeProcessState observation.state)]

private def writeCompletion : Completion → Json
  | .complete => .str "complete"
  | .active => .str "active"
  | .unknown => .str "unknown"

private def writeGateState : GateState → Json
  | .open writers => tagged "open" [("writers", writeWriters writers)]
  | .retaining writers writer =>
    tagged "retaining" [("writers", writeWriters writers), ("writer", writeWriter writer)]
  | .closed writers => tagged "closed" [("writers", writeWriters writers)]
  | .stopped writers => tagged "stopped" [("writers", writeWriters writers)]

private def writeWaitReason : WaitReason → Json
  | .active => .str "active"
  | .unknown => .str "unknown"

private def writeGateAction : GateAction → Json
  | .retain writers => tagged "retain" [("writers", writeWriters writers)]
  | .resume writer => tagged "resume" [("writer", writeWriter writer)]
  | .wait reason => tagged "wait" [("reason", writeWaitReason reason)]
  | .complete => tagged "complete"
  | .stop => tagged "stop"

private def writeGateStep (step : GateStep) : Json :=
  Json.mkObj [("state", writeGateState step.state), ("action", writeGateAction step.action)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "writer_observation" => pure (writeObservation (model.observe (← readObservationInput input)))
    | "writer_step" => pure (writeGateStep (model.step (← readGateInput input)))
    | "writer_completion" => pure (writeCompletion (model.completion (← readCompletionInput input)))
    | "writer_prior_owners" => pure (writeCompletion (model.priorOwners (← readPriorOwnersInput input)))
    | value => throw s!"unknown writer request: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Installer.Writers.Wire
