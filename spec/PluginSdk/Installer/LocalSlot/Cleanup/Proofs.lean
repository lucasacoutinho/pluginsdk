import PluginSdk.Installer.LocalSlot.Cleanup.Model
import PluginSdk.Installer.LocalSlot.Cleanup.Properties

namespace PluginSdk.Installer.LocalSlot.Cleanup.Proofs

open PluginSdk.Installer.LocalSlot.Cleanup

private theorem admittedFacts {input : Input} (admitted : Admitted input) :
    ¬ HasUnknown input.slots ∧
    ¬ HasUnownedObservation input.owner input.slots ∧
    ValidOperation input.operation ∧
    RoleValidClaims input.owner input.operation input.slots := by
  unfold Admitted RoleValidKnownOwnedClaims at admitted
  rcases admitted with ⟨valid, known⟩
  rcases known with ⟨unknown, unowned, roles⟩
  exact ⟨unknown, unowned, valid, roles⟩

private theorem cleanup_admitted_priority {input : Input} (admitted : Admitted input) :
    cleanup input =
      if input.slots.staged ≠ .absent then .step .staged
      else if input.slots.retired ≠ .absent then .step .retired
      else if input.slots.live ≠ .absent then .step .live
      else .complete := by
  rcases admittedFacts admitted with ⟨unknown, unowned, valid, roles⟩
  simp [cleanup, unknown, unowned, valid, roles]

private theorem cleanup_success_requires_admission {input : Input}
    (success : cleanup input = .complete ∨ ∃ role, cleanup input = .step role) :
    Admitted input := by
  unfold cleanup at success
  by_cases unknown : HasUnknown input.slots
  · simp [unknown] at success
  · simp [unknown] at success
    by_cases unowned : HasUnownedObservation input.owner input.slots
    · simp [unowned] at success
    · simp [unowned] at success
      by_cases valid : ValidOperation input.operation
      · simp [valid] at success
        by_cases roles : RoleValidClaims input.owner input.operation input.slots
        · exact ⟨valid, unknown, unowned, roles⟩
        · simp [roles] at success
      · simp [valid] at success

private theorem cleanup_admitted_has_completion_or_step {input : Input}
    (admitted : Admitted input) :
    cleanup input = .complete ∨ ∃ role, cleanup input = .step role := by
  rw [cleanup_admitted_priority admitted]
  by_cases staged : input.slots.staged ≠ .absent
  · right
    simp [staged]
  · have stagedAbsent := Decidable.of_not_not staged
    by_cases retired : input.slots.retired ≠ .absent
    · right
      simp [stagedAbsent, retired]
    · have retiredAbsent := Decidable.of_not_not retired
      by_cases live : input.slots.live ≠ .absent
      · right
        simp [stagedAbsent, retiredAbsent, live]
      · left
        simp [stagedAbsent, retiredAbsent, Decidable.of_not_not live]

private theorem occupied_zero_iff_absent (observation : Observation) :
    occupied observation = 0 ↔ observation = .absent := by
  cases observation <;> simp [occupied]

private theorem occupied_le_one (observation : Observation) : occupied observation ≤ 1 := by
  cases observation <;> simp [occupied]

private theorem occupied_one_of_nonabsent {observation : Observation}
    (notAbsent : observation ≠ .absent) : occupied observation = 1 := by
  cases observation <;> simp_all [occupied]

private theorem count_zero_iff_empty (slots : Slots) : count slots = 0 ↔ Empty slots := by
  simp [count, Empty, Nat.add_eq_zero_iff, occupied_zero_iff_absent, and_assoc]

private theorem count_le_three (slots : Slots) : count slots ≤ 3 := by
  cases slots with
  | mk live staged retired =>
    have liveBound := occupied_le_one live
    have stagedBound := occupied_le_one staged
    have retiredBound := occupied_le_one retired
    simp only [count]
    omega

private theorem count_clear_plus_occupied (slots : Slots) (role : Role) :
    count (clear slots role) + occupied (atRole slots role) = count slots := by
  cases role <;> cases slots <;>
    simp [count, clear, atRole, occupied] <;> omega

private theorem clear_preserves_admission {input : Input} (admitted : Admitted input)
    (role : Role) : Admitted { input with slots := clear input.slots role } := by
  rcases admittedFacts admitted with ⟨unknown, unowned, valid, roles⟩
  cases role <;>
    simp_all [Admitted, RoleValidKnownOwnedClaims, RoleValidClaims, clear,
      HasUnknown, HasUnownedObservation, ForeignOrMismatchedOwner,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid]

private theorem cleanup_step_selects_present {input : Input} {role : Role}
    (step : cleanup input = .step role) : atRole input.slots role ≠ .absent := by
  have admitted := cleanup_success_requires_admission (Or.inr ⟨role, step⟩)
  rw [cleanup_admitted_priority admitted] at step
  by_cases staged : input.slots.staged ≠ .absent
  · simp [staged] at step
    cases step
    simpa [atRole] using staged
  · have stagedAbsent := Decidable.of_not_not staged
    simp [stagedAbsent] at step
    by_cases retired : input.slots.retired ≠ .absent
    · simp [retired] at step
      cases step
      simpa [atRole] using retired
    · have retiredAbsent := Decidable.of_not_not retired
      simp [retiredAbsent] at step
      by_cases live : input.slots.live ≠ .absent
      · simp [live] at step
        cases step
        simpa [atRole] using live
      · have liveAbsent := Decidable.of_not_not live
        simp [liveAbsent] at step

