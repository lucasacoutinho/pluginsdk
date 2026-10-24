import PluginSdk.Distribution.Execution.Types

namespace PluginSdk.Distribution.Execution

def X1_prior_open_requires_exact_binding (model : Interface) : Prop :=
  ∀ plan prior record, model.openRecord ⟨plan, some prior⟩ = .opened record →
    BindingsMatch plan prior ∧ record = prior

def X2_new_record_is_pending (model : Interface) : Prop :=
  ∀ plan, ∃ record, model.openRecord ⟨plan, none⟩ = .opened record ∧
    BindingsMatch plan record ∧ ∀ entry ∈ record.entries.toList, entry.status = .pending

def X3_matching_prior_reopens (model : Interface) : Prop :=
  ∀ plan prior, BindingsMatch plan prior → model.openRecord ⟨plan, some prior⟩ = .opened prior

def X4_scheduling_sound_complete (model : Interface) : Prop :=
  (∀ input step, model.schedule input = .attempt step →
    ∃ entry ∈ input.record.entries.toList, entry.step = step ∧ Eligible entry input.visited) ∧
  (∀ input, (∃ entry ∈ input.record.entries.toList, Eligible entry input.visited) →
    ∃ step, model.schedule input = .attempt step)

def X5_recording_preserves_review (model : Interface) : Prop :=
  ∀ input record, model.record input = .recorded record →
    record.id = input.record.id ∧ record.desired = input.record.desired ∧
    record.entries.toList.map (·.step) = input.record.entries.toList.map (·.step) ∧
    (∃ entry ∈ input.record.entries.toList, entry.step.target = input.target ∧ CanAttempt entry.status) ∧
    record.entries.toList = input.record.entries.toList.map (fun entry =>
      if entry.step.target = input.target then { entry with status := input.status.toStatus } else entry)

def X6_eligible_recording_succeeds (model : Interface) : Prop :=
  ∀ input, (input.record.entries.toList.map (·.step.target)).Nodup →
    (∃ entry ∈ input.record.entries.toList, entry.step.target = input.target ∧ CanAttempt entry.status) →
    ∃ record, model.record input = .recorded record

def X7_terminal_recording_rejected (model : Interface) : Prop :=
  ∀ input, (input.record.entries.toList.map (·.step.target)).Nodup →
    (∃ entry ∈ input.record.entries.toList, entry.step.target = input.target ∧ ¬ CanAttempt entry.status) →
    model.record input = .stepTerminal

def X8_completion_exact (model : Interface) : Prop :=
  ∀ record, model.summarize record = .complete ↔
    ∀ entry ∈ record.entries.toList, Satisfies record.desired entry.status

def X9_terminal_replay_schedules_nothing (model : Interface) : Prop :=
  ∀ input, (∀ entry ∈ input.record.entries.toList, ¬ CanAttempt entry.status) →
    model.schedule input = .idle

end PluginSdk.Distribution.Execution
