import Std.Data.String.ToNat
import Init.Data.Char.Lemmas
import PluginSdk.Compiler.Canonical

namespace PluginSdk.Compiler.Generated

inductive Area where
  | mcp
  | hooks
  deriving DecidableEq

def directory : Area → String
  | .mcp => "mcp"
  | .hooks => "hooks"

private def pathPrefix (area : Area) : String := ".psdk/" ++ directory area ++ "/"

private theorem repr_digit {index : Nat} {character : Char}
    (member : character ∈ (Nat.repr index).toList) : character.isDigit = true := by
  rw [Nat.toList_repr] at member
  exact Nat.isDigit_of_mem_toDigits (by omega) (by omega) member

private theorem repr_char_safe {index : Nat} {character : Char}
    (member : character ∈ (Nat.repr index).toList) :
    character ≠ '/' ∧ character ≠ '\\' ∧ character ≠ '\x00' := by
  have digit := repr_digit member
  have bounds := (Char.isDigit_iff_toNat).mp digit
  refine ⟨?_, ?_, ?_⟩
  all_goals intro equal; subst character <;> simp at bounds

private theorem repr_segment_safe (index : Nat) : SafeSegment (Nat.repr index ++ ".sh") := by
  refine ⟨by simp, ?_, ?_, ?_⟩
  · intro equal
    have length := congrArg String.length equal
    simp only [String.length_append] at length
    have nonempty : 0 < (Nat.repr index).length := Nat.length_repr_pos
    have suffix : ".sh".length = 3 := by decide
    have dot : ".".length = 1 := by decide
    omega
  · intro equal
    have length := congrArg String.length equal
    simp only [String.length_append] at length
    have nonempty : 0 < (Nat.repr index).length := Nat.length_repr_pos
    have suffix : ".sh".length = 3 := by decide
    have dots : "..".length = 2 := by decide
    omega
  intro character member
  have allChars : character ∈ (Nat.repr index).toList ++ ".sh".toList := by
    simpa [String.toList_append] using member
  rcases List.mem_append.mp allChars with digit | extension
  · exact repr_char_safe digit
  · simp at extension
    rcases extension with rfl | rfl | rfl
    · exact ⟨by decide, by decide, by decide⟩
    · exact ⟨by decide, by decide, by decide⟩
    · exact ⟨by decide, by decide, by decide⟩

def launcherPath (area : Area) (index : Nat) : PackagePath :=
  ⟨pathPrefix area ++ Nat.repr index ++ ".sh", by
    refine ⟨".psdk", [directory area, Nat.repr index ++ ".sh"], ?_, ?_, ?_, Or.inl (by decide)⟩
    · simp [pathPrefix, String.intercalate_cons_cons, String.append_assoc]
    · unfold SafeSegment
      decide
    · intro segment member
      have member' : segment = directory area ∨ segment = Nat.repr index ++ ".sh" := by
        simpa using member
      rcases member' with rfl | rfl
      · cases area <;> unfold directory SafeSegment <;> decide
      · exact repr_segment_safe index⟩

theorem launcherPath_value (area : Area) (index : Nat) :
    (launcherPath area index).value = ".psdk/" ++ directory area ++ "/" ++ Nat.repr index ++ ".sh" := rfl

private theorem launcherPath_no_char (area : Area) (index : Nat) (character : Char)
    (notDigit : character.isDigit = false)
    (notPrefix : character ∉ (pathPrefix area).toList)
    (notSuffix : character ∉ ".sh".toList) :
    character ∉ (launcherPath area index).value.toList := by
  intro member
  have chars : character ∈ (pathPrefix area).toList ++
      ((Nat.repr index).toList ++ ".sh".toList) := by
    simpa only [launcherPath, String.toList_append, List.append_assoc] using member
  rcases List.mem_append.mp chars with leading | rest
  · exact notPrefix leading
  · rcases List.mem_append.mp rest with numeral | suffix
    · have digit := repr_digit numeral
      simp [notDigit] at digit
    · exact notSuffix suffix

theorem launcherPath_no_dollar (area : Area) (index : Nat) :
    '$' ∉ (launcherPath area index).value.toList := by
  apply launcherPath_no_char area index '$' (by decide) _ (by decide)
  cases area <;> unfold pathPrefix directory <;> decide

theorem launcherPath_no_brace (area : Area) (index : Nat) :
    '{' ∉ (launcherPath area index).value.toList := by
  apply launcherPath_no_char area index '{' (by decide) _ (by decide)
  cases area <;> unfold pathPrefix directory <;> decide

