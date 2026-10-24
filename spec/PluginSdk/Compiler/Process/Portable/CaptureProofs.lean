import Std.Data.String.ToNat
import Init.Data.Char.Lemmas
import PluginSdk.Compiler.Process.LauncherProofs
import PluginSdk.Compiler.Process.Portable.Captures
import PluginSdk.Compiler.Process.Portable.Model
import PluginSdk.Compiler.Process.Portable.Properties

namespace PluginSdk.Compiler.Process.Portable.CaptureProofs

open Launcher

private def foldChar (character : Char) : Char :=
  if character.toNat < 128 then character.toLower else character

private theorem repr_digit {index : Nat} {character : Char}
    (member : character ∈ (Nat.repr index).toList) : character.isDigit = true := by
  rw [Nat.toList_repr] at member
  exact Nat.isDigit_of_mem_toDigits (by omega) (by omega) member

private theorem foldChar_digit {character : Char} (digit : character.isDigit = true) :
    foldChar character = character := by
  have bounds := (Char.isDigit_iff_toNat).mp digit
  have nineLtAscii : '9'.toNat < 128 := by decide
  have small : character.toNat < 128 := by omega
  have notUpper : ¬ (65 ≤ character.val ∧ character.val ≤ 90) := by
    intro upper
    have digitBounds : '0'.val ≤ character.val ∧ character.val ≤ '9'.val := by
      simp only [Char.isDigit, Bool.and_eq_true, decide_eq_true_eq] at digit
      exact digit
    have nineLtA : '9'.val < 65 := by decide
    have upperNat : character.toNat ≤ 'Z'.toNat := by
      simpa [UInt32.le_iff_toNat_le] using upper.2
    have lowerNat : 'A'.toNat ≤ character.toNat := by
      simpa [UInt32.le_iff_toNat_le] using upper.1
    have digitUpperNat : character.toNat ≤ '9'.toNat := by
      simpa [UInt32.le_iff_toNat_le] using digitBounds.2
    have nineLtANat : '9'.toNat < 'A'.toNat := by decide
    omega
  simp [foldChar, small, Char.toLower, notUpper]

private theorem foldedDigits (digits : List Char)
    (allDigits : ∀ character ∈ digits, character.isDigit = true) :
    digits.map foldChar = digits := by
  induction digits with
  | nil => rfl
  | cons head tail ih =>
      have headFold := foldChar_digit (allDigits head (by simp))
      have tailFold := ih (by
        intro character member
        exact allDigits character (by simp [member]))
      simp [headFold, tailFold]

private def foldedMarker : Kind → Char
  | .raw => 'a'
  | .check => 'b'

private def EnvironmentCharacter (character : Char) : Prop :=
  AsciiLetter character ∨ ('0' ≤ character ∧ character ≤ '9') ∨ character = '_'

private theorem digit_environment_character {character : Char}
    (digit : character.isDigit = true) : EnvironmentCharacter character := by
  have bounds := (Char.isDigit_iff_toNat).mp digit
  refine Or.inr (Or.inl ⟨?_, ?_⟩)
  · apply (Char.le_def).2
    exact (UInt32.le_iff_toNat_le).2 (by simpa using bounds.1)
  · apply (Char.le_def).2
    exact (UInt32.le_iff_toNat_le).2 (by simpa using bounds.2)

private theorem name_chars (names : List EnvironmentName) (kind : Kind) (index : Nat) :
    (Captures.name names kind index).toList =
      "PSDK_".toList ++ List.replicate (bound names) '_' ++
        [marker kind, '_'] ++ (Nat.repr index).toList := by
  simp [Captures.name, String.toList_append, marker, List.append_assoc]

private theorem asciiFold_chars (value : String) :
    (asciiFold value).toList = value.toList.map foldChar := by
  simp [asciiFold, foldChar, String.toList_map]

private theorem folded_name_chars (names : List EnvironmentName) (kind : Kind) (index : Nat) :
    (asciiFold (Captures.name names kind index)).toList =
      ['p', 's', 'd', 'k', '_'] ++ List.replicate (bound names) '_' ++
        [foldedMarker kind, '_'] ++ (Nat.repr index).toList := by
  rw [asciiFold_chars, name_chars]
  simp only [List.map_append, List.map_replicate]
  have digitsFold : (Nat.repr index).toList.map foldChar = (Nat.repr index).toList :=
    foldedDigits (Nat.repr index).toList (by
      intro character member
      exact repr_digit member)
  rw [digitsFold]
  cases kind <;> simp [foldChar, foldedMarker, marker]

