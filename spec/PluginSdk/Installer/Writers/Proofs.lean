import PluginSdk.Installer.Writers.Model
import PluginSdk.Installer.Writers.Properties

namespace PluginSdk.Installer.Writers

private theorem complete_not_active (input : CompletionInput)
    (complete : CompleteEvidence input) : ¬ ActiveEvidence input := by
  rintro ⟨observed, member, bound, active⟩
  have included : observed ∈ input.observed.filter (fun item => item.writer == observed.writer) := by
    simp [List.mem_filter, member]
  rw [complete.2 observed.writer bound] at included
  simp only [List.mem_singleton] at included
  have terminated : observed.state = .terminated := congrArg Observation.state included
  cases active.symm.trans terminated

private theorem completion_classification (input : CompletionInput) :
    (writerCompletion input = .complete ↔ CompleteEvidence input) ∧
    (writerCompletion input = .active ↔ ActiveEvidence input) ∧
    (writerCompletion input = .unknown ↔ ¬ CompleteEvidence input ∧ ¬ ActiveEvidence input) := by
  by_cases active : ActiveEvidence input
  · have incomplete : ¬ CompleteEvidence input := fun complete => complete_not_active input complete active
    simp [writerCompletion, active, incomplete]
  · by_cases complete : CompleteEvidence input <;>
      simp [writerCompletion, active, complete]

private theorem observation_classification (input : ObservationInput) :
    ((observeWriter input).state = .terminated ↔ LookupTerminated input) ∧
    ((observeWriter input).state = .active ↔ LookupActive input) ∧
    ((observeWriter input).state = .unknown ↔ ¬ LookupTerminated input ∧ ¬ LookupActive input) := by
  rcases input with ⟨⟨pid, creation⟩, lookup⟩
  cases lookup with
  | opened actual state =>
    rcases actual with ⟨actualPid, actualCreation⟩
    by_cases bound : actualPid = pid <;>
      by_cases same : actualCreation = creation <;>
      cases state <;>
      simp [observeWriter, LookupTerminated, LookupActive, bound, same]
  | missing actualPid =>
    by_cases bound : actualPid = pid <;>
      simp [observeWriter, LookupTerminated, LookupActive, bound]
  | unavailable => simp [observeWriter, LookupTerminated, LookupActive]

namespace Proofs

theorem Z1_resume_exact : PluginSdk.Installer.Writers.Z1_resume_exact model := by
  intro ⟨state, signal⟩ writer
  cases state <;> cases signal <;> simp [model, writerStep]
  all_goals split <;> simp_all
  all_goals
    rename_i previous pending retained condition
    by_cases same : pending = writer <;> simp_all

theorem Z2_retention_exact : PluginSdk.Installer.Writers.Z2_retention_exact model := by
  intro ⟨state, signal⟩ next
  cases state <;> cases signal <;> simp [model, writerStep]
  all_goals split <;> simp_all
  · rename_i previous writer valid
    constructor
    · intro same
      exact ⟨writer, valid, rfl, same.symm⟩
    · rintro ⟨actual, _, same, appended⟩
      subst actual
      exact appended.symm
  · rename_i previous writer invalid
    intro actual valid same
    subst actual
    exact fun _ => invalid valid

theorem Z3_ledger_monotone : PluginSdk.Installer.Writers.Z3_ledger_monotone model := by
  intro ⟨state, signal⟩
  cases state with
  | «open» writers =>
    cases signal with
    | birth writer =>
      by_cases valid : ValidAdmission writers writer <;>
        exact ⟨[], by simp [model, writerStep, valid, GateState.writers]⟩
    | retained _ | failed | stop =>
      exact ⟨[], by simp [model, writerStep, GateState.writers]⟩
    | close observed =>
      cases status : writerCompletion ⟨writers, observed⟩ <;>
        exact ⟨[], by simp [model, writerStep, status, GateState.writers]⟩
  | retaining writers writer =>
    cases signal with
    | retained next =>
      by_cases valid : ValidAdmission writers writer ∧ next = writers ++ [writer]
      · exact ⟨[writer], by simp [model, writerStep, valid, GateState.writers]⟩
      · exact ⟨[], by simp [model, writerStep, valid, GateState.writers]⟩
    | birth _ | failed | close _ | stop =>
      exact ⟨[], by simp [model, writerStep, GateState.writers]⟩
  | closed writers => exact ⟨[], by simp [model, writerStep, GateState.writers]⟩
  | stopped writers => exact ⟨[], by simp [model, writerStep, GateState.writers]⟩

theorem Z4_retention_failure_stops : PluginSdk.Installer.Writers.Z4_retention_failure_stops model := by
  intro state
  cases state <;> simp [model, writerStep, GateState.writers, GateState.Terminal]

theorem Z5_terminal_absorbs : PluginSdk.Installer.Writers.Z5_terminal_absorbs model := by
  intro state signal terminal
  cases state <;> simp_all [model, writerStep, GateState.Terminal]

theorem Z6_completion_exact : PluginSdk.Installer.Writers.Z6_completion_exact model := by
  intro input
  exact (completion_classification input).1

