import PluginSdk.Compiler.Process.Model
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Process.Wire

open Lean (Json)
open WireJson

private instance (c : Char) : Decidable (AsciiLetter c) := by
  unfold AsciiLetter
  infer_instance

private instance (text : String) : Decidable (ValidExecutableName text) := by
  unfold ValidExecutableName
  infer_instance

def readText (json : Json) : Except String Text := do
  let text ← json.getStr?
  if valid : '\x00' ∉ text.toList then return ⟨text, valid⟩
  else throw "process text cannot contain NUL"

private def readExecutableName (json : Json) : Except String ExecutableName := do
  let text ← json.getStr?
  if valid : ValidExecutableName text then return ⟨text, valid⟩
  else throw "expected a bare executable name"

def readEnvironmentName (json : Json) : Except String EnvironmentName := do
  let text ← json.getStr?
  match split : text.toList with
  | [] => throw "expected an environment name"
  | first :: rest =>
    if valid : (AsciiLetter first ∨ first = '_') ∧
        ∀ c ∈ rest, AsciiLetter c ∨ ('0' ≤ c ∧ c ≤ '9') ∨ c = '_' then
      return ⟨text, ⟨first, rest, split, valid.1, valid.2⟩⟩
    else throw "expected an environment name"

private def readProgram (json : Json) : Except String Program := do
  match ← (← json.getObjVal? "type").getStr? with
  | "external" =>
    checkFields json ["type", "name"]
    return .external (← readExecutableName (← json.getObjVal? "name"))
  | "file" =>
    checkFields json ["type", "path"]
    return .file (← readPackagePath (← json.getObjVal? "path"))
  | _ => throw "expected a process program"

private def readArgument (json : Json) : Except String Argument := do
  match ← (← json.getObjVal? "type").getStr? with
  | "literal" =>
    checkFields json ["type", "value"]
    return .literal (← readText (← json.getObjVal? "value"))
  | "file" =>
    checkFields json ["type", "path"]
    return .file (← readPackagePath (← json.getObjVal? "path"))
  | _ => throw "expected a process argument"

private def readEnvironmentValue (json : Json) : Except String EnvironmentValue := do
  match ← (← json.getObjVal? "type").getStr? with
  | "literal" =>
    checkFields json ["type", "value"]
    return .literal (← readText (← json.getObjVal? "value"))
  | "reference" =>
    checkFields json ["type", "name"]
    return .reference (← readEnvironmentName (← json.getObjVal? "name"))
  | _ => throw "expected an environment value"

private def readBinding (json : Json) : Except String (EnvironmentName × EnvironmentValue) := do
  checkFields json ["name", "value"]
  return (← readEnvironmentName (← json.getObjVal? "name"),
    ← readEnvironmentValue (← json.getObjVal? "value"))

private def readDefinition (json : Json) : Except String Definition := do
  checkFields json ["command", "args", "environment", "cwd"]
  return ⟨← readProgram (← json.getObjVal? "command"),
    ← (← (← json.getObjVal? "args").getArr?).toList.mapM readArgument,
    ← (← (← json.getObjVal? "environment").getArr?).toList.mapM readBinding,
    ← readOptional readPackagePath (← json.getObjVal? "cwd")⟩

private def readAsset (json : Json) : Except String Asset := do
  checkFields json ["path", "digest", "executable"]
  return ⟨← readPackagePath (← json.getObjVal? "path"),
    ⟨⟨← readHex (← json.getObjVal? "digest")⟩, ← (← json.getObjVal? "executable").getBool?⟩⟩

def readHost (json : Json) : Except String Host := do
  match ← json.getStr? with
  | "claude_code" => return .claudeCode
  | "codex" => return .codex
  | _ => throw "expected a qualified process host"

private def readWord (json : Json) : Except String Word := do
  match ← (← json.getObjVal? "type").getStr? with
  | "literal" =>
    checkFields json ["type", "value"]
    return .literal (← readText (← json.getObjVal? "value"))
  | "root" =>
    checkFields json ["type"]
    return .root
  | "file" =>
    checkFields json ["type", "path"]
    return .file (← readPackagePath (← json.getObjVal? "path"))
  | "environment" =>
    checkFields json ["type", "name"]
    return .environment (← readEnvironmentName (← json.getObjVal? "name"))
  | _ => throw "expected a process word"

private def readPlanBinding (json : Json) : Except String (EnvironmentName × Word) := do
  checkFields json ["name", "value"]
  return (← readEnvironmentName (← json.getObjVal? "name"), ← readWord (← json.getObjVal? "value"))

def readPlan (json : Json) : Except String Plan := do
  checkFields json ["command", "args", "environment", "cwd"]
  return ⟨← readWord (← json.getObjVal? "command"),
    ← (← (← json.getObjVal? "args").getArr?).toList.mapM readWord,
    ← (← (← json.getObjVal? "environment").getArr?).toList.mapM readPlanBinding,
    ← readWord (← json.getObjVal? "cwd")⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["host", "definition", "files"]
  return ⟨← readHost (← json.getObjVal? "host"),
    ← readDefinition (← json.getObjVal? "definition"),
    ← (← (← json.getObjVal? "files").getArr?).toList.mapM readAsset⟩

private def writeWord : Word → Json
  | .literal text => tagged "literal" [("value", .str text.value)]
  | .root => tagged "root"
  | .file path => tagged "file" [("path", .str path.value)]
  | .environment name => tagged "environment" [("name", .str name.value)]

private def writePlan (plan : Plan) : Json := Json.mkObj [
  ("command", writeWord plan.command),
  ("args", .arr (plan.args.map writeWord).toArray),
  ("environment", .arr (plan.environment.map (fun binding => Json.mkObj [
    ("name", .str binding.1.value), ("value", writeWord binding.2)])).toArray),
  ("cwd", writeWord plan.cwd)]

private def writeIssue : Issue → Json
  | .missingFile path => tagged "missing_file" [("path", .str path.value)]
  | .notExecutable path => tagged "not_executable" [("path", .str path.value)]
  | .missingDirectory path => tagged "missing_directory" [("path", .str path.value)]
  | .environmentReferenceUnsupported name =>
    tagged "environment_reference_unsupported" [("name", .str name.value)]
  | .environmentCollision name => tagged "environment_collision" [("name", .str name.value)]

private def writeResult : Result → Json
  | .planned plan => tagged "planned" [("plan", writePlan plan)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "lower_process" do
    throw "expected a process lowering request"
  let output ← (fun input => writeResult (model.lower input)) <$> readInput (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "lower_process"), ("output", output)]

end PluginSdk.Compiler.Process.Wire
