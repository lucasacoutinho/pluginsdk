import PluginSdk.Compiler.Assembly.Model
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Assembly.Wire

open Lean (Json)
open WireJson

private def readAsset (json : Json) : Except String Asset := do
  checkFields json ["path", "digest", "executable"]
  return ⟨← readPackagePath (← json.getObjVal? "path"),
    ⟨⟨← readHex (← json.getObjVal? "digest")⟩, ← (← json.getObjVal? "executable").getBool?⟩⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["base", "assets"]
  let base ← (← (← json.getObjVal? "base").getArr?).toList.mapM readAsset
  let assets ← (← (← json.getObjVal? "assets").getArr?).toList.mapM readAsset
  match base with
  | [] => throw "expected a nonempty assembly base"
  | head :: tail => return ⟨⟨head, tail⟩, assets⟩

private def writeAsset (asset : Asset) : Json := Json.mkObj
  [("path", .str asset.path.value), ("digest", .str asset.file.digest.value),
    ("executable", .bool asset.file.executable)]

private def writeIssue : Issue → Json
  | .pathCollision path => tagged "path_collision" [("path", .str path)]
  | .reservedAsset path => tagged "reserved_asset" [("path", .str path)]

private def writeResult : Result → Json
  | .assembled files => tagged "assembled" [("files", .arr (files.toList.map writeAsset).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "assemble" do
    throw "expected an assembly request"
  let output ← (fun input => writeResult (model.assemble input)) <$> readInput
    (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "assemble"), ("output", output)]

end PluginSdk.Compiler.Assembly.Wire
