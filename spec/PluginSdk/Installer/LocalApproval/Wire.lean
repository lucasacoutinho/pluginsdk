import Lean.Data.Json
import PluginSdk.Installer.LocalApproval.Model
import PluginSdk.Installer.LocalSlot.Wire
import PluginSdk.FileRead.Wire
import PluginSdk.ExecutableIntent.Wire
import PluginSdk.WireJson

namespace PluginSdk.Installer.LocalApproval.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readRecord (json : Json) : Except String Record := do
  checkFields json ["schema", "owner", "identity", "root"]
  unless (← readUInt32 (← json.getObjVal? "schema")) == 1 do
    throw "unsupported local approval record schema version"
  return ⟨
    ← PluginSdk.Installer.LocalSlot.Wire.readOwner (← json.getObjVal? "owner"),
    ← PluginSdk.Installer.LocalSlot.Wire.readIdentity (← json.getObjVal? "identity"),
    ← PluginSdk.FileRead.Wire.readIdentity (← json.getObjVal? "root")
  ⟩

private def readRetained (json : Json) : Except String Retained := do
  checkFields json ["owner", "identity", "files"]
  let items ← (← json.getObjVal? "files").getArr?
  let files ← items.toList.mapM PluginSdk.ExecutableIntent.Wire.readRetainedFile
  match files with
  | [] => throw "expected a nonempty retained descriptor array"
  | head :: tail =>
      return ⟨
        ← PluginSdk.Installer.LocalSlot.Wire.readOwner (← json.getObjVal? "owner"),
        ← PluginSdk.Installer.LocalSlot.Wire.readIdentity (← json.getObjVal? "identity"),
        ⟨head, tail⟩
      ⟩

private def readInput (json : Json) : Except String Input := do
  checkFields json ["owner", "root", "record", "retained"]
  return ⟨
    ← PluginSdk.Installer.LocalSlot.Wire.readOwner (← json.getObjVal? "owner"),
    ← PluginSdk.FileRead.Wire.readIdentity (← json.getObjVal? "root"),
    ← readRecord (← json.getObjVal? "record"),
    ← readRetained (← json.getObjVal? "retained")
  ⟩

private def writeIdentity (identity : PluginSdk.Installer.LocalSlot.Identity) : Json :=
  Json.mkObj [
    ("plan", .str identity.plan.value),
    ("bundle", .str identity.bundle.value)
  ]

private def writePhysicalIdentity (identity : PluginSdk.FileRead.Identity) : Json :=
  Json.mkObj [
    ("volume", .str identity.volume),
    ("file", .str identity.file)
  ]

private def writeRetainedFile (file : PluginSdk.ExecutableIntent.RetainedFile) : Json :=
  Json.mkObj [
    ("path", .str file.path),
    ("digest", .str file.digest),
    ("executable", toJson file.executable)
  ]

private def writeApproval (approval : PluginSdk.Installer.LocalPackage.Approval) : Json :=
  Json.mkObj [
    ("owner", .str approval.owner),
    ("identity", writeIdentity approval.identity),
    ("root", writePhysicalIdentity approval.root),
    ("files", .arr ((approval.files.map writeRetainedFile).toArray))
  ]

private def writeOutput : Option PluginSdk.Installer.LocalPackage.Approval → Json
  | none => .null
  | some approval => writeApproval approval

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← readUInt32 (← request.getObjVal? "schema")) == 1 do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "bind_local_approval" do
    throw "unknown local approval request"
  let input ← readInput (← request.getObjVal? "input")
  return Json.mkObj [
    ("schema", toJson (1 : Nat)),
    ("type", .str "bind_local_approval"),
    ("output", writeOutput (model.bind input))
  ]

end PluginSdk.Installer.LocalApproval.Wire