private theorem name_valid (names : List EnvironmentName) (kind : Kind) (index : Nat) :
    ValidEnvironmentName (Captures.name names kind index) := by
  let tail := ['S', 'D', 'K', '_'] ++ List.replicate (bound names) '_' ++
    [marker kind, '_'] ++ (Nat.repr index).toList
  have chars : (Captures.name names kind index).toList = 'P' :: tail := by
    rw [name_chars]
    simp [tail, List.append_assoc]
  have fixedCharacters : ∀ character ∈ ['S', 'D', 'K', '_'],
      EnvironmentCharacter character := by
    intro character member
    simp only [List.mem_cons, List.not_mem_nil] at member
    rcases member with first | second | third | underscore
    · subst character
      simp [EnvironmentCharacter, AsciiLetter]
    · subst character
      simp [EnvironmentCharacter, AsciiLetter]
    · subst character
      simp [EnvironmentCharacter, AsciiLetter]
    · simp at underscore
      subst character
      simp [EnvironmentCharacter, AsciiLetter]
  have tailCharacters : ∀ character ∈ tail, EnvironmentCharacter character := by
    intro character member
    rcases List.mem_append.mp member with beforeDigits | numeral
    · rcases List.mem_append.mp beforeDigits with beforeMarkers | markerMember
      · rcases List.mem_append.mp beforeMarkers with fixed | repeated
        · exact fixedCharacters character fixed
        · rcases List.mem_replicate.mp repeated with ⟨_, rfl⟩
          simp [EnvironmentCharacter, AsciiLetter]
      · simp only [List.mem_cons, List.not_mem_nil] at markerMember
        rcases markerMember with markerValue | underscore
        · cases kind <;> simp [marker] at markerValue <;>
            subst character <;> simp [EnvironmentCharacter, AsciiLetter]
        · simp at underscore
          subst character
          simp [EnvironmentCharacter, AsciiLetter]
    · exact digit_environment_character (repr_digit numeral)
  unfold ValidEnvironmentName
  exact ⟨'P', tail, chars, by simp [AsciiLetter], tailCharacters⟩

private theorem asciiFold_chars_length (value : String) :
    (asciiFold value).toList.length = value.toList.length := by
  rw [asciiFold_chars]
  simp

private theorem folded_name_length (names : List EnvironmentName) (kind : Kind) (index : Nat) :
    (asciiFold (Captures.name names kind index)).toList.length =
      5 + bound names + 2 + (Nat.repr index).toList.length := by
  rw [folded_name_chars]
  simp [List.length_replicate]
  omega

private theorem name_ne_requested (names : List EnvironmentName) (kind : Kind) (index : Nat)
    (requested : EnvironmentName) (member : requested ∈ names) :
    asciiFold (Captures.name names kind index) ≠ asciiFold requested.value := by
  intro equal
  have lengthEqual := congrArg (fun value : String => value.toList.length) equal
  rw [folded_name_length, asciiFold_chars_length] at lengthEqual
  have requestedLength := Launcher.Proofs.bound_covers names requested member
  have reprPositive : 0 < (Nat.repr index).toList.length := by
    simpa [String.length] using (Nat.length_repr_pos (n := index))
  omega

private theorem folded_name_injective (names : List EnvironmentName)
    (leftKind rightKind : Kind) (leftIndex rightIndex : Nat)
    (equal : asciiFold (Captures.name names leftKind leftIndex) =
      asciiFold (Captures.name names rightKind rightIndex)) :
    leftKind = rightKind ∧ leftIndex = rightIndex := by
  have chars := congrArg String.toList equal
  rw [folded_name_chars, folded_name_chars] at chars
  have charsGrouped :
      (['p', 's', 'd', 'k', '_'] ++ List.replicate (bound names) '_') ++
          ([foldedMarker leftKind, '_'] ++ (Nat.repr leftIndex).toList) =
        (['p', 's', 'd', 'k', '_'] ++ List.replicate (bound names) '_') ++
          ([foldedMarker rightKind, '_'] ++ (Nat.repr rightIndex).toList) := by
    simpa only [List.append_assoc] using chars
  have suffix := List.append_cancel_left
    (as := ['p', 's', 'd', 'k', '_'] ++ List.replicate (bound names) '_') charsGrouped
  cases leftKind <;> cases rightKind
  · have reprEq := List.append_cancel_left (as := [foldedMarker Kind.raw, '_']) suffix
    exact ⟨rfl, Nat.repr_injective (String.toList_inj.mp reprEq)⟩
  · simp [foldedMarker] at suffix
  · simp [foldedMarker] at suffix
  · have reprEq := List.append_cancel_left (as := [foldedMarker Kind.check, '_']) suffix
    exact ⟨rfl, Nat.repr_injective (String.toList_inj.mp reprEq)⟩

