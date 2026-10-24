import PluginSdk.Compiler.Process.Portable.Model
import PluginSdk.Compiler.Process.Wire
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Process.Portable.Wire

open Lean (Json toJson)
open WireJson

private def writeCapture (capture : Launcher.Capture) : Json := Json.mkObj [
  ("source", .str capture.source.value),
  ("raw", .str capture.raw),
  ("check", .str capture.check)]

private def writeSnapshotWord : Launcher.SnapshotWord → Json
  | .literal value => tagged "literal" [("value", .str value)]
  | .root => tagged "root"
  | .file path => tagged "file" [("path", .str path.value)]
  | .captured capture => tagged "captured" [("capture", writeCapture capture)]

def writeScript (script : Launcher.Script) : Json := Json.mkObj [
  ("names", .arr (script.names.map (fun name => .str name.value)).toArray),
  ("captures", .arr (script.captures.map writeCapture).toArray),
  ("snapshot", .arr (script.snapshot.map writeSnapshotWord).toArray),
  ("command", toJson script.command),
  ("args", .arr (script.args.map toJson).toArray),
  ("environment", .arr (script.environment.map (fun binding => Json.mkObj [
    ("name", .str binding.1.value),
    ("index", toJson binding.2)])).toArray),
  ("cwd", toJson script.cwd)]

private def writeNative (native : Launcher.Native) : Json := Json.mkObj [
  ("command", .str native.command),
  ("args", .arr (native.args.map Json.str).toArray),
  ("env", Json.mkObj (native.environment.map (fun binding => (binding.1, .str binding.2)))),
  ("cwd", native.cwd.elim .null Json.str)]

def writeIssue : Issue → Json
  | .environmentCollision name => tagged "environment_collision" [("name", .str name)]
  | .environmentReferenceUnsupported name =>
    tagged "environment_reference_unsupported" [("name", .str name.value)]

private def writeResult : Result → Json
  | .rendered program => tagged "rendered" [
      ("script", writeScript program.script),
      ("native", writeNative program.native),
      ("posix", .str program.posix)]
  | .rejected issues => tagged "rejected" [
      ("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "compile_portable_launcher" do
    throw "expected a portable launcher request"
  let inputJson ← request.getObjVal? "input"
  checkFields inputJson ["host", "path", "plan"]
  let host ← Process.Wire.readHost (← inputJson.getObjVal? "host")
  let path ← readPackagePath (← inputJson.getObjVal? "path")
  if '$' ∈ path.value.toList then throw "native launcher paths cannot contain expansion syntax"
  let input : Input := ⟨host, path, ← Process.Wire.readPlan (← inputJson.getObjVal? "plan")⟩
  let output := writeResult (model.build input)
  return Json.mkObj [
    ("schema", 1),
    ("type", .str "compile_portable_launcher"),
    ("output", output)]

end PluginSdk.Compiler.Process.Portable.Wire
