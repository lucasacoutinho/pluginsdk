import PluginSdk.Catalog.Artifacts.Model
import PluginSdk.Catalog.Wire

namespace PluginSdk.Catalog.Artifacts.Wire

open Lean (Json)
open WireJson

private def readDescriptor (json : Json) : Except String PackageDescriptor := do
  checkFields json ["plugin", "format", "version", "digest"]
  return ⟨← Catalog.Wire.readPluginId (← json.getObjVal? "plugin"),
    ← Catalog.Wire.readPackageFormat (← json.getObjVal? "format"),
    ← Catalog.Wire.readNonempty (← json.getObjVal? "version"),
    ← readHex (← json.getObjVal? "digest")⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["plugin", "version", "packages", "artifacts"]
  return ⟨← Catalog.Wire.readPluginId (← json.getObjVal? "plugin"),
    ← Catalog.Wire.readNonempty (← json.getObjVal? "version"),
    ← Catalog.Wire.readPackageDigests (← json.getObjVal? "packages"),
    ← (← (← json.getObjVal? "artifacts").getArr?).toList.mapM readDescriptor⟩

private def writeIssue : Issue → Json
  | .missingPackage format => tagged "missing_package" [("format", .str (FormatKey format))]
  | .unexpectedPackage format => tagged "unexpected_package" [("format", .str (FormatKey format))]
  | .duplicatePackage format => tagged "duplicate_package" [("format", .str (FormatKey format))]
  | .pluginMismatch format => tagged "plugin_mismatch" [("format", .str (FormatKey format))]
  | .versionMismatch format => tagged "version_mismatch" [("format", .str (FormatKey format))]
  | .digestMismatch format => tagged "digest_mismatch" [("format", .str (FormatKey format))]

private def writeResult : Result → Json
  | .accepted => tagged "accepted"
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "check_packages" do
    throw "unknown artifact request"
  let input ← readInput (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "check_packages"),
    ("output", writeResult (model.check input))]

end PluginSdk.Catalog.Artifacts.Wire