private theorem idxOf_eq_implies_eq {α : Type} [BEq α] [LawfulBEq α] [EquivBEq α]
    {values : List α} {left right : α}
    (leftMember : left ∈ values) (rightMember : right ∈ values)
    (equal : values.idxOf left = values.idxOf right) : left = right := by
  have leftIndex := List.idxOf_lt_length_of_mem leftMember
  have rightIndex := List.idxOf_lt_length_of_mem rightMember
  have leftValue : values[values.idxOf left]? = some left := by
    rw [List.getElem?_eq_getElem leftIndex, List.getElem_idxOf leftIndex]
  have rightValue : values[values.idxOf right]? = some right := by
    rw [List.getElem?_eq_getElem rightIndex, List.getElem_idxOf rightIndex]
  rw [equal] at leftValue
  exact Option.some.inj (leftValue.symm.trans rightValue)

private def foldedPair (names : List EnvironmentName) (index : Nat) : List String :=
  [asciiFold (Captures.name names .raw index), asciiFold (Captures.name names .check index)]

private theorem foldedPair_nodup (names : List EnvironmentName) (index : Nat) :
    (foldedPair names index).Nodup := by
  change (asciiFold (Captures.name names .raw index) ::
    [asciiFold (Captures.name names .check index)]).Nodup
  rw [List.nodup_cons]
  constructor
  · intro member
    simp only [List.mem_singleton] at member
    have kindEq := (folded_name_injective names .raw .check index index member).1
    exact (by decide : Kind.raw ≠ Kind.check) kindEq
  · simp

private theorem foldedPair_mem_form {names : List EnvironmentName} {index : Nat}
    {value : String} (member : value ∈ foldedPair names index) :
    ∃ kind, value = asciiFold (Captures.name names kind index) := by
  simp [foldedPair] at member
  rcases member with raw | check
  · exact ⟨.raw, raw⟩
  · exact ⟨.check, check⟩

private theorem foldedPairs_nodup_aux (names : List EnvironmentName)
    (indices sources : List EnvironmentName)
    (sourceMember : ∀ source ∈ sources, source ∈ indices) (distinct : sources.Nodup) :
    (sources.flatMap (fun source => foldedPair names (indices.idxOf source))).Nodup := by
  induction sources with
  | nil => simp [foldedPair]
  | cons source rest ih =>
      obtain ⟨sourceNotInRest, restDistinct⟩ := List.nodup_cons.mp distinct
      rw [List.flatMap_cons]
      apply List.nodup_append.mpr
      refine ⟨foldedPair_nodup names (indices.idxOf source),
        ih (fun candidate member => sourceMember candidate (List.mem_cons.mpr (Or.inr member)))
          restDistinct, ?_⟩
      · intro left leftMember right rightMember equal
        obtain ⟨other, otherMember, rightWithin⟩ := List.mem_flatMap.mp rightMember
        have sourceNe : source ≠ other := by
          intro same
          exact sourceNotInRest (same ▸ otherMember)
        have leftForm := foldedPair_mem_form leftMember
        have rightForm := foldedPair_mem_form rightWithin
        obtain ⟨leftKind, leftEq⟩ := leftForm
        obtain ⟨rightKind, rightEq⟩ := rightForm
        have namesEqual : asciiFold (Captures.name names leftKind
            (indices.idxOf source)) =
            asciiFold (Captures.name names rightKind (indices.idxOf other)) :=
          leftEq.symm.trans (equal.trans rightEq)
        have indexEqual := (folded_name_injective names leftKind rightKind
          (indices.idxOf source) (indices.idxOf other) namesEqual).2
        have sourceEqual := idxOf_eq_implies_eq (sourceMember source (List.mem_cons.mpr (Or.inl rfl)))
          (sourceMember other (List.mem_cons.mpr (Or.inr otherMember))) indexEqual
        exact sourceNe sourceEqual

