import PluginSdk.Distribution.Selection.Properties
import PluginSdk.Distribution.Selection.Model

namespace PluginSdk.Distribution.Selection.Proofs

open PluginSdk.Distribution.Selection

private theorem selectCandidates_perm
    (left right : List Catalog.PackageFormat)
    (permutation : left.Perm right) :
    selectCandidates left = selectCandidates right := by
  have lengthEqual := permutation.length_eq
  cases left with
  | nil =>
    cases right with
    | nil => rfl
    | cons head tail => simp at lengthEqual
  | cons leftHead leftTail =>
    cases leftTail with
    | nil =>
      cases right with
      | nil => simp at lengthEqual
      | cons rightHead rightTail =>
        cases rightTail with
        | nil =>
          have leftMember : leftHead ∈ [leftHead] := by simp
          have rightMember : leftHead ∈ [rightHead] :=
            permutation.mem_iff.mp leftMember
          have equalHeads : leftHead = rightHead := by simpa using rightMember
          simp [equalHeads]
        | cons second rest => simp at lengthEqual
    | cons leftSecond leftRest =>
      cases right with
      | nil => simp at lengthEqual
      | cons rightHead rightTail =>
        cases rightTail with
        | nil => simp at lengthEqual
        | cons second rest => rfl

theorem S1_selected_is_sole_candidate :
    PluginSdk.Distribution.Selection.S1_selected_is_sole_candidate model := by
  unfold PluginSdk.Distribution.Selection.S1_selected_is_sole_candidate
  intro input format selected
  change selectCandidates (CompatibleFormats input) = .selected format at selected
  cases candidateEq : CompatibleFormats input with
  | nil => simp [candidateEq, selectCandidates] at selected
  | cons first rest =>
    cases rest with
    | nil =>
      have equal : first = format := by
        simpa [candidateEq, selectCandidates] using selected
      simp [equal]
    | cons second tail =>
      simp [candidateEq, selectCandidates] at selected

theorem S2_sole_candidate_selected :
    PluginSdk.Distribution.Selection.S2_sole_candidate_selected model := by
  unfold PluginSdk.Distribution.Selection.S2_sole_candidate_selected
  intro input format candidates
  change selectCandidates (CompatibleFormats input) = .selected format
  rw [candidates]
  rfl

theorem S3_blocking_exact :
    PluginSdk.Distribution.Selection.S3_blocking_exact model := by
  unfold PluginSdk.Distribution.Selection.S3_blocking_exact
  constructor
  · intro input
    cases candidateEq : CompatibleFormats input with
    | nil => simp [model, select, selectCandidates, candidateEq]
    | cons first rest =>
      cases rest with
      | nil => simp [model, select, selectCandidates, candidateEq]
      | cons second tail => simp [model, select, selectCandidates, candidateEq]
  · intro input
    cases candidateEq : CompatibleFormats input with
    | nil => simp [model, select, selectCandidates, candidateEq]
    | cons first rest =>
      cases rest with
      | nil => simp [model, select, selectCandidates, candidateEq]
      | cons second tail => simp [model, select, selectCandidates, candidateEq]

theorem S4_enumeration_invariant :
    PluginSdk.Distribution.Selection.S4_enumeration_invariant model := by
  unfold PluginSdk.Distribution.Selection.S4_enumeration_invariant
  intro left right hostsEqual formatsPerm
  change selectCandidates (CompatibleFormats left) =
    selectCandidates (CompatibleFormats right)
  apply selectCandidates_perm
  unfold CompatibleFormats
  rw [← hostsEqual]
  exact formatsPerm.filter (fun format => Compatible left.host format)

theorem S5_cursor_family_conservation :
    PluginSdk.Distribution.Selection.S5_cursor_family_conservation model := by
  unfold PluginSdk.Distribution.Selection.S5_cursor_family_conservation
  have sameFamily : Compatible .cursor = Compatible .claudeCode := by
    funext format
    simp [Compatible, PluginSdk.Compatibility.ClientPackages.FitsClient]
  intro formats
  change selectCandidates (formats.filter (Compatible .cursor)) =
    selectCandidates (formats.filter (Compatible .claudeCode))
  rw [sameFamily]

end PluginSdk.Distribution.Selection.Proofs
