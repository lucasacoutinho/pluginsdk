import PluginSdk.Repair.Types

namespace PluginSdk.Repair

def Starts : BeginResult → Prop
  | .start _ _ => True
  | _ => False

def BlockedInspection : Inspection → Prop
  | .blocked _ => True
  | .recoverable _ => False

def QualifiedAbsence : Inspection → Prop
  | .recoverable state => state.residual = .absent
  | .blocked _ => False

def PendingBinding (state : State) (before : Basis) : Prop :=
  match state with
  | .operationPending plan => before.pending = plan
  | .repairPending pending => before.pending = pending.plan
  | .complete _ => False

def R1_blocked_never_starts (model : Interface) : Prop :=
  ∀ input : BeginInput, BlockedInspection input.observed →
    ¬ Starts (model.begin input)

def R2_start_requires_fresh_review (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ pending change,
    model.begin input = .start pending change →
      model.propose ⟨input.state, input.observed⟩ = .repair input.before ∧
      pending.plan = input.plan ∧ pending.before = input.before ∧
      PendingBinding input.state input.before

def R3_start_preserves_operation_identity (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ pending change,
    model.begin input = .start pending change →
      pending.plan = input.plan ∧
      input.plan ≠ pending.before.pending ∧
      input.plan ≠ pending.before.interrupted ∧
      pending.before.pending = input.before.pending ∧
      pending.before.interrupted = input.before.interrupted

def R4_cleanup_matches_residual (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ pending change,
    model.begin input = .start pending change →
      (change = .none ↔ input.before.observed.residual = .absent) ∧
      (change = .removeMarketplace ↔ input.before.observed.residual = .marketplace)

def R5_current_cleanup_retry_only_resumes (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ pending,
    input.state = .repairPending pending →
    input.plan = pending.plan → input.before = pending.before →
      model.begin input = .resume pending ∧
      ¬ Starts (model.begin input)

def R6_completion_requires_qualified_absence (model : Interface) : Prop :=
  ∀ input : SettleInput, ∀ plan,
    model.settle input = .completed plan →
      plan = input.state.plan ∧ QualifiedAbsence input.observed

def R7_other_settlement_preserves_pending_basis (model : Interface) : Prop :=
  ∀ input : SettleInput, ¬ QualifiedAbsence input.observed →
    model.settle input = .uncertain input.state input.observed

def R8_completed_replay_acknowledges_without_start (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ plan,
    input.state = .complete plan → input.plan = plan →
    QualifiedAbsence input.observed →
      model.begin input = .completed ∧
      ¬ Starts (model.begin input)

end PluginSdk.Repair
