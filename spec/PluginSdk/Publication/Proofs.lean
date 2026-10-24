import PluginSdk.Publication.Model
import PluginSdk.Publication.Properties

namespace PluginSdk.Publication

private theorem hasKey_of_desired_mem (input : Input)
    (member : input.desired ∈ input.history) : HasKey input :=
  ⟨input.desired, member, rfl⟩

private theorem nodup_append_singleton {α : Type} [DecidableEq α]
    (values : List α) (item : α) (nodup : values.Nodup) (fresh : item ∉ values) :
    (values ++ [item]).Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    have parts := List.nodup_cons.mp nodup
    have itemNotTail : item ∉ tail := by
      intro member
      apply fresh
      simp [member]
    have tailNodup := ih parts.2 itemNotTail
    apply List.nodup_cons.mpr
    constructor
    · intro member
      rcases List.mem_append.mp member with inTail | singletonMember
      · exact parts.1 inTail
      · have equal := List.mem_singleton.mp singletonMember
        apply fresh
        simp [equal]
    · exact tailNodup

private theorem validHistory_append_of_fresh (input : Input)
    (valid : ValidHistory input.history) (fresh : ¬ HasKey input) :
    ValidHistory (input.history ++ [input.desired]) := by
  have desiredKeyFresh : input.desired.key ∉ input.history.map Publication.key := by
    intro member
    obtain ⟨entry, entryMember, entryKey⟩ := List.mem_map.mp member
    exact fresh ⟨entry, entryMember, entryKey⟩
  unfold ValidHistory at valid ⊢
  rw [List.map_append]
  exact nodup_append_singleton _ _ valid desiredKeyFresh

namespace Proofs

theorem W1_new_version_exact : _root_.PluginSdk.Publication.W1_new_version_exact model := by
  intro input
  constructor
  · intro published
    change publishInput input = .published (input.history ++ [input.desired]) at published
    by_cases valid : ValidHistory input.history
    · by_cases hasKey : HasKey input
      · by_cases member : input.desired ∈ input.history
        · simp [publishInput, valid, hasKey, member] at published
        · simp [publishInput, valid, hasKey, member] at published
      · exact ⟨valid, hasKey⟩
    · simp [publishInput, valid] at published
  · rintro ⟨valid, fresh⟩
    simp [model, publishInput, valid, fresh]

theorem W2_historical_replay_unchanged :
    _root_.PluginSdk.Publication.W2_historical_replay_unchanged model := by
  intro input
  constructor
  · intro unchanged
    change publishInput input = .unchanged input.history at unchanged
    by_cases valid : ValidHistory input.history
    · by_cases hasKey : HasKey input
      · by_cases member : input.desired ∈ input.history
        · exact ⟨valid, member⟩
        · simp [publishInput, valid, hasKey, member] at unchanged
      · simp [publishInput, valid, hasKey] at unchanged
    · simp [publishInput, valid] at unchanged
  · rintro ⟨valid, member⟩
    have hasKey := hasKey_of_desired_mem input member
    simp [model, publishInput, valid, hasKey, member]

theorem W3_blocking_exact : _root_.PluginSdk.Publication.W3_blocking_exact model := by
  intro input reason
  cases reason with
  | duplicate =>
    by_cases valid : ValidHistory input.history
    · by_cases hasKey : HasKey input
      · by_cases member : input.desired ∈ input.history
        · simp [RequiredReason, model, publishInput, valid, hasKey, member]
        · simp [RequiredReason, model, publishInput, valid, hasKey, member]
      · simp [RequiredReason, model, publishInput, valid, hasKey]
    · simp [RequiredReason, model, publishInput, valid]
  | versionConflict =>
    by_cases valid : ValidHistory input.history
    · by_cases hasKey : HasKey input
      · by_cases member : input.desired ∈ input.history
        · simp [RequiredReason, model, publishInput,
            valid, hasKey, member]
        · simp [RequiredReason, model, publishInput,
            valid, hasKey, member]
      · simp [RequiredReason, model, publishInput, valid, hasKey]
    · simp [RequiredReason, model, publishInput, valid]

theorem W4_preserves_history : _root_.PluginSdk.Publication.W4_preserves_history model := by
  intro input history
  constructor
  · intro published
    change publishInput input = .published history at published
    by_cases valid : ValidHistory input.history
    · by_cases hasKey : HasKey input
      · by_cases member : input.desired ∈ input.history
        · simp [publishInput, valid, hasKey, member] at published
        · simp [publishInput, valid, hasKey, member] at published
      · simp [publishInput, valid, hasKey] at published
        cases published
        rfl
    · simp [publishInput, valid] at published
  · intro unchanged
    change publishInput input = .unchanged history at unchanged
    by_cases valid : ValidHistory input.history
    · by_cases hasKey : HasKey input
      · by_cases member : input.desired ∈ input.history
        · simp [publishInput, valid, hasKey, member] at unchanged
          cases unchanged
          rfl
        · simp [publishInput, valid, hasKey, member] at unchanged
      · simp [publishInput, valid, hasKey] at unchanged
    · simp [publishInput, valid] at unchanged

theorem W5_completed_publication_is_idempotent :
    _root_.PluginSdk.Publication.W5_completed_publication_is_idempotent model := by
  intro input history published
  have historyEq := (W4_preserves_history input history).1 published
  cases historyEq
  rcases (W1_new_version_exact input).mp published with ⟨valid, fresh⟩
  let completed : Input := { input with history := input.history ++ [input.desired] }
  have completedValid : ValidHistory completed.history := by
    simpa [completed] using validHistory_append_of_fresh input valid fresh
  have desiredMember : input.desired ∈ completed.history := by
    simp [completed]
  change model.publish completed = .unchanged completed.history
  exact (W2_historical_replay_unchanged completed).mpr
    ⟨completedValid, desiredMember⟩

theorem W6_successful_history_unique :
    _root_.PluginSdk.Publication.W6_successful_history_unique model := by
  intro input history successful
  rcases successful with published | unchanged
  · have historyEq := (W4_preserves_history input history).1 published
    cases historyEq
    rcases (W1_new_version_exact input).mp published with ⟨valid, fresh⟩
    exact validHistory_append_of_fresh input valid fresh
  · have historyEq := (W4_preserves_history input history).2 unchanged
    cases historyEq
    exact ((W2_historical_replay_unchanged input).mp unchanged).1

end Proofs

end PluginSdk.Publication
