import PluginSdk.FileRead.Model
import PluginSdk.FileRead.Properties

namespace PluginSdk.FileRead.Proofs

theorem V1_plain_parse_exact : _root_.PluginSdk.FileRead.V1_plain_parse_exact model := by
  intro raw path
  constructor
  · intro parsed
    change parsePath raw = .plain path at parsed
    unfold parsePath at parsed
    split at parsed
    · rename_i volume parts split
      split at parsed
      · contradiction
      · rename_i available
        split at parsed
        · contradiction
        · rename_i noStream
          split at parsed
          · rename_i valid
            have volumeValid : supportedVolume volume = true := by
              cases volumeState : supportedVolume volume <;> simp_all
            have nonempty : parts.isEmpty = false := by
              cases emptyState : parts.isEmpty <;> simp_all
            have noColon : parts.any containsColon = false := by
              cases streamState : parts.any containsColon <;> simp_all
            exact ⟨volume, parts, split, volumeValid, nonempty, noColon, valid,
              (ParsedPath.plain.inj parsed).symm⟩
          · contradiction
    · contradiction
  · rintro ⟨volume, parts, split, volumeValid, nonempty, noStream, valid, pathEq⟩
    change parsePath raw = .plain path
    simp only [parsePath, split, volumeValid, nonempty, Bool.not_true, Bool.false_or,
      Bool.false_eq_true, ↓reduceIte, noStream, valid, pathEq]

theorem V2_containment_exact : _root_.PluginSdk.FileRead.V2_containment_exact model := by
  intro root file
  change decide (Contained root file) = true ↔ Contained root file
  simp

theorem V3_admission_exact : _root_.PluginSdk.FileRead.V3_admission_exact model := by
  intro input
  change admit input = .accepted ↔ Admissible input
  by_cases available : Available input <;>
    by_cases regular : RegularFiles input <;>
    by_cases unsupported : UnsupportedPath input <;>
    by_cases stream : StreamPath input <;>
    by_cases rootBound : RootBound input <;>
    by_cases filesContained : FilesContained input <;>
    by_cases stable : StableRead input <;>
    simp [admit, Admissible, available, regular, unsupported, stream, rootBound,
      filesContained, stable]

private theorem refusal_of_not_admissible (input : ReadInput)
    (notAdmissible : ¬ Admissible input) : admit input ≠ .accepted := by
  intro accepted
  exact notAdmissible ((V3_admission_exact input).mp accepted)

theorem V4_unavailable_refuses : _root_.PluginSdk.FileRead.V4_unavailable_refuses model := by
  intro input unavailable
  apply refusal_of_not_admissible input
  intro admissible
  exact unavailable admissible.1

theorem V5_stream_refuses : _root_.PluginSdk.FileRead.V5_stream_refuses model := by
  intro input stream
  apply refusal_of_not_admissible input
  intro admissible
  rcases admissible with ⟨_, _, _, noStream, _, _, _⟩
  exact noStream stream

theorem V6_root_change_refuses : _root_.PluginSdk.FileRead.V6_root_change_refuses model := by
  intro input rootChanged
  apply refusal_of_not_admissible input
  intro admissible
  rcases admissible with ⟨_, _, _, _, rootBound, _, _⟩
  exact rootChanged rootBound

theorem V7_escape_refuses : _root_.PluginSdk.FileRead.V7_escape_refuses model := by
  intro input outside
  apply refusal_of_not_admissible input
  intro admissible
  rcases admissible with ⟨_, _, _, _, _, filesContained, _⟩
  exact outside filesContained

theorem V8_metadata_change_refuses : _root_.PluginSdk.FileRead.V8_metadata_change_refuses model := by
  intro input changed
  apply refusal_of_not_admissible input
  intro admissible
  rcases admissible with ⟨_, _, _, _, _, _, stableRead⟩
  exact changed stableRead

theorem V9_non_regular_refuses : _root_.PluginSdk.FileRead.V9_non_regular_refuses model := by
  intro input notRegular
  apply refusal_of_not_admissible input
  intro admissible
  exact notRegular admissible.2.1

theorem V10_identity_alone_insufficient :
    _root_.PluginSdk.FileRead.V10_identity_alone_insufficient model := by
  let rootPath := "\\\\?\\Volume{00000000-0000-0000-0000-000000000000}\\root"
  let streamPath := "\\\\?\\Volume{00000000-0000-0000-0000-000000000000}\\root\\file.txt:stream"
  let volumeIdentity := "0011223344556677"
  let rootIdentity : Identity := ⟨volumeIdentity, "8899aabbccddeeff0011223344556677"⟩
  let rootAnchor : Anchor := ⟨rootIdentity, rootPath, false⟩
  let fileInfo : FileInfo :=
    ⟨⟨volumeIdentity, "00112233445566778899aabbccddeeff"⟩, streamPath, "0", "1", "1"⟩
  let input : ReadInput := {
    root := rootAnchor
    before := ⟨.directory rootAnchor, .file fileInfo⟩
    after := ⟨.directory rootAnchor, .file fileInfo⟩
    read := .complete "0"
  }
  have rootBound : RootBound input := by decide +kernel
  have stream : StreamPath input := by decide +kernel
  exact ⟨input, fileInfo, fileInfo, "0", by decide, rootBound, rfl, rfl, rfl, rfl,
    rfl, rfl, stream, V5_stream_refuses input stream⟩

end PluginSdk.FileRead.Proofs
