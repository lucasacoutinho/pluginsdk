import PluginSdk.TreeRead.Model
import PluginSdk.FileRead.Wire
import PluginSdk.WireJson

namespace PluginSdk.TreeRead.Wire

open Lean (Json toJson)
open PluginSdk.FileRead.Wire (readAnchor readComponent readFileInfo readFinalPath readIdentity readObservation readQuantity)
open PluginSdk.WireJson

private def readPolicy (json : Json) : Except String Policy := do
  match ← json.getStr? with
  | "source" => return .source
  | "payload" => return .payload
  | value => throw s!"unknown tree read policy: {value}"

private def readReparseInfo (json : Json) : Except String ReparseInfo := do
  checkFields json ["identity", "path", "tag"]
  return ⟨← readIdentity (← json.getObjVal? "identity"),
    ← readFinalPath (← json.getObjVal? "path"),
    ← readUInt32 (← json.getObjVal? "tag")⟩

private def readEntryObservation (json : Json) : Except String EntryObservation := do
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
  | "reparse" =>
    checkFields json ["type", "info"]
    return .reparse (← readReparseInfo (← json.getObjVal? "info"))
  | "other" =>
    checkFields json ["type"]
    return .other
  | value => throw s!"unknown tree entry observation: {value}"

private def readBranch (json : Json) : Except String Branch := do
  checkFields json ["parent", "ancestors"]
  let parent ← readAnchor (← json.getObjVal? "parent")
  let ancestors ← (← (← json.getObjVal? "ancestors").getArr?).toList.mapM readAnchor
  return ⟨parent, ancestors⟩

private def readEntryInput (json : Json) : Except String EntryInput := do
  checkFields json ["policy", "root", "branch", "name", "entry", "target"]
  return ⟨← readPolicy (← json.getObjVal? "policy"),
    ← readAnchor (← json.getObjVal? "root"),
    ← readBranch (← json.getObjVal? "branch"),
    ← readComponent (← json.getObjVal? "name"),
    ← readEntryObservation (← json.getObjVal? "entry"),
    ← readObservation (← json.getObjVal? "target")⟩

private def readDirectoryInfo (json : Json) : Except String DirectoryInfo := do
  checkFields json ["anchor", "modified", "changed"]
  return ⟨← readAnchor (← json.getObjVal? "anchor"),
    ← readQuantity (← json.getObjVal? "modified"),
    ← readQuantity (← json.getObjVal? "changed")⟩

private def readDirectoryObservation (json : Json) : Except String DirectoryObservation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "unavailable" =>
    checkFields json ["type"]
    return .unavailable
  | "directory" =>
    checkFields json ["type", "info"]
    return .directory (← readDirectoryInfo (← json.getObjVal? "info"))
  | "other" =>
    checkFields json ["type"]
    return .other
  | value => throw s!"unknown tree directory observation: {value}"

private def readDirectorySnapshot (json : Json) : Except String DirectorySnapshot := do
  checkFields json ["root", "directory"]
  return ⟨← readObservation (← json.getObjVal? "root"),
    ← readDirectoryObservation (← json.getObjVal? "directory")⟩

private def readEnumeration (json : Json) : Except String Enumeration := do
  match ← (← json.getObjVal? "type").getStr? with
  | "complete" =>
    checkFields json ["type", "names"]
    let names ← (← (← json.getObjVal? "names").getArr?).toList.mapM readComponent
    return .complete names
  | "failed" =>
    checkFields json ["type"]
    return .failed
  | value => throw s!"unknown tree enumeration: {value}"

private def readDirectoryInput (json : Json) : Except String DirectoryInput := do
  checkFields json ["root", "directory", "before", "after", "enumeratedBefore", "enumeratedAfter", "visited"]
  let visited ← (← (← json.getObjVal? "visited").getArr?).toList.mapM readComponent
  return ⟨← readAnchor (← json.getObjVal? "root"),
    ← readAnchor (← json.getObjVal? "directory"),
    ← readDirectorySnapshot (← json.getObjVal? "before"),
    ← readDirectorySnapshot (← json.getObjVal? "after"),
    ← readEnumeration (← json.getObjVal? "enumeratedBefore"),
    ← readEnumeration (← json.getObjVal? "enumeratedAfter"),
    visited⟩

private def writeEntryDecision : EntryDecision → String
  | .accepted => "accepted"
  | .unavailable => "unavailable"
  | .notRegular => "not_regular"
  | .stream => "stream"
  | .changed => "changed"
  | .outside => "outside"
  | .nameMismatch => "name_mismatch"
  | .reparse => "reparse"
  | .cycle => "cycle"

private def writeDirectoryDecision : DirectoryDecision → String
  | .accepted => "accepted"
  | .unavailable => "unavailable"
  | .notDirectory => "not_directory"
  | .stream => "stream"
  | .changed => "changed"
  | .outside => "outside"
  | .duplicate => "duplicate"
  | .incomplete => "incomplete"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.normalize == (1, 1, 1) do
    throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "tree_entry" =>
      pure (.str (writeEntryDecision (model.entry (← readEntryInput input))))
    | "tree_directory" =>
      pure (.str (writeDirectoryDecision (model.directory (← readDirectoryInput input))))
    | value => throw s!"unknown tree read request: {value}"
  return Json.mkObj [
    ("schema", toJson (1 : Nat)),
    ("type", .str tag),
    ("output", output)
  ]

end PluginSdk.TreeRead.Wire
