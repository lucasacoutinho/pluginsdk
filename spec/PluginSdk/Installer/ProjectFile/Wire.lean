import Lean.Data.Json
import PluginSdk.Installer.ProjectFile.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.ProjectFile.Wire

open Lean (Json toJson)
open PluginSdk.Installer.ProjectFile
open PluginSdk.WireJson

private def readMode (json : Json) : Except String PosixMode := do
  let value ← readUInt32 json
  if valid : value < 4096 then
    return ⟨value, valid⟩
  else
    throw "expected a POSIX mode from 0 through 4095"

private def readAttributes (json : Json) : Except String Attributes := do
  let value ← readUInt32 json
  if valid : value < 4294967296 then
    return ⟨value, valid⟩
  else
    throw "expected a 32-bit native attributes value"

private def readPlatform (json : Json) : Except String String := do
  let value ← json.getStr?
  unless !value.isEmpty do
    throw "expected a nonempty Unicode platform string"
  return value

private def readBasis (json : Json) : Except String Basis := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" =>
    checkFields json ["type"]
    return .absent
  | "file" =>
    checkFields json ["type", "digest", "mode"]
    return .file (← readHex (← json.getObjVal? "digest"))
      (← readMode (← json.getObjVal? "mode"))
  | "windows_file" =>
    checkFields json ["type", "digest", "attributes", "security"]
    return .windowsFile (← readHex (← json.getObjVal? "digest"))
      (← readAttributes (← json.getObjVal? "attributes"))
      (← readHex (← json.getObjVal? "security"))
  | value => throw s!"unknown project file basis: {value}"

private def readObservation (json : Json) : Except String Observation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" =>
    checkFields json ["type"]
    return .absent
  | "file" =>
    checkFields json ["type", "digest", "mode"]
    return .file (← readHex (← json.getObjVal? "digest"))
      (← readMode (← json.getObjVal? "mode"))
  | "windows_file" =>
    checkFields json ["type", "digest", "attributes", "security", "streams"]
    let streamText ← (← json.getObjVal? "streams").getStr?
    let streams ← match streamText with
      | "default_only" => pure Streams.defaultOnly
      | "additional" => pure Streams.additional
      | "unavailable" => pure Streams.unavailable
      | value => throw s!"unknown project file stream state: {value}"
    return .windowsFile (← readHex (← json.getObjVal? "digest"))
      (← readAttributes (← json.getObjVal? "attributes"))
      (← readHex (← json.getObjVal? "security")) streams
  | value => throw s!"unknown project file observation: {value}"

def readInput (json : Json) : Except String Input := do
  checkFields json ["platform", "observed"]
  return ⟨← readPlatform (← json.getObjVal? "platform"),
    ← readObservation (← json.getObjVal? "observed")⟩

def readReviewInput (json : Json) : Except String ReviewInput := do
  checkFields json ["current", "reviewed"]
  return ⟨← readInput (← json.getObjVal? "current"),
    ← readBasis (← json.getObjVal? "reviewed")⟩

def writeBasis : Basis → Json
  | .absent => tagged "absent"
  | .file digest mode =>
    tagged "file" [("digest", .str digest), ("mode", toJson mode.val)]
  | .windowsFile digest attributes security =>
    tagged "windows_file" [
      ("digest", .str digest),
      ("attributes", toJson attributes.val),
      ("security", .str security)
    ]

private def writeReason : Reason → String
  | .platform => "platform"
  | .representation => "representation"
  | .attributes => "attributes"
  | .streams => "streams"
  | .changed => "changed"

private def writeDecision : Decision → Json
  | .ready basis => tagged "ready" [("basis", writeBasis basis)]
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← readUInt32 (← request.getObjVal? "schema")
  unless schema == 1 do
    throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "admit_project_file" =>
      pure (writeDecision (model.admit (← readInput input)))
    | "review_project_file" =>
      pure (writeDecision (model.review (← readReviewInput input)))
    | value => throw s!"unknown project file request: {value}"
  return Json.mkObj [
    ("schema", toJson (1 : Nat)),
    ("type", .str tag),
    ("output", output)
  ]

end PluginSdk.Installer.ProjectFile.Wire
