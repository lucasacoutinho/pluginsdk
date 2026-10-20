import Lean.Data.Json
import Init.Data.List.SplitOn.Lemmas
import PluginSdk.Domain

namespace PluginSdk.WireJson

open Lean (Json)
open Std.Internal.Parsec Std.Internal.Parsec.String

mutual
  private partial def value : Parser Json := do
    match ← peek! with
    | '{' =>
      skip
      ws
      if (← peek!) == '}' then
        skip
        ws
        return Json.mkObj []
      return .obj (← objectFields ∅)
    | '[' =>
      skip
      ws
      if (← peek!) == ']' then
        skip
        ws
        return .arr #[]
      return .arr (← arrayItems #[])
    | _ => Lean.Json.Parser.anyCore

  private partial def objectFields (fields : Std.TreeMap.Raw String Json) :
      Parser (Std.TreeMap.Raw String Json) := do
    skipString "\""
    let key ← Lean.Json.Parser.str
    if fields.contains key then fail s!"duplicate field: {key}"
    ws
    skipString ":"
    ws
    let entry ← value
    let next := fields.insert key entry
    match ← any with
    | '}' => ws; return next
    | ',' => ws; objectFields next
    | _ => fail "expected an object separator"

  private partial def arrayItems (items : Array Json) : Parser (Array Json) := do
    let entry ← value
    let next := items.push entry
    match ← any with
    | ']' => ws; return next
    | ',' => ws; arrayItems next
    | _ => fail "expected an array separator"
end

def parse (text : String) : Except String Json :=
  Parser.run (do ws; let result ← value; eof; return result) text

def checkFields (json : Json) (expected : List String) : Except String Unit := do
  let fields ← json.getObj?
  let keys := fields.toList.map Prod.fst
  unless keys.length == expected.length && keys.all expected.contains do
    throw s!"expected fields: {expected}"

def readHex (json : Json) : Except String String := do
  let text ← json.getStr?
  unless text.length == 64 && text.toList.all ("0123456789abcdef".contains ·) do
    throw "expected a lowercase 64-digit hexadecimal identity"
  return text

private instance (text : String) : Decidable (SafeSegment text) := by unfold SafeSegment; infer_instance
private instance (text : String) : Decidable (NoDrive text) := by unfold NoDrive; split <;> infer_instance

private def segments (text : String) : List String := (text.toList.splitOn '/').map String.ofList

private theorem joined_segments (text : String) : String.intercalate "/" (segments text) = text := by
  apply String.toList_inj.mp
  simp only [String.toList_intercalate, segments, List.map_map, Function.comp_def, String.toList_ofList,
    List.map_id_fun']
  rw [show ("/" : String).toList = ['/'] from by decide]
  exact List.intercalate_splitOn '/'

def readPackagePath (json : Json) : Except String PackagePath := do
  let text ← json.getStr?
  match divided : segments text with
  | [] => throw "expected a contained package path"
  | first :: rest =>
    if valid : SafeSegment first ∧ (∀ segment ∈ rest, SafeSegment segment) ∧ NoDrive first then
      return ⟨text, first, rest, by rw [← divided]; exact (joined_segments text).symm,
        valid.1, valid.2.1, valid.2.2⟩
    else throw "expected a contained package path"

def readOptional {α : Type} (read : Json → Except String α) : Json → Except String (Option α)
  | .null => pure none
  | json => some <$> read json

def writeOptional {α : Type} (write : α → Json) : Option α → Json
  | none => .null
  | some entry => write entry

def tagged (tag : String) (fields : List (String × Json) := []) : Json :=
  Json.mkObj (("type", .str tag) :: fields)

end PluginSdk.WireJson
