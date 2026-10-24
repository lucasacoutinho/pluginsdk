import Lean.Data.Json
import PluginSdk.Installer.LocalPackage.Model
import PluginSdk.Installer.LocalSlot.Wire
import PluginSdk.ExecutableIntent.Wire
import PluginSdk.FileRead.Wire
import PluginSdk.WireJson

namespace PluginSdk.Installer.LocalPackage.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readApproval (json : Json) : Except String Approval := do
  checkFields json ["owner", "identity", "root", "files"]
  let items ← (← json.getObjVal? "files").getArr?
  let files ← items.toList.mapM PluginSdk.ExecutableIntent.Wire.readRetainedFile
  unless !files.isEmpty do throw "expected a nonempty approved package"
  return ⟨← PluginSdk.Installer.LocalSlot.Wire.readOwner (← json.getObjVal? "owner"),
    ← PluginSdk.Installer.LocalSlot.Wire.readIdentity (← json.getObjVal? "identity"),
    ← PluginSdk.FileRead.Wire.readIdentity (← json.getObjVal? "root"), files⟩

private def readObservation (json : Json) : Except String Observation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" =>
      checkFields json ["type"]
      return .absent
  | "unknown" =>
      checkFields json ["type"]
      return .unknown
  | "tree" =>
      checkFields json ["type", "root", "basis", "directories", "files"]
      let directories ← (← json.getObjVal? "directories").getArr?
      let paths ← directories.toList.mapM fun path => do
        return (← readPackagePath path).value
      let files ← (← json.getObjVal? "files").getArr?
      return .tree ⟨← PluginSdk.FileRead.Wire.readIdentity (← json.getObjVal? "root"),
        ⟨← readHex (← json.getObjVal? "basis")⟩, paths,
        ← files.toList.mapM PluginSdk.ExecutableIntent.Wire.readObservedFile⟩
  | tag => throw s!"unknown local package observation: {tag}"

private def writeClaim (tag : String) (claim : PluginSdk.Installer.LocalSlot.Claim)
    (basis : PluginSdk.Fingerprint) : Json :=
  tagged tag [("owner", .str claim.owner),
    ("identity", Json.mkObj [("plan", .str claim.identity.plan.value),
      ("bundle", .str claim.identity.bundle.value)]),
    ("basis", .str basis.value)]

private def writeObservation : PluginSdk.Installer.LocalSlot.Observation → Json
  | .absent => tagged "absent"
  | .unknown => tagged "unknown"
  | .foreign basis => tagged "foreign" [("basis", .str basis.value)]
  | .complete claim basis => writeClaim "complete" claim basis
  | .partialPackage claim basis => writeClaim "partial" claim basis

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← readUInt32 (← request.getObjVal? "schema")) == 1 do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "classify_local_package" do
    throw "unknown local package request"
  let input ← request.getObjVal? "input"
  checkFields input ["approval", "observed"]
  let approval ← readOptional readApproval (← input.getObjVal? "approval")
  let observed ← readObservation (← input.getObjVal? "observed")
  return Json.mkObj [("schema", toJson (1 : Nat)),
    ("type", .str "classify_local_package"),
    ("output", writeObservation (model.classify ⟨approval, observed⟩))]

end PluginSdk.Installer.LocalPackage.Wire
