import PluginSdk.Repair.Model
import PluginSdk.Repair.Properties

namespace PluginSdk.Repair.Proofs

theorem R1_blocked_never_starts : R1_blocked_never_starts model := by
  intro input blocked
  cases input with
  | mk state observed plan before =>
    cases state with
    | operationPending interrupted =>
      cases observed with
      | blocked reason =>
        by_cases samePlan : plan = interrupted
        · simp [model, begin, samePlan, Starts]
        · by_cases sameInterrupted : before.interrupted = interrupted
          · by_cases samePending : before.pending = interrupted
            · simp [model, begin, rejectFresh, propose, samePlan, sameInterrupted,
                samePending, Starts]
            · simp [model, begin, rejectFresh, samePlan, sameInterrupted,
                samePending, Starts]
          · simp [model, begin, samePlan, sameInterrupted, Starts]
      | recoverable snapshot => simp [BlockedInspection] at blocked
    | repairPending pending =>
      cases observed with
      | blocked reason =>
        by_cases retry : plan = pending.plan
        · by_cases sameBefore : before = pending.before
          · simp [model, begin, retry, sameBefore, Starts]
          · simp [model, begin, retry, sameBefore, Starts]
        · by_cases reuseInterrupted : plan = pending.before.interrupted
          · by_cases originalIsPending : pending.before.interrupted = pending.plan
            · by_cases sameBefore : before = pending.before
              · simp [model, begin, reuseInterrupted, originalIsPending,
                  sameBefore, Starts]
              · simp [model, begin, reuseInterrupted, originalIsPending,
                  sameBefore, Starts]
            · simp [model, begin, reuseInterrupted, originalIsPending, Starts]
          · by_cases sameInterrupted : before.interrupted = pending.before.interrupted
            · by_cases samePending : before.pending = pending.plan
              · simp [model, begin, rejectFresh, propose, retry, reuseInterrupted,
                  sameInterrupted, samePending, Starts]
              · simp [model, begin, rejectFresh, retry, reuseInterrupted,
                  sameInterrupted, samePending, Starts]
            · simp [model, begin, retry, reuseInterrupted, sameInterrupted, Starts]
      | recoverable snapshot => simp [BlockedInspection] at blocked
    | complete completed =>
      cases observed with
      | blocked reason =>
        by_cases samePlan : plan = completed
        · simp [model, begin, samePlan, Starts]
        · simp [model, begin, samePlan, Starts]
      | recoverable snapshot => simp [BlockedInspection] at blocked

theorem R2_start_requires_fresh_review : R2_start_requires_fresh_review model := by
  intro input pending change started
  simp_all [model, begin, rejectFresh, propose, PendingBinding]
  cases input with
  | mk state observed plan before =>
    cases state <;> cases observed
    all_goals
      repeat' (first | split at started | done)
      all_goals
        simp_all <;>
          (rcases started with ⟨pendingEq, _⟩
           cases pendingEq
           simp_all)

theorem R3_start_preserves_operation_identity :
    R3_start_preserves_operation_identity model := by
  intro input pending change started
  simp_all [model, begin, rejectFresh, propose]
  cases input with
  | mk state observed plan before =>
    cases state <;> cases observed
    all_goals
      repeat' (first | split at started | done)
      all_goals
        simp_all <;>
          (rcases started with ⟨pendingEq, _⟩
           cases pendingEq
           simp_all)

theorem R4_cleanup_matches_residual : R4_cleanup_matches_residual model := by
  intro input pending change started
  simp_all [model, begin, rejectFresh, propose, changeFor]
  cases input with
  | mk state observed plan before =>
    cases state <;> cases observed
    all_goals
      repeat' (first | split at started | done)
      all_goals
        simp_all <;>
          (rcases started with ⟨pendingEq, changeEq⟩
           cases pendingEq
           cases changeEq
           simp_all)

theorem R5_current_cleanup_retry_only_resumes :
    R5_current_cleanup_retry_only_resumes model := by
  intro input pending inputState plan before
  cases input with
  | mk state observed actualPlan actualBefore =>
    simp_all [model, begin, Starts]

theorem R6_completion_requires_qualified_absence :
    R6_completion_requires_qualified_absence model := by
  intro input plan completed
  cases input with
  | mk state observed =>
    cases observed with
    | blocked reason => simp [model, settle] at completed
    | recoverable snapshot =>
      cases residual : snapshot.residual with
      | absent => simp_all [model, settle, QualifiedAbsence]
      | marketplace => simp [model, settle, residual] at completed

theorem R7_other_settlement_preserves_pending_basis :
    R7_other_settlement_preserves_pending_basis model := by
  intro input other
  cases input with
  | mk state observed =>
    cases observed with
    | blocked reason => simp [model, settle]
    | recoverable snapshot =>
      cases residual : snapshot.residual <;>
        simp_all [model, settle, QualifiedAbsence]

theorem R8_completed_replay_acknowledges_without_start :
    R8_completed_replay_acknowledges_without_start model := by
  intro input plan state current qualified
  cases input with
  | mk actualState observed actualPlan before =>
    unfold model begin at *
    simp_all [QualifiedAbsence, Starts]
    cases observed with
    | blocked reason => simp at qualified
    | recoverable snapshot =>
      cases snapshot.residual <;>
        simp_all

end PluginSdk.Repair.Proofs
