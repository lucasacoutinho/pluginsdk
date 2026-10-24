import Lean.Data.Json
import PluginSdk.Installer.LocalSlot.Model
import PluginSdk.Installer.LocalSlot.Cleanup.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.LocalSlot.Wire

open Lean (Json toJson)
open PluginSdk.Installer.LocalSlot
open PluginSdk.WireJson

def readOwner (json : Json) : Except String Owner := do
  let value ← json.getStr?
  unless !value.isEmpty do
    throw "expected a nonempty Unicode installation owner"
  return value

def readIdentity (json : Json) : Except String Identity := do
  checkFields json ["plan", "bundle"]
  return ⟨PluginSdk.PlanId.mk (← readHex (← json.getObjVal? "plan")),
    PluginSdk.BundleDigest.mk (← readHex (← json.getObjVal? "bundle"))⟩

private def readObservation (json : Json) : Except String Observation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" =>
      checkFields json ["type"]
      return .absent
  | "unknown" =>
      checkFields json ["type"]
      return .unknown
  | "foreign" =>
      checkFields json ["type", "basis"]
      return .foreign ⟨← readHex (← json.getObjVal? "basis")⟩
  | "complete" =>
      checkFields json ["type", "owner", "identity", "basis"]
      let claim : Claim := ⟨← readOwner (← json.getObjVal? "owner"),
        ← readIdentity (← json.getObjVal? "identity")⟩
      return .complete claim ⟨← readHex (← json.getObjVal? "basis")⟩
  | "partial" =>
      checkFields json ["type", "owner", "identity", "basis"]
      let claim : Claim := ⟨← readOwner (← json.getObjVal? "owner"),
        ← readIdentity (← json.getObjVal? "identity")⟩
      return .partialPackage claim ⟨← readHex (← json.getObjVal? "basis")⟩
  | tag => throw s!"unknown local slot observation: {tag}"

def readSlots (json : Json) : Except String Slots := do
  checkFields json ["live", "staged", "retired"]
  return ⟨← readObservation (← json.getObjVal? "live"),
    ← readObservation (← json.getObjVal? "staged"),
    ← readObservation (← json.getObjVal? "retired")⟩

private def readOperation (json : Json) : Except String Operation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "install" =>
      checkFields json ["type", "next"]
      return .install (← readIdentity (← json.getObjVal? "next"))
  | "replace" =>
      checkFields json ["type", "previous", "next"]
      return .replace (← readIdentity (← json.getObjVal? "previous"))
        (← readIdentity (← json.getObjVal? "next"))
  | "remove" =>
      checkFields json ["type", "previous"]
      return .remove (← readIdentity (← json.getObjVal? "previous"))
  | tag => throw s!"unknown local slot operation: {tag}"

private def readInput (json : Json) : Except String Input := do
  checkFields json ["owner", "operation", "slots"]
  return ⟨← readOwner (← json.getObjVal? "owner"),
    ← readOperation (← json.getObjVal? "operation"),
    ← readSlots (← json.getObjVal? "slots")⟩

private def writeAction : Action → String
  | .prepare => "prepare"
  | .discardStage => "discard_stage"
  | .retire => "retire"
  | .publish => "publish"
  | .discardRetired => "discard_retired"

private def writeReason : Reason → String
  | .unknown => "unknown"
  | .unowned => "unowned"
  | .operation => "operation"
  | .drift => "drift"
  | .state => "state"

private def writeDecision : Decision → Json
  | .complete => tagged "complete"
  | .step action => tagged "step" [("action", .str (writeAction action))]
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

private def writeRole : Cleanup.Role → String
  | .live => "live"
  | .staged => "staged"
  | .retired => "retired"

private def writeCleanupDecision : Cleanup.Decision → Json
  | .complete => tagged "complete"
  | .step role => tagged "step" [("role", .str (writeRole role))]
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← readUInt32 (← request.getObjVal? "schema")
  unless schema == 1 do
    throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "advance_local_slot" =>
        pure (writeDecision (model.advance (← readInput input)))
    | "cleanup_local_slots" =>
        pure (writeCleanupDecision (Cleanup.model.cleanup (← readInput input)))
    | value => throw s!"unknown local slot request: {value}"
  return Json.mkObj [
    ("schema", toJson (1 : Nat)),
    ("type", .str tag),
    ("output", output)
  ]

end PluginSdk.Installer.LocalSlot.Wire