theorem Z7_activity_exact : PluginSdk.Installer.Writers.Z7_activity_exact model := by
  intro input
  exact (completion_classification input).2.1

theorem Z8_unknown_exact : PluginSdk.Installer.Writers.Z8_unknown_exact model := by
  intro input
  exact (completion_classification input).2.2

theorem Z9_close_exact : PluginSdk.Installer.Writers.Z9_close_exact model := by
  intro ⟨state, signal⟩
  cases state <;> cases signal <;> simp [model, writerStep]
  all_goals split <;> simp_all [← (completion_classification _).1]

theorem Z10_resume_identity_fresh : PluginSdk.Installer.Writers.Z10_resume_identity_fresh model := by
  intro input writer resumed
  obtain ⟨previous, state, valid, signal⟩ := (Z1_resume_exact input writer).mp resumed
  rcases input with ⟨actualState, actualSignal⟩
  simp only at state signal
  subst actualState actualSignal
  have stepped : writerStep ⟨.retaining previous writer, .retained (previous ++ [writer])⟩ =
      ⟨.open (previous ++ [writer]), .resume writer⟩ := by
    simp [writerStep, valid]
  simp only [model, stepped, GateState.writers]
  refine ⟨?_, by simp, valid.2⟩
  simp [List.nodup_append, valid.1]
  intro actual member same
  exact valid.2 (same ▸ member)

theorem Z11_observation_identity_bound : PluginSdk.Installer.Writers.Z11_observation_identity_bound model := by
  intro input
  rfl

theorem Z12_observed_termination_exact : PluginSdk.Installer.Writers.Z12_observed_termination_exact model := by
  intro input
  exact (observation_classification input).1

theorem Z13_observed_activity_exact : PluginSdk.Installer.Writers.Z13_observed_activity_exact model := by
  intro input
  exact (observation_classification input).2.1

theorem Z14_observed_unknown_exact : PluginSdk.Installer.Writers.Z14_observed_unknown_exact model := by
  intro input
  exact (observation_classification input).2.2

theorem Z15_unbound_lookup_unknown : PluginSdk.Installer.Writers.Z15_unbound_lookup_unknown model := by
  intro ⟨writer, lookup⟩ unbound
  cases lookup with
  | opened actual state =>
    have different : actual.pid ≠ writer.pid := by simpa [Lookup.pid] using unbound
    simp [model, observeWriter, different]
  | missing pid =>
    have different : pid ≠ writer.pid := by simpa [Lookup.pid] using unbound
    simp [model, observeWriter, different]
  | unavailable => simp [model, observeWriter]

theorem Z16_reused_pid_terminated : PluginSdk.Installer.Writers.Z16_reused_pid_terminated model := by
  intro writer actual state bound different
  simp [model, observeWriter, bound, different]

private theorem trace_keeps_ledger (state : GateState) (signals : List GateSignal) :
    ∀ writer ∈ state.writers, writer ∈ (traceState model state signals).writers := by
  induction signals generalizing state with
  | nil => simp [traceState]
  | cons signal rest ih =>
    intro writer present
    apply ih (state := (model.step ⟨state, signal⟩).state) writer
    obtain ⟨suffix, appended⟩ := Z3_ledger_monotone ⟨state, signal⟩
    rw [appended]
    exact List.mem_append_left suffix present

theorem Z17_trace_covers_resumed_writers : PluginSdk.Installer.Writers.Z17_trace_covers_resumed_writers model := by
  intro state signals writer resumed
  induction signals generalizing state with
  | nil => exact False.elim resumed
  | cons signal rest ih =>
    rcases resumed with head | tail
    · exact trace_keeps_ledger _ rest writer (Z10_resume_identity_fresh ⟨state, signal⟩ writer head).2.1
    · exact ih _ tail

theorem Z18_prior_owners_complete_exact : PluginSdk.Installer.Writers.Z18_prior_owners_complete_exact model := by
  intro input
  exact (completion_classification input.foreign).1

theorem Z19_prior_owners_active_exact : PluginSdk.Installer.Writers.Z19_prior_owners_active_exact model := by
  intro input
  exact (completion_classification input.foreign).2.1

theorem Z20_prior_owners_unknown_exact : PluginSdk.Installer.Writers.Z20_prior_owners_unknown_exact model := by
  intro input
  exact (completion_classification input.foreign).2.2

theorem Z21_self_owners_do_not_block : PluginSdk.Installer.Writers.Z21_self_owners_do_not_block model := by
  intro current owners observed self
  have empty : owners.filter (fun writer => writer != current) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro writer member
    simp [self writer member]
  simp [model, priorOwnerCompletion, PriorOwnersInput.foreign, empty, writerCompletion,
    ActiveEvidence, CompleteEvidence]

theorem Z22_owner_exemption_exact : PluginSdk.Installer.Writers.Z22_owner_exemption_exact model := by
  intro current writer
  by_cases same : writer = current <;>
    simp [model, priorOwnerCompletion, PriorOwnersInput.foreign, writerCompletion,
      ActiveEvidence, CompleteEvidence, same]

end Proofs

end PluginSdk.Installer.Writers
