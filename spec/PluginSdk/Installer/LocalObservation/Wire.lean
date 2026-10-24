import Lean.Data.Json
import PluginSdk.Installer.LocalObservation.Model
import PluginSdk.Installer.LocalSlot.Wire
import PluginSdk.Lifecycle.Wire
import PluginSdk.WireJson

namespace PluginSdk.Installer.LocalObservation.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← readUInt32 (← request.getObjVal? "schema")) == 1 do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "observe_local_slots" do
    throw "unknown local observation request"
  let input ← request.getObjVal? "input"
  checkFields input ["owner", "slots"]
  let owner ← PluginSdk.Installer.LocalSlot.Wire.readOwner (← input.getObjVal? "owner")
  let slots ← PluginSdk.Installer.LocalSlot.Wire.readSlots (← input.getObjVal? "slots")
  return Json.mkObj [("schema", toJson (1 : Nat)), ("type", .str "observe_local_slots"),
    ("output", PluginSdk.Lifecycle.Wire.writeObservation (model.observe ⟨owner, slots⟩))]

end PluginSdk.Installer.LocalObservation.Wire
