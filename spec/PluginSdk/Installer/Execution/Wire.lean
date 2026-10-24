import PluginSdk.Installer.Execution.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.Execution.Wire

open Lean (Json)
open PluginSdk.WireJson

private def readProcessId (json : Json) : Except String ProcessId := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= (1.0 : Float) && value <= (4294967295.0 : Float) &&
      value.toUInt64.toFloat == value do
    throw "expected an integral process ID from 1 through 4294967295"
  return ⟨value.toUInt64.toNat⟩

private def readBootId (json : Json) : Except String BootId := do
  let value ← json.getStr?
  if value.isEmpty || value.contains '\x00' then throw "expected a nonempty boot identity without NUL"
  return ⟨value⟩

private def readJobName (json : Json) : Except String JobName := do
  let value ← json.getStr?
  let jobPrefix := "Global\\pluginsdk-"
  let chars := value.toList
  let suffix := chars.drop jobPrefix.length
  unless chars.take jobPrefix.length == jobPrefix.toList && suffix.length == 64 &&
      suffix.all ("0123456789abcdef".contains ·) do
    throw "expected Global\\pluginsdk- followed by 64 lowercase hexadecimal digits"
  return ⟨value⟩

private def readDomain (json : Json) : Except String ProcessDomain := do
  match ← (← json.getObjVal? "type").getStr? with
  | "process_group" =>
    checkFields json ["type", "group", "boot"]
    return .processGroup (← readProcessId (← json.getObjVal? "group"))
      (← readBootId (← json.getObjVal? "boot"))
  | "windows_job" =>
    checkFields json ["type", "name"]
    return .windowsJob (← readJobName (← json.getObjVal? "name"))
  | tag => throw s!"unknown process domain: {tag}"

private def readProcessGroupState (json : Json) : Except String ProcessGroupState := do
  match ← json.getStr? with
  | "present" => return .present
  | "absent" => return .absent
  | value => throw s!"unknown process-group state: {value}"

private def readWindowsJobState (json : Json) : Except String WindowsJobState := do
  match ← json.getStr? with
  | "active" => return .active
  | "empty" => return .empty
  | "absent" => return .absent
  | value => throw s!"unknown Windows-job state: {value}"

private def readObservation (json : Json) : Except String DomainObservation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "unknown" => checkFields json ["type"]; return .unknown
  | "boot" =>
    checkFields json ["type", "boot"]
    return .boot (← readBootId (← json.getObjVal? "boot"))
  | "process_group" =>
    checkFields json ["type", "group", "boot", "state"]
    return .processGroup (← readProcessId (← json.getObjVal? "group"))
      (← readBootId (← json.getObjVal? "boot"))
      (← readProcessGroupState (← json.getObjVal? "state"))
  | "windows_job" =>
    checkFields json ["type", "name", "state"]
    return .windowsJob (← readJobName (← json.getObjVal? "name"))
      (← readWindowsJobState (← json.getObjVal? "state"))
  | tag => throw s!"unknown domain observation: {tag}"

private def readInput (json : Json) : Except String StatusInput := do
  checkFields json ["domain", "observed"]
  return ⟨← readDomain (← json.getObjVal? "domain"),
    ← readObservation (← json.getObjVal? "observed")⟩

private def writeStatus : DomainStatus → String
  | .quiescent => "quiescent"
  | .active => "active"
  | .unknown => "unknown"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "execution_domain_status" do
    throw "expected execution_domain_status"
  let output := writeStatus (model.status (← readInput (← request.getObjVal? "input")))
  return Json.mkObj [("schema", 1), ("type", .str "execution_domain_status"), ("output", .str output)]

end PluginSdk.Installer.Execution.Wire
