import Std.Data.TreeMap.Raw.WF
import Std.Data.TreeMap.Raw.Lemmas
import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Format
import PluginSdk.Compiler.Paths

namespace PluginSdk.Compiler

open Lean

private theorem field_mkObj_lookup (rows : List (String × Json)) (key : String) (value : Json) :
    Field (Json.mkObj rows) key value ↔
      (Std.TreeMap.Raw.ofList rows : Std.TreeMap.Raw String Json compare).get? key = some value := by
  change (match (Std.TreeMap.Raw.ofList rows : Std.TreeMap.Raw String Json compare).get? key with
    | some found => Except.ok found
    | none => Except.error s!"property not found: {key}") = Except.ok value ↔ _
  cases (Std.TreeMap.Raw.ofList rows : Std.TreeMap.Raw String Json compare).get? key <;> simp

theorem objectKeys_mkObj (rows : List (String × Json)) :
    ObjectKeys (Json.mkObj rows) (rows.map Prod.fst) := by
  refine ⟨⟨_, rfl⟩, ?_⟩
  intro key
  constructor
  · rintro ⟨value, field⟩
    have lookup := (field_mkObj_lookup rows key value).mp field
    have present : ((Std.TreeMap.Raw.ofList rows : Std.TreeMap.Raw String Json compare)[key]?.isSome) = true := by
      rw [← Std.TreeMap.Raw.get?_eq_getElem?, lookup]
      rfl
    have member := (Std.TreeMap.Raw.isSome_getElem?_iff_mem (Std.TreeMap.Raw.WF.ofList (l := rows))).mp present
    rw [Std.TreeMap.Raw.mem_ofList] at member
    simpa using member
  · intro member
    have rawMember : key ∈ (Std.TreeMap.Raw.ofList rows : Std.TreeMap.Raw String Json compare) := by
      rw [Std.TreeMap.Raw.mem_ofList]
      simpa using member
    have present := (Std.TreeMap.Raw.mem_iff_isSome_getElem? (Std.TreeMap.Raw.WF.ofList (l := rows))).mp rawMember
    obtain ⟨value, lookup⟩ := Option.isSome_iff_exists.mp present
    exact ⟨value, (field_mkObj_lookup rows key value).mpr lookup⟩

theorem field_mkObj_of_mem {rows : List (String × Json)} (keys : (rows.map Prod.fst).Nodup)
    {key : String} {value : Json} (member : (key, value) ∈ rows) : Field (Json.mkObj rows) key value := by
  have distinct : rows.Pairwise (fun a b => ¬ compare a.1 b.1 = .eq) :=
    (List.pairwise_map.mp keys).imp (fun different equal => different (Std.LawfulEqCmp.compare_eq_iff_eq.mp equal))
  exact (field_mkObj_lookup rows key value).mpr
    (Std.TreeMap.Raw.getElem?_ofList_of_mem (k_eq := by simp) distinct member)

def object (rows : List (String × Json)) : JsonObject :=
  ⟨Json.mkObj (ordered (fun row => [row.1]) rows), ⟨_, rfl⟩⟩

theorem object_keys (rows : List (String × Json)) : ObjectKeys (object rows).value (rows.map Prod.fst) := by
  have keys := objectKeys_mkObj (ordered (fun row => [row.1]) rows)
  refine ⟨keys.1, fun key => (keys.2 key).trans ?_⟩
  exact ((ordered_perm (fun row => [row.1]) rows).map Prod.fst).mem_iff

theorem object_field {rows : List (String × Json)} (keys : (rows.map Prod.fst).Nodup)
    {key : String} {value : Json} (member : (key, value) ∈ rows) : Field (object rows).value key value := by
  apply field_mkObj_of_mem (keys.perm ((ordered_perm (fun row => [row.1]) rows).map Prod.fst).symm)
  exact (mem_ordered ..).mpr member

theorem object_eq_of_perm {left right : List (String × Json)} (permutation : left.Perm right)
    (keys : (left.map Prod.fst).Nodup) : object left = object right := by
  have equal : ordered (fun row : String × Json => [row.1]) left = ordered (fun row => [row.1]) right := by
    apply ordered_eq_of_perm _ permutation
    intro a aMember b bMember sameKey
    exact key_injective_on Prod.fst (List.pairwise_map.mp keys) a aMember b
      (permutation.symm.subset bMember) (List.singleton_inj.mp sameKey)
  simp only [object, JsonObject.mk.injEq]
  exact congrArg Json.mkObj equal

def manifestRows (input : RenderInput) : List (String × Json) :=
  [("name", .str input.metadata.id), ("version", .str input.metadata.version),
    ("description", .str input.metadata.description)]

def manifest (input : RenderInput) : RenderedFile :=
  .json (manifestFile input.format) (object (manifestRows input))

def headerText : HeaderValue → String
  | .literal value => value
  | .environment name literalPrefix => literalPrefix ++ "${" ++ name ++ "}"

def headerRows (source : RemoteMcp) : List (String × Json) :=
  source.headers.map fun (name, value) => (name, .str (headerText value))

def serverRows (format : Format) (source : RemoteMcp) : List (String × Json) :=
  (if format = .codex then [] else [("type", .str (transport format))]) ++
    [("url", .str source.url), (headerKey format, (object (headerRows source)).value)]

def mcpRows (input : RenderInput) : List (String × Json) :=
  [("mcpServers", (object (input.mcp.map fun (name, source) =>
    (name, (object (serverRows input.format source)).value))).value)]

def mcp (input : RenderInput) : RenderedFile :=
  .json (mcpFile input.format) (object (mcpRows input))

end PluginSdk.Compiler
