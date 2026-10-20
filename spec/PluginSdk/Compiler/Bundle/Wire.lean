import PluginSdk.Compiler.Bundle.Model
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Bundle.Wire

open Lean (Json)
open WireJson

private def readInput (json : Json) : Except String Input := do
  checkFields json ["digest", "computed", "paths"]
  let paths ← (← (← json.getObjVal? "paths").getArr?).toList.mapM readPackagePath
  match paths with
  | [] => throw "expected a nonempty package path sequence"
  | head :: tail => return ⟨⟨← readHex (← json.getObjVal? "digest")⟩,
      ⟨← readHex (← json.getObjVal? "computed")⟩, ⟨head, tail⟩⟩

private def writeIssue : Issue → Json
  | .digestMismatch => tagged "digest_mismatch"
  | .noncanonicalOrder => tagged "noncanonical_order"
  | .pathCollision path => tagged "path_collision" [("path", .str path)]

private def writeResult : Result → Json
  | .valid => tagged "valid"
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "check_bundle" do throw "expected a bundle check request"
  let output ← (fun input => writeResult (model.check input)) <$> readInput (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "check_bundle"), ("output", output)]

end PluginSdk.Compiler.Bundle.Wire
