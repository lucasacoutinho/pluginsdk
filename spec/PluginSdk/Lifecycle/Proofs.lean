import PluginSdk.Lifecycle.Model
import PluginSdk.Lifecycle.Properties

namespace PluginSdk.Lifecycle.Proofs

private theorem replay_never_starts (idle : Idle) (change : Change) (observed : Observation) :
    ¬ Starts (replay idle change observed) := by
  unfold replay
  split
  · simp [Starts]
  · cases idle <;> simp only [Starts]
    all_goals split <;> simp_all
    all_goals split <;> simp_all

private theorem begin_authorizes (input : BeginInput) (pending : Pending)
    (started : begin input = .start pending) :
    decide ⟨input.journal, input.observed, input.change.desired⟩ = .change input.change input.before := by
  unfold begin at started
  split at started
  · split at started <;> simp_all
    split at started <;> simp_all
  · split at started
    · exact False.elim (replay_never_starts _ _ _ ⟨pending, started⟩)
    · split at started <;> simp_all
      split at started <;> simp_all

private theorem planning_unowned (input : PlanningInput) (fingerprint : Fingerprint)
    (identity : Option Identity) (present : input.observed = .present fingerprint identity)
    (unowned : ¬ Owned input.journal input.observed) : ¬ Authorizes (decide input) := by
  unfold decide
  split
  · rename_i idle journal
    cases owner : idle.receipt with
    | none => simp [decideIdle, present, owner, Authorizes]
    | some receipt =>
      have mismatch : input.observed ≠ .present receipt.fingerprint (some receipt.identity) := by
        intro same
        exact unowned ⟨receipt, by simp [Journal.receipt, journal, owner], same⟩
      simp [decideIdle, present, owner, present ▸ mismatch, Authorizes]
  · simp [Authorizes]

theorem P1_unowned_never_starts : P1_unowned_never_starts model := by
  constructor
  · exact planning_unowned
  · intro input fingerprint identity present unowned ⟨pending, started⟩
    exact planning_unowned ⟨input.journal, input.observed, input.change.desired⟩
      fingerprint identity present unowned ⟨input.change, input.before, begin_authorizes input pending started⟩

theorem P2_unknown_never_starts : P2_unknown_never_starts model := by
  have planning : ∀ input : PlanningInput, input.observed = .unknown → ¬ Authorizes (decide input) := by
    intro input unknown
    cases journal : input.journal <;> simp [decide, journal, decideIdle, unknown, Authorizes]
  constructor
  · exact planning
  · intro input unknown ⟨pending, started⟩
    exact planning ⟨input.journal, input.observed, input.change.desired⟩ unknown
      ⟨input.change, input.before, begin_authorizes input pending started⟩

theorem P3_drift_never_starts : P3_drift_never_starts model := by
  intro input receipt fingerprint identity recorded present drift
  apply P1_unowned_never_starts.2 input fingerprint identity present
  intro ⟨owner, found, matching⟩
  have same : owner = receipt := Option.some.inj (found.symm.trans recorded)
  exact drift (same ▸ matching)

theorem P4_desired_fixed_point : P4_desired_fixed_point model := by
  constructor
  · intro idle empty
    simp [model, decide, decideIdle, empty]
  · intro idle receipt observed owner matching
    simp [Matches] at matching
    subst observed
    simp [model, decide, decideIdle, owner]

theorem P5_stale_before_rejected : P5_stale_before_rejected model := by
  constructor
  · intro input idle journal fresh stale
    simp [model, begin, journal, fresh, stale]
  · intro input idle journal fresh before authorized
    change decide _ = _ at authorized
    simp only [journal, before] at authorized
    simp [model, begin, journal, fresh, before, authorized]

theorem P6_one_pending_operation : P6_one_pending_operation model := by
  intro input pending journal
  simp [model, begin, journal]

theorem P7_resume_emits_no_mutation : P7_resume_emits_no_mutation model := by
  intro input pending journal
  rw [P6_one_pending_operation input pending journal]
  by_cases different : input.plan ≠ pending.plan
  · simp [different, Starts]
  · by_cases changed : input.change ≠ pending.change <;> simp [different, changed, Starts]

private theorem established_none (pending : Pending) (observed : Observation) :
    established pending observed = none ↔ ¬ DesiredEstablished pending observed := by
  cases change : pending.change <;> cases observed <;>
    simp [established, DesiredEstablished, change]
  all_goals cases ‹Option Identity› <;> simp
  all_goals split <;> simp_all

