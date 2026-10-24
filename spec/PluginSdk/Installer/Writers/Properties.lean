import PluginSdk.Installer.Writers.Types

namespace PluginSdk.Installer.Writers

def Z1_resume_exact (interface : Interface) : Prop :=
  ∀ input writer, (interface.step input).action = .resume writer ↔
    ∃ previous, input.state = .retaining previous writer ∧
      ValidAdmission previous writer ∧ input.signal = .retained (previous ++ [writer])

def Z2_retention_exact (interface : Interface) : Prop :=
  ∀ input next, (interface.step input).action = .retain next ↔
    ∃ previous writer, input.state = .open previous ∧
      ValidAdmission previous writer ∧ input.signal = .birth writer ∧
      next = previous ++ [writer]

def Z3_ledger_monotone (interface : Interface) : Prop :=
  ∀ input, ∃ suffix,
    (interface.step input).state.writers = input.state.writers ++ suffix

def Z4_retention_failure_stops (interface : Interface) : Prop :=
  ∀ state, (interface.step ⟨state, .failed⟩).action = .stop ∧
    (interface.step ⟨state, .failed⟩).state.writers = state.writers ∧
    (interface.step ⟨state, .failed⟩).state.Terminal

def Z5_terminal_absorbs (interface : Interface) : Prop :=
  ∀ state signal, state.Terminal → interface.step ⟨state, signal⟩ = ⟨state, .stop⟩

def Z6_completion_exact (interface : Interface) : Prop :=
  ∀ input, interface.completion input = .complete ↔ CompleteEvidence input

def Z7_activity_exact (interface : Interface) : Prop :=
  ∀ input, interface.completion input = .active ↔ ActiveEvidence input

def Z8_unknown_exact (interface : Interface) : Prop :=
  ∀ input, interface.completion input = .unknown ↔
    ¬ CompleteEvidence input ∧ ¬ ActiveEvidence input

def Z9_close_exact (interface : Interface) : Prop :=
  ∀ input, (interface.step input).action = .complete ↔
    ∃ writers observed, input.state = .open writers ∧ input.signal = .close observed ∧
      CompleteEvidence ⟨writers, observed⟩

def Z10_resume_identity_fresh (interface : Interface) : Prop :=
  ∀ input writer, (interface.step input).action = .resume writer →
    (interface.step input).state.writers.Nodup ∧
    writer ∈ (interface.step input).state.writers ∧ writer ∉ input.state.writers

def Z11_observation_identity_bound (interface : Interface) : Prop :=
  ∀ input, (interface.observe input).writer = input.writer

def Z12_observed_termination_exact (interface : Interface) : Prop :=
  ∀ input, (interface.observe input).state = .terminated ↔ LookupTerminated input

def Z13_observed_activity_exact (interface : Interface) : Prop :=
  ∀ input, (interface.observe input).state = .active ↔ LookupActive input

def Z14_observed_unknown_exact (interface : Interface) : Prop :=
  ∀ input, (interface.observe input).state = .unknown ↔
    ¬ LookupTerminated input ∧ ¬ LookupActive input

def Z15_unbound_lookup_unknown (interface : Interface) : Prop :=
  ∀ input, input.lookup.pid ≠ some input.writer.pid →
    (interface.observe input).state = .unknown

def Z16_reused_pid_terminated (interface : Interface) : Prop :=
  ∀ (writer actual : Writer) (state : ProcessState), actual.pid = writer.pid → actual.creation ≠ writer.creation →
    (interface.observe ⟨writer, .opened actual state⟩).state = .terminated

def Z17_trace_covers_resumed_writers (interface : Interface) : Prop :=
  ∀ state signals writer, ResumedDuring interface state signals writer →
    writer ∈ (traceState interface state signals).writers

def Z18_prior_owners_complete_exact (interface : Interface) : Prop :=
  ∀ input, interface.priorOwners input = .complete ↔ CompleteEvidence input.foreign

def Z19_prior_owners_active_exact (interface : Interface) : Prop :=
  ∀ input, interface.priorOwners input = .active ↔ ActiveEvidence input.foreign

def Z20_prior_owners_unknown_exact (interface : Interface) : Prop :=
  ∀ input, interface.priorOwners input = .unknown ↔
    ¬ CompleteEvidence input.foreign ∧ ¬ ActiveEvidence input.foreign

def Z21_self_owners_do_not_block (interface : Interface) : Prop :=
  ∀ current owners observed, (∀ writer ∈ owners, writer = current) →
    interface.priorOwners ⟨current, owners, observed⟩ = .complete

def Z22_owner_exemption_exact (interface : Interface) : Prop :=
  ∀ current writer,
    interface.priorOwners ⟨current, [writer], [⟨writer, .active⟩]⟩ = .complete ↔ writer = current

end PluginSdk.Installer.Writers
