import PluginSdk.Compiler.Process.Portable.Runtime.Model
import PluginSdk.Compiler.Process.Wire
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Process.Portable.Runtime.Wire

open Lean (Json)
open WireJson

private def readSafeIndex (json : Json) : Except String Nat := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= (0.0 : Float) && value <= (9007199254740991.0 : Float) &&
      value.toUInt64.toFloat == value do
    throw "expected a nonnegative safe integer parameter index"
  return value.toUInt64.toNat

private def readScriptCapture (json : Json) : Except String Launcher.Capture := do
  checkFields json ["source", "raw", "check"]
  return ⟨← Process.Wire.readEnvironmentName (← json.getObjVal? "source"),
    (← Process.Wire.readEnvironmentName (← json.getObjVal? "raw")).value,
    (← Process.Wire.readEnvironmentName (← json.getObjVal? "check")).value⟩

private def readSnapshotWord (json : Json) : Except String Launcher.SnapshotWord := do
  match ← (← json.getObjVal? "type").getStr? with
  | "literal" =>
    checkFields json ["type", "value"]
    return .literal (← Process.Wire.readText (← json.getObjVal? "value")).value
  | "root" =>
    checkFields json ["type"]
    return .root
  | "file" =>
    checkFields json ["type", "path"]
    return .file (← readPackagePath (← json.getObjVal? "path"))
  | "captured" =>
    checkFields json ["type", "capture"]
    return .captured (← readScriptCapture (← json.getObjVal? "capture"))
  | value => throw s!"unknown process snapshot word: {value}"

private def readEnvironmentIndex (json : Json) : Except String (EnvironmentName × Nat) := do
  checkFields json ["name", "index"]
  return (← Process.Wire.readEnvironmentName (← json.getObjVal? "name"),
    ← readSafeIndex (← json.getObjVal? "index"))

def readScript (json : Json) : Except String Launcher.Script := do
  checkFields json ["names", "captures", "snapshot", "command", "args", "environment", "cwd"]
  return ⟨
    ← (← (← json.getObjVal? "names").getArr?).toList.mapM Process.Wire.readEnvironmentName,
    ← (← (← json.getObjVal? "captures").getArr?).toList.mapM readScriptCapture,
    ← (← (← json.getObjVal? "snapshot").getArr?).toList.mapM readSnapshotWord,
    ← readSafeIndex (← json.getObjVal? "command"),
    ← (← (← json.getObjVal? "args").getArr?).toList.mapM readSafeIndex,
    ← (← (← json.getObjVal? "environment").getArr?).toList.mapM readEnvironmentIndex,
    ← readSafeIndex (← json.getObjVal? "cwd")⟩

private def readCaptureInput (json : Json) : Except String
    (EnvironmentName × Option String × Option String) := do
  checkFields json ["source", "raw", "check"]
  let readTextValue := fun value => do
    return (← Process.Wire.readText value).value
  return (← Process.Wire.readEnvironmentName (← json.getObjVal? "source"),
    ← readOptional readTextValue (← json.getObjVal? "raw"),
    ← readOptional readTextValue (← json.getObjVal? "check"))

private def readCaptureValues (json : Json) : Except String (List (EnvironmentName × Option String)) := do
  let fields ← json.getObj?
  fields.toList.mapM fun (name, value) => do
    let name ← Process.Wire.readEnvironmentName (.str name)
    let value ← readOptional (fun entry => do
      return (← Process.Wire.readText entry).value) value
    return (name, value)

private def writeInvocation (invocation : Launcher.Invocation) : Json := Json.mkObj [
  ("command", .str invocation.command),
  ("args", .arr (invocation.args.map Json.str).toArray),
  ("environment", .arr (invocation.environment.map fun binding => Json.mkObj [
    ("name", .str binding.1.value),
    ("value", .str binding.2)]).toArray),
  ("cwd", .str invocation.cwd)]

private def readProcessCapture (input : Json) : Except String Json := do
  let (source, raw, check) ← readCaptureInput input
  return writeOptional Json.str (model.read source raw check)

private def executeProcess (input : Json) : Except String Json := do
  checkFields input ["script", "root", "captures"]
  let script ← readScript (← input.getObjVal? "script")
  let root := (← Process.Wire.readText (← input.getObjVal? "root")).value
  let captures ← readCaptureValues (← input.getObjVal? "captures")
  let ambient := fun name =>
    match captures.find? (fun binding => binding.1 == name) with
    | some (_, value) => value
    | none => none
  return match model.execute script root ambient with
    | none => .null
    | some invocation => writeInvocation invocation

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "read_process_capture" => readProcessCapture input
    | "execute_process" => executeProcess input
    | value => throw s!"unknown portable process runtime request: {value}"
  return Json.mkObj [
    ("schema", 1),
    ("type", .str tag),
    ("output", output)]

end PluginSdk.Compiler.Process.Portable.Runtime.Wire