theorem launcherPath_value_injective (area : Area) {left right : Nat}
    (equal : (launcherPath area left).value = (launcherPath area right).value) : left = right := by
  have chars := congrArg String.toList equal
  simp only [launcherPath, String.toList_append, List.append_assoc] at chars
  have afterLeading := List.append_cancel_left chars
  have numeralChars := List.append_cancel_right afterLeading
  exact Nat.repr_injective (String.toList_inj.mp numeralChars)

private theorem repr_segment_safe_json (index : Nat) : SafeSegment (Nat.repr index ++ ".json") := by
  refine ⟨by simp, ?_, ?_, ?_⟩
  · intro equal
    have length := congrArg String.length equal
    simp only [String.length_append] at length
    have nonempty : 0 < (Nat.repr index).length := Nat.length_repr_pos
    have suffix : ".json".length = 5 := by decide
    have dot : ".".length = 1 := by decide
    omega
  · intro equal
    have length := congrArg String.length equal
    simp only [String.length_append] at length
    have nonempty : 0 < (Nat.repr index).length := Nat.length_repr_pos
    have suffix : ".json".length = 5 := by decide
    have dots : "..".length = 2 := by decide
    omega
  intro character member
  have allChars : character ∈ (Nat.repr index).toList ++ ".json".toList := by
    simpa [String.toList_append] using member
  rcases List.mem_append.mp allChars with digit | extension
  · exact repr_char_safe digit
  · simp at extension
    rcases extension with rfl | rfl | rfl | rfl | rfl
    all_goals exact ⟨by decide, by decide, by decide⟩

def dataPath (area : Area) (index : Nat) : PackagePath :=
  ⟨pathPrefix area ++ Nat.repr index ++ ".json", by
    refine ⟨".psdk", [directory area, Nat.repr index ++ ".json"], ?_, ?_, ?_, Or.inl (by decide)⟩
    · simp [pathPrefix, String.intercalate_cons_cons, String.append_assoc]
    · unfold SafeSegment
      decide
    · intro segment member
      have member' : segment = directory area ∨ segment = Nat.repr index ++ ".json" := by
        simpa using member
      rcases member' with rfl | rfl
      · cases area <;> unfold directory SafeSegment <;> decide
      · exact repr_segment_safe_json index⟩

theorem dataPath_value (area : Area) (index : Nat) :
    (dataPath area index).value = ".psdk/" ++ directory area ++ "/" ++ Nat.repr index ++ ".json" := rfl

theorem dataPath_no_dollar (area : Area) (index : Nat) :
    '$' ∉ (dataPath area index).value.toList := by
  intro member
  have chars : '$' ∈ (pathPrefix area).toList ++
      ((Nat.repr index).toList ++ ".json".toList) := by
    simpa only [dataPath, String.toList_append, List.append_assoc] using member
  rcases List.mem_append.mp chars with leading | rest
  · have absent : '$' ∉ (pathPrefix area).toList := by
      cases area <;> unfold pathPrefix directory <;> decide
    exact absent leading
  · rcases List.mem_append.mp rest with numeral | suffix
    · have digit := repr_digit numeral
      simp at digit
    · simp at suffix

theorem dataPath_value_injective (area : Area) {left right : Nat}
    (equal : (dataPath area left).value = (dataPath area right).value) : left = right := by
  have chars := congrArg String.toList equal
  simp only [dataPath, String.toList_append, List.append_assoc] at chars
  have afterLeading := List.append_cancel_left chars
  have numeralChars := List.append_cancel_right afterLeading
  exact Nat.repr_injective (String.toList_inj.mp numeralChars)

def enumerateFrom {α : Type} (start : Nat) : List α → List (Nat × α)
  | [] => []
  | head :: tail => (start, head) :: enumerateFrom (start + 1) tail

private theorem enumerateFrom_mem_ge (start : Nat) {α : Type} (values : List α)
    {entry : Nat × α} (member : entry ∈ enumerateFrom start values) : start ≤ entry.1 := by
  induction values generalizing start with
  | nil => simp [enumerateFrom] at member
  | cons head tail inductionHypothesis =>
    simp only [enumerateFrom, List.mem_cons] at member
    rcases member with equal | member
    · cases equal
      omega
    · exact Nat.le_trans (by omega) (inductionHypothesis (start := start + 1) member)

theorem enumerateFrom_pairwise {α : Type} (start : Nat) (values : List α) :
    (enumerateFrom start values).Pairwise (fun left right => left.1 < right.1) := by
  induction values generalizing start with
  | nil => simp [enumerateFrom]
  | cons head tail inductionHypothesis =>
    simp only [enumerateFrom, List.pairwise_cons]
    constructor
    · intro entry member
      have lower : start + 1 ≤ entry.1 := enumerateFrom_mem_ge (start + 1) tail member
      omega
    · exact inductionHypothesis (start := start + 1)

end PluginSdk.Compiler.Generated
