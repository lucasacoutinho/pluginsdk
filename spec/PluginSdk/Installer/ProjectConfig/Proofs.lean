import PluginSdk.Installer.ProjectConfig.Model
import PluginSdk.Installer.ProjectConfig.Properties

namespace PluginSdk.Installer.ProjectConfig

private theorem blockedReason_correct (input : Input) (notSafe : ¬ Safe input)
    (reason : Reason) :
    RequiredReason input reason ↔ blockedReason input = reason := by
  cases reason with
  | duplicate =>
    simp only [RequiredReason]
    by_cases duplicate : 1 < (Owned input.key input.document).length
    · simp [blockedReason, duplicate]
    · by_cases previousNone : input.previous = none <;>
        simp [blockedReason, duplicate, previousNone]
  | unowned =>
    simp only [RequiredReason]
    by_cases duplicate : 1 < (Owned input.key input.document).length
    · have tooLong : ¬ (Owned input.key input.document).length ≤ 1 := by omega
      simp [blockedReason, duplicate, tooLong]
    · have bound : (Owned input.key input.document).length ≤ 1 := by omega
      by_cases previousNone : input.previous = none
      · have ownedNonempty : Owned input.key input.document ≠ [] := by
          intro empty
          apply notSafe
          change Owned input.key input.document = input.previous.toList
          rw [empty, previousNone]
          rfl
        simp [blockedReason, duplicate, bound, previousNone, ownedNonempty]
      · simp [blockedReason, duplicate, bound, previousNone]
  | drift =>
    simp only [RequiredReason]
    by_cases duplicate : 1 < (Owned input.key input.document).length
    · have tooLong : ¬ (Owned input.key input.document).length ≤ 1 := by omega
      simp [blockedReason, duplicate, tooLong]
    · have bound : (Owned input.key input.document).length ≤ 1 := by omega
      by_cases previousNone : input.previous = none
      · simp [blockedReason, duplicate, bound, previousNone]
      · simp [blockedReason, duplicate, bound, previousNone, notSafe]

private theorem owned_foreign_empty (key : String) (document : List Segment) :
    Owned key (Foreign key document) = [] := by
  unfold Owned Foreign
  rw [List.filterMap_filter]
  apply List.filterMap_eq_nil_iff.mpr
  intro segment _
  cases segment with
  | external content => simp [BelongsTo]
  | managed owner content =>
    by_cases same : owner = key
    · subst owner
      simp [BelongsTo]
    · simp [BelongsTo, same]

private theorem owned_managed_map (key : String) (contents : List String) :
    Owned key (contents.map (Segment.managed key)) = contents := by
  unfold Owned
  rw [List.filterMap_map]
  have composed : (fun content : String =>
      (match Segment.managed key content with
       | .external _ => none
       | .managed owner value => if owner = key then some value else none)) =
      (fun content => some content) := by
    funext content
    simp
  change List.filterMap (fun content : String =>
      match Segment.managed key content with
      | .external _ => none
      | .managed owner value => if owner = key then some value else none) contents = contents
  rw [composed]
  simp

private theorem foreign_managed_map (key : String) (contents : List String) :
    Foreign key (contents.map (Segment.managed key)) = [] := by
  unfold Foreign
  rw [List.filter_map]
  simp [BelongsTo]

private theorem foreign_idempotent (key : String) (document : List Segment) :
    Foreign key (Foreign key document) = Foreign key document := by
  simp [Foreign, List.filter_filter]

private theorem foreign_changed_edit (key : String) (document : List Segment)
    (desired : List String) :
    Foreign key (Foreign key document ++ desired.map (Segment.managed key)) =
      Foreign key document := by
  unfold Foreign
  rw [List.filter_append]
  change Foreign key (Foreign key document) ++
      Foreign key (desired.map (Segment.managed key)) = Foreign key document
  rw [foreign_idempotent, foreign_managed_map]
  simp

private theorem owned_changed_edit (key : String) (document : List Segment)
    (desired : List String) :
    Owned key (Foreign key document ++ desired.map (Segment.managed key)) = desired := by
  unfold Owned
  rw [List.filterMap_append]
  change Owned key (Foreign key document) ++
      Owned key (desired.map (Segment.managed key)) = desired
  rw [owned_foreign_empty, owned_managed_map]
  rfl

private theorem safe_has_no_required_reason (input : Input) (safe : Safe input)
    (reason : Reason) : ¬ RequiredReason input reason := by
  cases reason with
  | duplicate =>
    have ownedBound : (Owned input.key input.document).length ≤ 1 := by
      change Owned input.key input.document = input.previous.toList at safe
      rw [safe]
      cases input.previous <;> simp
    simp only [RequiredReason]
    omega
  | unowned =>
    simp only [RequiredReason]
    rintro ⟨_, previousNone, ownedNonempty⟩
    change Owned input.key input.document = input.previous.toList at safe
    rw [safe, previousNone] at ownedNonempty
    simp at ownedNonempty
  | drift =>
    simp [RequiredReason, safe]