private theorem foldedPairs_nodup (names : List EnvironmentName)
    (sources : List EnvironmentName) (distinct : sources.Nodup) :
    (sources.flatMap (fun source => foldedPair names (sources.idxOf source))).Nodup :=
  foldedPairs_nodup_aux names sources sources (fun _ member => member) distinct

private theorem sourceNames_nodup (plan : Plan) :
    (Launcher.sourceNames plan).Nodup := by
  have orderedDistinct := ordered_perm (fun name : EnvironmentName => [name.value])
    (unique ((Launcher.words plan).flatMap Launcher.references))
  exact orderedDistinct.nodup_iff.mpr (unique_nodup _)

private theorem capture_names_eq (plan : Plan) :
    ((Captures.compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])) =
      (Launcher.sourceNames plan).flatMap (fun source =>
        [Captures.name (Launcher.requestedNames plan) .raw
          ((Launcher.sourceNames plan).idxOf source),
         Captures.name (Launcher.requestedNames plan) .check
          ((Launcher.sourceNames plan).idxOf source)]) := by
  simp [Captures.compile, Launcher.compile, List.flatMap_map, Function.comp_def,
    Captures.rename, Launcher.captureFor]

theorem names_safe (plan : Plan) :
    let names := (Captures.compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])
    (∀ name ∈ names, ValidEnvironmentName name) ∧
    names.Pairwise (fun left right => asciiFold left ≠ asciiFold right) ∧
    ∀ generated ∈ names, ∀ requested ∈ Launcher.requestedNames plan,
      asciiFold generated ≠ asciiFold requested.value := by
  change
    (∀ name ∈ (Captures.compile plan).captures.flatMap
      (fun capture => [capture.raw, capture.check]), ValidEnvironmentName name) ∧
    ((Captures.compile plan).captures.flatMap
      (fun capture => [capture.raw, capture.check])).Pairwise
      (fun left right => asciiFold left ≠ asciiFold right) ∧
    ∀ generated ∈ (Captures.compile plan).captures.flatMap
      (fun capture => [capture.raw, capture.check]),
      ∀ requested ∈ Launcher.requestedNames plan,
        asciiFold generated ≠ asciiFold requested.value
  let sources := Launcher.sourceNames plan
  let requested := Launcher.requestedNames plan
  have sourcesDistinct : sources.Nodup := sourceNames_nodup plan
  have generatedEq :
      ((Captures.compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])) =
        sources.flatMap (fun source =>
          [Captures.name requested .raw (sources.idxOf source),
           Captures.name requested .check (sources.idxOf source)]) := by
    exact capture_names_eq plan
  refine ⟨?_, ?_, ?_⟩
  · intro generated member
    rw [generatedEq] at member
    obtain ⟨source, _, pairMember⟩ := List.mem_flatMap.mp member
    simp at pairMember
    rcases pairMember with raw | check
    · rw [raw]
      exact name_valid requested .raw (sources.idxOf source)
    · rw [check]
      exact name_valid requested .check (sources.idxOf source)
  · rw [generatedEq]
    have foldedDistinct :
        (sources.flatMap (fun source =>
          [asciiFold (Captures.name requested .raw (sources.idxOf source)),
           asciiFold (Captures.name requested .check (sources.idxOf source))])).Nodup := by
      simpa [foldedPair] using foldedPairs_nodup requested sources sourcesDistinct
    have foldedDistinctMapped :
        ((sources.flatMap (fun source =>
          [Captures.name requested .raw (sources.idxOf source),
           Captures.name requested .check (sources.idxOf source)])).map asciiFold).Nodup := by
      simpa only [List.map_flatMap, List.map_cons, List.map_nil] using foldedDistinct
    exact (List.pairwise_map (f := asciiFold)
      (R := fun left right : String => left ≠ right)).mp
      (List.nodup_iff_pairwise_ne.mp foldedDistinctMapped)
  · intro generated member requestedName requestedMember
    rw [generatedEq] at member
    obtain ⟨source, _, pairMember⟩ := List.mem_flatMap.mp member
    simp at pairMember
    rcases pairMember with raw | check
    · rw [raw]
      exact name_ne_requested requested .raw (sources.idxOf source) requestedName requestedMember
    · rw [check]
      exact name_ne_requested requested .check (sources.idxOf source) requestedName requestedMember

theorem PL4_capture_names :
    PluginSdk.Compiler.Process.Portable.PL4_capture_names
      PluginSdk.Compiler.Process.Portable.model := by
  intro plan
  exact names_safe plan

end PluginSdk.Compiler.Process.Portable.CaptureProofs
