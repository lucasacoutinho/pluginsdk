import Lean.Data.Json
import PluginSdk.ExecutableIntent.Model
import PluginSdk.WireJson

namespace PluginSdk.ExecutableIntent.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readPermissionBits (json : Json) : Except String PermissionBits := do
  let value ← readUInt32 json
  if h : value < 512 then
    return ⟨value, h⟩
  else
    throw "expected permission bits from 0 through 511"

private def readModeObservation (json : Json) : Except String ModeObservation := do
  let tag ← (← json.getObjVal? "type").getStr?
  match tag with
  | "posix" =>
    checkFields json ["type", "before", "after"]
    return .posix
      (← readPermissionBits (← json.getObjVal? "before"))
      (← readPermissionBits (← json.getObjVal? "after"))
  | "unrepresented" =>
    checkFields json ["type"]
    return .unrepresented
  | "unavailable" =>
    checkFields json ["type"]
    return .unavailable
  | value => throw s!"unknown executable intent mode observation: {value}"

private def readPath (json : Json) : Except String String := do
  return (← readPackagePath json).value

private def readPaths (json : Json) : Except String (List String) := do
  let items ← json.getArr?
  items.toList.mapM readPath

private def readNativeFile (json : Json) : Except String NativeFile := do
  checkFields json ["path", "mode"]
  return ⟨← readPath (← json.getObjVal? "path"),
    ← readModeObservation (← json.getObjVal? "mode")⟩

private def readSourceInput (json : Json) : Except String SourceInput := do
  let tag ← (← json.getObjVal? "type").getStr?
  match tag with
  | "filesystem" =>
    checkFields json ["type", "files"]
    let items ← (← json.getObjVal? "files").getArr?
    return .filesystem (← items.toList.mapM readNativeFile)
  | "declared" =>
    checkFields json ["type", "files", "executables"]
    return .declared
      (← readPaths (← json.getObjVal? "files"))
      (← readPaths (← json.getObjVal? "executables"))
  | value => throw s!"unknown executable intent source input: {value}"

def readRetainedFile (json : Json) : Except String RetainedFile := do
  checkFields json ["path", "digest", "executable"]
  return ⟨← readPath (← json.getObjVal? "path"),
    ← readHex (← json.getObjVal? "digest"),
    ← (← json.getObjVal? "executable").getBool?⟩

def readObservedFile (json : Json) : Except String ObservedFile := do
  checkFields json ["path", "digest", "mode"]
  return ⟨← readPath (← json.getObjVal? "path"),
    ← readHex (← json.getObjVal? "digest"),
    ← readModeObservation (← json.getObjVal? "mode")⟩

private def readPayloadInput (json : Json) : Except String PayloadInput := do
  checkFields json ["retained", "observed"]
  return ⟨← readRetainedFile (← json.getObjVal? "retained"),
    ← readObservedFile (← json.getObjVal? "observed")⟩

private def writeFileIntent (file : FileIntent) : Json :=
  Json.mkObj [
    ("path", .str file.path),
    ("executable", toJson file.executable)
  ]

private def writeSourceReason : SourceReason → String
  | .duplicateFile => "duplicate_file"
  | .duplicateDeclaration => "duplicate_declaration"
  | .missingFile => "missing_file"
  | .unavailable => "unavailable"
  | .unrepresented => "unrepresented"
  | .changed => "changed"

private def writeSourceResolution : SourceResolution → Json
  | .resolved files => Json.mkObj [
      ("type", .str "resolved"),
      ("files", .arr ((files.map writeFileIntent).toArray))
    ]
  | .refused reason path => Json.mkObj [
      ("type", .str "refused"),
      ("reason", .str (writeSourceReason reason)),
      ("path", .str path)
    ]

private def writePayloadReason : PayloadReason → String
  | .path => "path"
  | .content => "content"
  | .unavailable => "unavailable"
  | .changed => "changed"
  | .intent => "intent"

private def writePayloadResolution : PayloadResolution → Json
  | .resolved executable => Json.mkObj [
      ("type", .str "resolved"),
      ("executable", toJson executable)
    ]
  | .refused reason => Json.mkObj [
      ("type", .str "refused"),
      ("reason", .str (writePayloadReason reason))
    ]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← readUInt32 (← request.getObjVal? "schema")
  unless schema == 1 do
    throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "source_intent" =>
      pure (writeSourceResolution (model.source (← readSourceInput input)))
    | "payload_intent" =>
      pure (writePayloadResolution (model.payload (← readPayloadInput input)))
    | "stage_permissions" => do
      checkFields input ["current", "executable"]
      let current ← readPermissionBits (← input.getObjVal? "current")
      let executable ← (← input.getObjVal? "executable").getBool?
      pure (toJson (model.stage current executable).val)
    | value => throw s!"unknown executable intent request: {value}"
  return Json.mkObj [
    ("schema", toJson (1 : Nat)),
    ("type", .str tag),
    ("output", output)
  ]

end PluginSdk.ExecutableIntent.Wire