private theorem simulate_finishes_by_bound :
    ∀ fuel input, Admitted input → count input.slots ≤ fuel →
      cleanup (simulate model fuel input) = .complete := by
  intro fuel
  induction fuel with
  | zero =>
    intro input admitted bound
    have zero : count input.slots = 0 := Nat.eq_zero_of_le_zero bound
    have empty := (count_zero_iff_empty input.slots).1 zero
    have complete : cleanup input = .complete := by
      rw [cleanup_admitted_priority admitted]
      rcases empty with ⟨live, staged, retired⟩
      simp [live, staged, retired]
    simpa [simulate] using complete
  | succ fuel ih =>
    intro input admitted bound
    rcases cleanup_admitted_has_completion_or_step admitted with complete | ⟨role, step⟩
    · simp [simulate, model, complete]
    · simp [simulate, model, step]
      apply ih { input with slots := clear input.slots role }
      · exact clear_preserves_admission admitted role
      · have selected := cleanup_step_selects_present step
        have decreases := count_clear_plus_occupied input.slots role
        rw [occupied_one_of_nonabsent selected] at decreases
        change count (clear input.slots role) ≤ fuel
        omega

theorem LC1_unknown_refusal : LC1_unknown_refusal model := by
  intro input unknown
  change cleanup input = .blocked .unknown
  simp [cleanup, unknown]

theorem LC2_unowned_refusal : LC2_unowned_refusal model := by
  intro input unknown unowned
  change cleanup input = .blocked .unowned
  simp [cleanup, unknown, unowned]

theorem LC3_actions_require_owned_valid_roles :
    LC3_actions_require_owned_valid_roles model := by
  intro input action
  change cleanup input = .complete ∨ ∃ role, cleanup input = .step role at action
  exact cleanup_success_requires_admission action

theorem LC4_step_selects_present_role : LC4_step_selects_present_role model := by
  intro input role step
  change cleanup input = .step role at step
  exact cleanup_step_selects_present step

theorem LC5_completion_is_exact : LC5_completion_is_exact model := by
  intro input
  change cleanup input = .complete ↔ Admitted input ∧ Empty input.slots
  constructor
  · intro complete
    have admitted := cleanup_success_requires_admission (Or.inl complete)
    have stagedAbsent : input.slots.staged = .absent := by
      by_cases staged : input.slots.staged ≠ .absent
      · simp [cleanup_admitted_priority admitted, staged] at complete
      · exact Decidable.of_not_not staged
    have retiredAbsent : input.slots.retired = .absent := by
      by_cases retired : input.slots.retired ≠ .absent
      · simp [cleanup_admitted_priority admitted, stagedAbsent, retired] at complete
      · exact Decidable.of_not_not retired
    have liveAbsent : input.slots.live = .absent := by
      by_cases live : input.slots.live ≠ .absent
      · simp [cleanup_admitted_priority admitted, stagedAbsent, retiredAbsent, live] at complete
      · exact Decidable.of_not_not live
    exact ⟨admitted, ⟨liveAbsent, stagedAbsent, retiredAbsent⟩⟩
  · rintro ⟨admitted, empty⟩
    rcases empty with ⟨live, ⟨staged, retired⟩⟩
    rw [cleanup_admitted_priority admitted]
    simp [live, staged, retired]

theorem LC6_admitted_residual_progresses :
    LC6_admitted_residual_progresses model := by
  intro input admitted nonempty
  change ∃ role, cleanup input = .step role
  rw [cleanup_admitted_priority admitted]
  by_cases staged : input.slots.staged ≠ .absent
  · simp [staged]
  · by_cases retired : input.slots.retired ≠ .absent
    · simp [staged, retired]
    · have stagedAbsent := Decidable.of_not_not staged
      have retiredAbsent := Decidable.of_not_not retired
      by_cases live : input.slots.live ≠ .absent
      · simp [stagedAbsent, retiredAbsent, live]
      · have liveAbsent := Decidable.of_not_not live
        exact (nonempty ⟨liveAbsent, ⟨stagedAbsent, retiredAbsent⟩⟩).elim

theorem LC7_step_preserves_admission : LC7_step_preserves_admission model := by
  intro input role step
  change cleanup input = .step role at step
  have admitted := cleanup_success_requires_admission (Or.inr ⟨role, step⟩)
  exact clear_preserves_admission admitted role

theorem LC8_step_decreases_role_count : LC8_step_decreases_role_count model := by
  intro input role step
  change cleanup input = .step role at step
  have selected := cleanup_step_selects_present step
  have countIdentity := count_clear_plus_occupied input.slots role
  rw [occupied_one_of_nonabsent selected] at countIdentity
  exact countIdentity

theorem LC9_three_steps_finish : LC9_three_steps_finish model := by
  intro input admitted
  have bound := count_le_three input.slots
  exact simulate_finishes_by_bound 3 input admitted bound

theorem LC10_archive_priority : LC10_archive_priority model := by
  constructor
  · intro input admitted staged
    change cleanup input = .step .staged
    rw [cleanup_admitted_priority admitted]
    simp [staged]
  constructor
  · intro input admitted staged retired
    change cleanup input = .step .retired
    rw [cleanup_admitted_priority admitted]
    simp [staged, retired]
  · intro input admitted staged retired live
    change cleanup input = .step .live
    rw [cleanup_admitted_priority admitted]
    simp [staged, retired, live]

theorem LC11_invalid_operation_refused :
    LC11_invalid_operation_refused model := by
  intro input unknown unowned invalid
  change cleanup input = .blocked .operation
  simp [cleanup, unknown, unowned, invalid]

theorem LC12_invalid_role_claim_refused :
    LC12_invalid_role_claim_refused model := by
  intro input unknown unowned valid invalidRoles
  change cleanup input = .blocked .drift
  simp [cleanup, unknown, unowned, valid, invalidRoles]

end PluginSdk.Installer.LocalSlot.Cleanup.Proofs