private theorem established_spec (input : SettleInput) (idle : Idle) (result : Completion)
    (found : established input.journal input.observed = some (idle, result)) :
    DesiredEstablished input.journal input.observed ∧ DesiredSettlement input (.completed idle result) := by
  unfold established at found
  split at found <;> simp_all [DesiredEstablished, DesiredSettlement]
  all_goals split at found <;> simp_all [DesiredEstablished, DesiredSettlement]

theorem P8_commit_requires_observation : P8_commit_requires_observation model := by
  constructor
  · intro input idle receipt completed
    change settle input = _ at completed
    unfold settle at completed
    cases found : established input.journal input.observed with
    | none => simp [found] at completed; split at completed <;> simp_all
    | some pair =>
      cases pair with
      | mk actual result =>
        simp only [found, Settlement.completed.injEq] at completed
        obtain ⟨rfl, rfl⟩ := completed
        have spec := established_spec input actual (.installed receipt) found
        cases change : input.journal.change <;> cases observed : input.observed <;>
          simp_all [DesiredEstablished, DesiredSettlement, Matches]
        all_goals cases identity : ‹Option Identity› <;> simp_all
  · constructor
    · intro input idle completed
      change settle input = _ at completed
      unfold settle at completed
      cases found : established input.journal input.observed with
      | none => simp [found] at completed; split at completed <;> simp_all
      | some pair =>
        cases pair with
        | mk actual result =>
          simp only [found, Settlement.completed.injEq] at completed
          obtain ⟨rfl, rfl⟩ := completed
          have spec := established_spec input actual .removed found
          cases change : input.journal.change <;> cases observed : input.observed <;>
            simp_all [DesiredEstablished, DesiredSettlement]
          all_goals cases identity : ‹Option Identity› <;> simp_all
    · intro input desired
      cases found : established input.journal input.observed with
      | none => exact False.elim ((established_none _ _).mp found desired)
      | some pair =>
        cases pair with
        | mk idle result =>
          simpa [model, settle, found] using (established_spec input idle result found).2

theorem P9_uncertainty_preserves_pending : P9_uncertainty_preserves_pending model := by
  intro input undesired changed
  have absent := (established_none input.journal input.observed).mpr undesired
  simpa [model, settle, absent, BeforeEstablished] using changed

theorem P10_not_applied_preserves_ownership : P10_not_applied_preserves_ownership model := by
  intro input undesired unchanged
  have absent := (established_none input.journal input.observed).mpr undesired
  simpa [model, settle, absent, BeforeEstablished] using unchanged

theorem P11_completed_replay_is_stable : P11_completed_replay_is_stable model := by
  intro input idle result journal revision outcome
  simp only [model, begin, journal, revision, ↓reduceIte]
  cases idle with
  | empty last =>
    cases last <;> simp_all [Idle.revision, RecordedOutcome, replay, Idle.completedDesired, Change.desired]
  | installed receipt =>
    obtain ⟨desired, observed, rfl⟩ := outcome
    simp [replay, Idle.completedDesired, desired, Matches] at observed ⊢
    exact observed
  | notApplied plan change state =>
    obtain ⟨rfl, known, observed, rfl⟩ := outcome
    rw [observed] at known
    simp [replay, Idle.completedDesired, known, observed]

theorem P12_reused_id_rejects_new_desired : P12_reused_id_rejects_new_desired model := by
  constructor
  · intro input pending journal same changed
    have different : input.change ≠ pending.change := fun equal => changed (congrArg Change.desired equal)
    simp [model, begin, journal, same, different]
  · intro input idle desired journal revision recorded changed
    simp [model, begin, journal, revision, replay, recorded, Ne.symm changed]

theorem P13_completed_plan_never_restarts : P13_completed_plan_never_restarts model := by
  intro input idle journal revision
  simpa [model, begin, journal, revision] using replay_never_starts idle input.change input.observed

theorem P14_planning_basis_matches_journal : P14_planning_basis_matches_journal model := by
  intro input
  cases journal : input.journal with
  | pending operation => simp [model, decide, journal]
  | idle state =>
    cases observed : input.observed <;> cases desired : input.desired <;>
      simp [model, decide, journal, decideIdle, PlanningRule, observed, desired]
    all_goals cases owner : state.receipt <;> simp
    all_goals split <;> simp_all
    all_goals split <;> simp_all

end PluginSdk.Lifecycle.Proofs
