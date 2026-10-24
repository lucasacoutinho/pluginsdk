import PluginSdk.Compiler.Process.LauncherProofs

namespace PluginSdk.Compiler.Process.Launcher.Proofs

private theorem prepend_valid (value : String) (valid : ValidEnvironmentName value) :
    ValidEnvironmentName ("S" ++ value) := by
  rcases valid with ⟨first, rest, chars, firstValid, restValid⟩
  refine ⟨'S', value.toList, ?_, ?_, ?_⟩
  · simp [String.toList_append]
  · simp [AsciiLetter]
  · intro character member
    rw [chars] at member
    rcases List.mem_cons.mp member with equal | tailMember
    · subst character
      rcases firstValid with letter | underscore
      · exact Or.inl letter
      · exact Or.inr (Or.inr underscore)
    · exact restValid character tailMember

private theorem transfer_ne_capture (names : List EnvironmentName)
    (name source : EnvironmentName) (kind : Kind) :
    "S" ++ freshName names .raw name ≠ freshName names kind source := by
  intro equal
  have chars := congrArg String.toList equal
  simp [freshName, String.toList_append] at chars

theorem L7_transfer_names_safe : L7_transfer_names_safe model := by
  intro plan
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro name
    exact prepend_valid _ (freshName_valid (requestedNames plan) .raw name)
  · intro name requested member equal
    have lengths := congrArg (fun value : String => value.toList.length) equal
    change ("S" ++ freshName (requestedNames plan) .raw name).toList.length =
      requested.value.toList.length at lengths
    simp only [String.toList_append, List.length_append] at lengths
    rw [freshName_length] at lengths
    have requestedLength := bound_covers (requestedNames plan) requested member
    have one : "S".toList.length = 1 := rfl
    rw [one] at lengths
    omega
  · intro name capture member
    change capture ∈ (sourceNames plan).map (captureFor (requestedNames plan)) at member
    obtain ⟨source, _, equal⟩ := List.mem_map.mp member
    subst capture
    exact ⟨transfer_ne_capture (requestedNames plan) name source .raw,
      transfer_ne_capture (requestedNames plan) name source .check⟩
  · intro left right equal
    change "S" ++ freshName (requestedNames plan) .raw left =
      "S" ++ freshName (requestedNames plan) .raw right at equal
    have chars := congrArg String.toList equal
    simp only [String.toList_append] at chars
    have suffix := List.append_cancel_left chars
    exact (freshName_injective (requestedNames plan) .raw .raw left right
      (String.toList_inj.mp suffix)).2

end PluginSdk.Compiler.Process.Launcher.Proofs
