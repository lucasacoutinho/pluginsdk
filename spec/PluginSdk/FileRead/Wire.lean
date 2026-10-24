import PluginSdk.FileRead.Model
import PluginSdk.WireJson

namespace PluginSdk.FileRead.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readLowerHex (json : Json) (digits : Nat) : Except String String := do
  let value ← json.getStr?
  unless value.toList.length == digits && value.toList.all
      ("0123456789abcdef".contains ·) do
    throw s!"expected {digits} lowercase hexadecimal digits"
  return value

def readQuantity (json : Json) : Except String String := do
  let text ← json.getStr?
  unless !text.isEmpty && text.length ≤ 19 do
    throw "expected a canonical nonnegative signed-64-bit decimal string"
  let some value := text.toNat?
    | throw "expected a canonical nonnegative signed-64-bit decimal string"
  unless toString value == text && value ≤ 9223372036854775807 do
    throw "expected a canonical nonnegative signed-64-bit decimal string"
  return text

def readFinalPath (json : Json) : Except String String := do
  let value ← json.getStr?
  unless !value.contains (Char.ofNat 0) do
    throw "expected a Unicode native path without NUL"
  return value

private def readVolumeGuid (json : Json) : Except String String := do
  let value ← json.getStr?
  match value.splitOn "-" with
  | [first, second, third, fourth, fifth] =>
    unless first.length == 8 && second.length == 4 && third.length == 4 &&
        fourth.length == 4 && fifth.length == 12 &&
        [first, second, third, fourth, fifth].all
          (fun part => part.toList.all ("0123456789abcdef".contains ·)) do
      throw "expected a lowercase canonical volume GUID"
    return value
  | _ => throw "expected a lowercase canonical volume GUID"

def readIdentity (json : Json) : Except String Identity := do
  checkFields json ["volume", "file"]
  return ⟨← readLowerHex (← json.getObjVal? "volume") 16,
    ← readLowerHex (← json.getObjVal? "file") 32⟩

def readAnchor (json : Json) : Except String Anchor := do
  checkFields json ["identity", "path", "caseSensitive"]
  return ⟨← readIdentity (← json.getObjVal? "identity"),
    ← readFinalPath (← json.getObjVal? "path"),
    ← (← json.getObjVal? "caseSensitive").getBool?⟩

def readFileInfo (json : Json) : Except String FileInfo := do
  checkFields json ["identity", "size", "modified", "changed", "path"]
  return ⟨← readIdentity (← json.getObjVal? "identity"),
    ← readFinalPath (← json.getObjVal? "path"),
    ← readQuantity (← json.getObjVal? "size"),
    ← readQuantity (← json.getObjVal? "modified"),
    ← readQuantity (← json.getObjVal? "changed")⟩

def readObservation (json : Json) : Except String Observation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "unavailable" =>
    checkFields json ["type"]
    return .unavailable
  | "directory" =>
    checkFields json ["type", "anchor"]
    return .directory (← readAnchor (← json.getObjVal? "anchor"))
  | "file" =>
    checkFields json ["type", "info"]
    return .file (← readFileInfo (← json.getObjVal? "info"))
  | "other" =>
    checkFields json ["type"]
    return .other
  | value => throw s!"unknown file observation: {value}"

private def readSnapshot (json : Json) : Except String Snapshot := do
  checkFields json ["root", "file"]
  return ⟨← readObservation (← json.getObjVal? "root"),
    ← readObservation (← json.getObjVal? "file")⟩

private def readReadResult (json : Json) : Except String ReadResult := do
  match ← (← json.getObjVal? "type").getStr? with
  | "complete" =>
    checkFields json ["type", "length"]
    return .complete (← readQuantity (← json.getObjVal? "length"))
  | "failed" =>
    checkFields json ["type"]
    return .failed
  | value => throw s!"unknown file read result: {value}"

private def readReadInput (json : Json) : Except String ReadInput := do
  checkFields json ["root", "before", "after", "read"]
  return ⟨← readAnchor (← json.getObjVal? "root"),
    ← readSnapshot (← json.getObjVal? "before"),
    ← readSnapshot (← json.getObjVal? "after"),
    ← readReadResult (← json.getObjVal? "read")⟩

private def readPathInput (json : Json) : Except String String := do
  checkFields json ["path"]
  readFinalPath (← json.getObjVal? "path")

def readComponent (json : Json) : Except String String := do
  let component ← json.getStr?
  unless validComponent component do
    throw "expected a valid physical path component"
  return component

private def readCanonicalPath (json : Json) : Except String CanonicalPath := do
  checkFields json ["volume", "components"]
  let volume ← readVolumeGuid (← json.getObjVal? "volume")
  let components ← (← (← json.getObjVal? "components").getArr?).toList.mapM readComponent
  return ⟨volume, components⟩

private def readContainmentInput (json : Json) : Except String (CanonicalPath × CanonicalPath) := do
  checkFields json ["root", "file"]
  return (← readCanonicalPath (← json.getObjVal? "root"),
    ← readCanonicalPath (← json.getObjVal? "file"))

private def writeCanonicalPath (path : CanonicalPath) : Json :=
  Json.mkObj [
    ("volume", .str path.volume),
    ("components", .arr (path.components.toArray.map Json.str))
  ]

private def writeParsedPath : ParsedPath → Json
  | .plain path => tagged "plain" [("path", writeCanonicalPath path)]
  | .stream => tagged "stream"
  | .unsupported => tagged "unsupported"

private def writeReadDecision : ReadDecision → Json
  | .accepted => .str "accepted"
  | .unavailable => .str "unavailable"
  | .notRegular => .str "not_regular"
  | .stream => .str "stream"
  | .outside => .str "outside"
  | .changed => .str "changed"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.normalize == (1, 1, 1) do
    throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "file_path" =>
      pure (writeParsedPath (model.parsePath (← readPathInput input)))
    | "file_containment" => do
      let (root, file) ← readContainmentInput input
      pure (toJson (model.inside root file))
    | "file_read" =>
      pure (writeReadDecision (model.admit (← readReadInput input)))
    | value => throw s!"unknown file read request: {value}"
  return Json.mkObj [
    ("schema", toJson (1 : Nat)),
    ("type", .str tag),
    ("output", output)
  ]

end PluginSdk.FileRead.Wire
