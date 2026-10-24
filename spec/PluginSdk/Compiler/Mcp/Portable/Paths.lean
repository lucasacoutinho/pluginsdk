import Std.Data.String.ToNat
import Init.Data.Char.Lemmas
import PluginSdk.Compiler.Mcp.Paths
import PluginSdk.Compiler.Process.Portable.Files

namespace PluginSdk.Compiler.Mcp.Portable

open PluginSdk.Compiler

private theorem repr_digit {ordinal : Nat} {character : Char}
    (member : character ∈ (Nat.repr ordinal).toList) : character.isDigit = true := by
  rw [Nat.toList_repr] at member
  exact Nat.isDigit_of_mem_toDigits (by omega) (by omega) member

private theorem repr_char_safe {ordinal : Nat} {character : Char}
    (member : character ∈ (Nat.repr ordinal).toList) :
    character ≠ '/' ∧ character ≠ '\\' ∧ character ≠ '\x00' := by
  have digit := repr_digit member
  have bounds := (Char.isDigit_iff_toNat).mp digit
  refine ⟨?_, ?_, ?_⟩
  all_goals intro equal; subst character <;> simp at bounds

private theorem repr_segment_safe_json (ordinal : Nat) :
    SafeSegment (Nat.repr ordinal ++ ".json") := by
  refine ⟨by simp, ?_, ?_, ?_⟩
  · intro equal
    have length := congrArg String.length equal
    simp only [String.length_append] at length
    have nonempty : 0 < (Nat.repr ordinal).length := Nat.length_repr_pos
    have suffix : ".json".length = 5 := by decide
    have dot : ".".length = 1 := by decide
    omega
  · intro equal
    have length := congrArg String.length equal
    simp only [String.length_append] at length
    have nonempty : 0 < (Nat.repr ordinal).length := Nat.length_repr_pos
    have suffix : ".json".length = 5 := by decide
    have dots : "..".length = 2 := by decide
    omega
  intro character member
  have allChars : character ∈ (Nat.repr ordinal).toList ++ ".json".toList := by
    simpa [String.toList_append] using member
  rcases List.mem_append.mp allChars with digit | extension
  · exact repr_char_safe digit
  · simp at extension
    rcases extension with rfl | rfl | rfl | rfl | rfl
    all_goals exact ⟨by decide, by decide, by decide⟩

def dataPath (ordinal : Nat) : PackagePath :=
  let filename := Nat.repr ordinal ++ ".json"
  ⟨String.intercalate "/" [".psdk", "mcp", filename], by
    refine ⟨".psdk", ["mcp", filename], rfl, ?_, ?_, Or.inl (by decide)⟩
    · unfold SafeSegment
      decide
    · intro segment member
      have member' : segment = "mcp" ∨ segment = Nat.repr ordinal ++ ".json" := by
        simpa using member
      rcases member' with rfl | rfl
      · unfold SafeSegment
        decide
      · exact repr_segment_safe_json ordinal⟩

abbrev shellPath (ordinal : Nat) : PackagePath :=
  _root_.PluginSdk.Compiler.Mcp.launcherPath ordinal

abbrev runtimeFile : PackagePath := Process.Portable.runtimeFile

theorem dataPath_value (ordinal : Nat) :
    (dataPath ordinal).value = ".psdk/mcp/" ++ Nat.repr ordinal ++ ".json" := by
  simp only [dataPath, String.intercalate_cons_cons]
  calc
    ".psdk/" ++ ("mcp/" ++ (Nat.repr ordinal ++ ".json")) =
        (".psdk/" ++ "mcp/") ++ (Nat.repr ordinal ++ ".json") := by
      rw [← String.append_assoc]
    _ = ".psdk/mcp/" ++ Nat.repr ordinal ++ ".json" := by
      rw [show ".psdk/" ++ "mcp/" = ".psdk/mcp/" from by decide]
      rw [← String.append_assoc]

theorem dataPath_no_dollar (ordinal : Nat) :
    '$' ∉ (dataPath ordinal).value.toList := by
  intro member
  rw [dataPath_value ordinal] at member
  have chars : '$' ∈ ".psdk/mcp/".toList ++
      ((Nat.repr ordinal).toList ++ ".json".toList) := by
    simpa only [String.toList_append, List.append_assoc] using member
  rcases List.mem_append.mp chars with leading | rest
  · have absent : '$' ∉ ".psdk/mcp/".toList := by decide
    exact absent leading
  · rcases List.mem_append.mp rest with numeral | suffix
    · have digit := repr_digit numeral
      simp at digit
    · simp at suffix

theorem shellPath_no_dollar (ordinal : Nat) :
    '$' ∉ (shellPath ordinal).value.toList :=
  _root_.PluginSdk.Compiler.Mcp.launcherPath_no_dollar ordinal

theorem runtimeFile_no_dollar :
    '$' ∉ runtimeFile.value.toList := Process.Portable.runtimeFile_no_dollar

theorem dataPath_value_injective {left right : Nat}
    (equal : (dataPath left).value = (dataPath right).value) : left = right := by
  rw [dataPath_value left, dataPath_value right] at equal
  have chars := congrArg String.toList equal
  simp only [String.toList_append, List.append_assoc] at chars
  have afterLeading := List.append_cancel_left chars
  have numeralChars := List.append_cancel_right afterLeading
  exact Nat.repr_injective (String.toList_inj.mp numeralChars)

theorem shellPath_value_injective {left right : Nat}
    (equal : (shellPath left).value = (shellPath right).value) : left = right :=
  _root_.PluginSdk.Compiler.Mcp.launcherPath_value_injective equal

theorem shellPath_value (ordinal : Nat) :
    (shellPath ordinal).value = ".psdk/mcp/" ++ Nat.repr ordinal ++ ".sh" := by
  simp [shellPath, _root_.PluginSdk.Compiler.Mcp.launcherPath,
    _root_.PluginSdk.Compiler.Generated.launcherPath_value,
    _root_.PluginSdk.Compiler.Generated.directory]

theorem runtimeFile_value :
    runtimeFile.value = _root_.PluginSdk.Compiler.Process.Portable.runtimePath :=
  Process.Portable.runtimeFile_value

theorem dataPath_ne_shellPath (left right : Nat) :
    (dataPath left).value ≠ (shellPath right).value := by
  intro equal
  have chars := congrArg String.toList equal
  simp only [dataPath_value, shellPath_value, String.toList_append,
    List.append_assoc] at chars
  have tails := List.append_cancel_left chars
  have endings := congrArg List.getLast? tails
  simp at endings

theorem dataPath_ne_runtimeFile (ordinal : Nat) :
    (dataPath ordinal).value ≠ runtimeFile.value := by
  intro equal
  have chars := congrArg String.toList equal
  have atProfile := congrArg (fun value : List Char => value[6]!) chars
  simp [dataPath_value, runtimeFile_value,
    _root_.PluginSdk.Compiler.Process.Portable.runtimePath] at atProfile

theorem shellPath_ne_runtimeFile (ordinal : Nat) :
    (shellPath ordinal).value ≠ runtimeFile.value := by
  intro equal
  have chars := congrArg String.toList equal
  have atProfile := congrArg (fun value : List Char => value[6]!) chars
  simp [shellPath_value, runtimeFile_value,
    _root_.PluginSdk.Compiler.Process.Portable.runtimePath] at atProfile

end PluginSdk.Compiler.Mcp.Portable