private theorem edit_ready_implies_safe (input : Input) (document : List Segment)
    (ready : model.edit input = .ready document) : Safe input := by
  change editInput input = .ready document at ready
  by_cases safe : Safe input
  · exact safe
  · simp [editInput, safe] at ready

private theorem edit_ready_of_safe (input : Input) (safe : Safe input) :
    ∃ document, model.edit input = .ready document := by
  by_cases unchanged : input.previous = input.desired
  · exact ⟨input.document, by simp [model, editInput, safe, unchanged]⟩
  · exact ⟨Foreign input.key input.document ++
      input.desired.toList.map (Segment.managed input.key),
      by simp [model, editInput, safe, unchanged]⟩

theorem certificate_J1_accepts_exactly_safe :
    J1_accepts_exactly_safe model := by
  intro input
  constructor
  · exact edit_ready_of_safe input
  · rintro ⟨document, ready⟩
    exact edit_ready_implies_safe input document ready

theorem certificate_J2_block_reason_exact : J2_block_reason_exact model := by
  intro input reason
  by_cases safe : Safe input
  · have noReason := safe_has_no_required_reason input safe reason
    constructor
    · intro blocked
      by_cases unchanged : input.previous = input.desired <;>
        simp [model, editInput, safe, unchanged] at blocked
    · intro required
      exact False.elim (noReason required)
  · simpa [model, editInput, safe] using (blockedReason_correct input safe reason).symm

theorem certificate_J3_foreign_bytes_preserved :
    J3_foreign_bytes_preserved model := by
  intro input document ready
  change editInput input = .ready document at ready
  by_cases safe : Safe input
  · by_cases unchanged : input.previous = input.desired
    · have documentEq : input.document = document := by
        simpa [editInput, safe, unchanged] using ready
      rw [← documentEq]
    · have documentEq : document =
          Foreign input.key input.document ++ input.desired.toList.map (Segment.managed input.key) := by
        simpa [editInput, safe, unchanged] using ready.symm
      rw [documentEq]
      exact foreign_changed_edit input.key input.document input.desired.toList
  · simp [editInput, safe] at ready

theorem certificate_J4_desired_block_exact : J4_desired_block_exact model := by
  intro input document ready
  change editInput input = .ready document at ready
  by_cases safe : Safe input
  · by_cases unchanged : input.previous = input.desired
    · have documentEq : input.document = document := by
        simpa [editInput, safe, unchanged] using ready
      rw [← documentEq]
      exact safe.trans (congrArg Option.toList unchanged)
    · have documentEq : document =
          Foreign input.key input.document ++ input.desired.toList.map (Segment.managed input.key) := by
        simpa [editInput, safe, unchanged] using ready.symm
      rw [documentEq]
      exact owned_changed_edit input.key input.document input.desired.toList
  · simp [editInput, safe] at ready

theorem certificate_J5_unchanged_retains_document :
    J5_unchanged_retains_document model := by
  intro input safe unchanged
  simp [model, editInput, safe, unchanged]

theorem certificate_J6_completed_edit_is_idempotent :
    J6_completed_edit_is_idempotent model := by
  intro input document ready
  have desiredOwned := certificate_J4_desired_block_exact input document ready
  let completed : Input := { input with previous := input.desired, document := document }
  have completedSafe : Safe completed := by
    change Owned input.key document = input.desired.toList
    exact desiredOwned
  change model.edit completed = .ready document
  simp [model, editInput, completed, completedSafe]

namespace Proofs

theorem J1_accepts_exactly_safe : PluginSdk.Installer.ProjectConfig.J1_accepts_exactly_safe model :=
  certificate_J1_accepts_exactly_safe
theorem J2_block_reason_exact : PluginSdk.Installer.ProjectConfig.J2_block_reason_exact model :=
  certificate_J2_block_reason_exact
theorem J3_foreign_bytes_preserved : PluginSdk.Installer.ProjectConfig.J3_foreign_bytes_preserved model :=
  certificate_J3_foreign_bytes_preserved
theorem J4_desired_block_exact : PluginSdk.Installer.ProjectConfig.J4_desired_block_exact model :=
  certificate_J4_desired_block_exact
theorem J5_unchanged_retains_document : PluginSdk.Installer.ProjectConfig.J5_unchanged_retains_document model :=
  certificate_J5_unchanged_retains_document
theorem J6_completed_edit_is_idempotent : PluginSdk.Installer.ProjectConfig.J6_completed_edit_is_idempotent model :=
  certificate_J6_completed_edit_is_idempotent

end Proofs

end PluginSdk.Installer.ProjectConfig
