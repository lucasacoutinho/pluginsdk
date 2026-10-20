import PluginSdk.Lifecycle.Rules

namespace PluginSdk.Lifecycle

def P1_unowned_never_starts (model : Interface) : Prop :=
  (∀ input : PlanningInput, ∀ fingerprint identity,
    input.observed = .present fingerprint identity → ¬ Owned input.journal input.observed →
    ¬ Authorizes (model.decide input)) ∧
  (∀ input : BeginInput, ∀ fingerprint identity,
    input.observed = .present fingerprint identity → ¬ Owned input.journal input.observed →
    ¬ Starts (model.begin input))

def P2_unknown_never_starts (model : Interface) : Prop :=
  (∀ input : PlanningInput, input.observed = .unknown → ¬ Authorizes (model.decide input)) ∧
  (∀ input : BeginInput, input.observed = .unknown → ¬ Starts (model.begin input))

def P3_drift_never_starts (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ receipt fingerprint identity,
    input.journal.receipt = some receipt → input.observed = .present fingerprint identity →
    ¬ Matches input.observed receipt → ¬ Starts (model.begin input)

def P4_desired_fixed_point (model : Interface) : Prop :=
  (∀ idle, idle.receipt = none →
    model.decide ⟨.idle idle, .absent, .absent⟩ = .unchanged (idle.snapshot .absent)) ∧
  (∀ idle receipt observed, idle.receipt = some receipt → Matches observed receipt →
    model.decide ⟨.idle idle, observed, .present receipt.identity.bundle⟩ =
      .unchanged (idle.snapshot observed))

def P5_stale_before_rejected (model : Interface) : Prop :=
  (∀ input : BeginInput, ∀ idle, input.journal = .idle idle →
    idle.revision ≠ some input.plan → input.before ≠ idle.snapshot input.observed →
    model.begin input = .rejected .stalePlan) ∧
  (∀ input : BeginInput, ∀ idle, input.journal = .idle idle →
    idle.revision ≠ some input.plan → input.before = idle.snapshot input.observed →
    model.decide ⟨input.journal, input.observed, input.change.desired⟩ = .change input.change input.before →
    model.begin input = .start ⟨input.plan, idle, input.observed, input.change⟩)

def P6_one_pending_operation (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ pending, input.journal = .pending pending →
    model.begin input =
      if input.plan ≠ pending.plan then .rejected .differentPendingPlan
      else if input.change ≠ pending.change then .rejected .invalidPlan
      else .resume pending

def P7_resume_emits_no_mutation (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ pending, input.journal = .pending pending → ¬ Starts (model.begin input)

def P8_commit_requires_observation (model : Interface) : Prop :=
  (∀ input : SettleInput, ∀ idle receipt,
    model.settle input = .completed idle (.installed receipt) →
    DesiredEstablished input.journal input.observed ∧ Matches input.observed receipt ∧
    receipt.identity.plan = input.journal.plan ∧ idle = .installed receipt) ∧
  (∀ input : SettleInput, ∀ idle, model.settle input = .completed idle .removed →
    input.journal.change = .remove ∧ input.observed = .absent ∧
    idle = .empty (some input.journal.plan)) ∧
  (∀ input : SettleInput, DesiredEstablished input.journal input.observed →
    DesiredSettlement input (model.settle input))

def P9_uncertainty_preserves_pending (model : Interface) : Prop :=
  ∀ input : SettleInput, ¬ DesiredEstablished input.journal input.observed →
    ¬ BeforeEstablished input.journal input.observed →
    model.settle input = .uncertain input.journal input.observed

def P10_not_applied_preserves_ownership (model : Interface) : Prop :=
  ∀ input : SettleInput, ¬ DesiredEstablished input.journal input.observed →
    BeforeEstablished input.journal input.observed →
    model.settle input = .completed
      (.notApplied input.journal.plan input.journal.change
        (input.journal.previous.snapshot input.journal.observed)) .notApplied

def P11_completed_replay_is_stable (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ idle result, input.journal = .idle idle →
    idle.revision = some input.plan → RecordedOutcome idle input.change input.observed result →
    model.begin input = .completed result

def P12_reused_id_rejects_new_desired (model : Interface) : Prop :=
  (∀ input : BeginInput, ∀ pending, input.journal = .pending pending →
    input.plan = pending.plan → input.change.desired ≠ pending.change.desired →
    model.begin input = .rejected .invalidPlan) ∧
  (∀ input : BeginInput, ∀ idle desired, input.journal = .idle idle →
    idle.revision = some input.plan → idle.completedDesired = some desired →
    input.change.desired ≠ desired → model.begin input = .rejected .invalidPlan)

def P13_completed_plan_never_restarts (model : Interface) : Prop :=
  ∀ input : BeginInput, ∀ idle, input.journal = .idle idle →
    idle.revision = some input.plan → ¬ Starts (model.begin input)

def P14_planning_basis_matches_journal (model : Interface) : Prop :=
  ∀ input : PlanningInput,
    match input.journal with
    | .pending operation => model.decide input = .pending operation.plan
    | .idle current => PlanningRule current input.observed input.desired (model.decide input)

end PluginSdk.Lifecycle
