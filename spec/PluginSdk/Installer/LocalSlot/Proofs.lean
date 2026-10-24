import PluginSdk.Installer.LocalSlot.Model
import PluginSdk.Installer.LocalSlot.Properties

namespace PluginSdk.Installer.LocalSlot.Proofs

open PluginSdk.Installer.LocalSlot

private theorem identity_ne_symm_of_plan_ne {previous next : Identity}
    (different : previous.plan ≠ next.plan) : next ≠ previous := by
  intro same
  apply different
  exact (congrArg PluginSdk.Lifecycle.Identity.plan same).symm

theorem LS1_unknown_refusal : LS1_unknown_refusal model := by
  intro input unknown
  change advance input = .blocked .unknown
  simp [advance, unknown]

theorem LS2_foreign_owner_refusal : LS2_foreign_owner_refusal model := by
  constructor
  · intro input unowned
    change IsBlocked (advance input)
    by_cases unknown : HasUnknown input.slots
    · simp [advance, unknown, IsBlocked]
    · simp [advance, unknown, unowned, IsBlocked]
  · intro input unowned known
    change advance input = .blocked .unowned
    simp [advance, known, unowned]

theorem LS3_actions_require_valid_owned_roles : LS3_actions_require_valid_owned_roles model := by
  intro input action
  change IsActionOrComplete (advance input) at action
  by_cases unknown : HasUnknown input.slots
  · simp [advance, unknown, IsActionOrComplete] at action
  · simp [advance, unknown] at action
    by_cases unowned : HasUnownedObservation input.owner input.slots
    · simp [unowned, IsActionOrComplete] at action
    · simp [unowned] at action
      by_cases valid : ValidOperation input.operation
      · simp [valid] at action
        by_cases roles : RoleValidClaims input.owner input.operation input.slots
        · simp [roles] at action
          exact ⟨valid, unknown, unowned, roles⟩
        · simp [roles, IsActionOrComplete] at action
      · simp [valid, IsActionOrComplete] at action

theorem LS4_retire_requires_previous_live : LS4_retire_requires_previous_live model := by
  intro input step
  change advance input = .step .retire at step
  unfold advance at step
  repeat' (first | split at step | done)
  all_goals simp_all
  all_goals assumption

theorem LS5_publish_requires_staged_next : LS5_publish_requires_staged_next model := by
  intro input step
  change advance input = .step .publish at step
  unfold advance at step
  repeat' (first | split at step | done)
  all_goals simp_all
  all_goals assumption

theorem LS6_discard_retired_requires_desired_live :
    LS6_discard_retired_requires_desired_live model := by
  intro input step
  change advance input = .step .discardRetired at step
  unfold advance at step
  repeat' (first | split at step | done)
  all_goals simp_all
  all_goals assumption

theorem LS7_partial_cleanup_is_confined : LS7_partial_cleanup_is_confined model := by
  intro input step
  change advance input = .step .discardStage at step
  unfold advance at step
  repeat' (first | split at step | done)
  all_goals simp_all
  all_goals assumption

theorem LS8_prepare_preserves_initial_live : LS8_prepare_preserves_initial_live model := by
  intro input step
  change advance input = .step .prepare at step
  unfold advance at step
  repeat' (first | split at step | done)
  all_goals simp_all
  all_goals assumption

theorem LS9_completion_is_exact : LS9_completion_is_exact model := by
  intro input
  change advance input = .complete ↔ CompletionState input
  constructor
  · intro completed
    unfold advance at completed
    repeat' (first | split at completed | done)
    all_goals simp_all
    all_goals assumption
    all_goals assumption
  · intro state
    cases input with
    | mk owner operation slots =>
      cases operation with
      | install next =>
        cases slots with
        | mk live staged retired =>
          cases live <;> cases staged <;> cases retired <;>
            simp_all [advance, CompletionState, DesiredLive, HasUnknown,
              HasUnownedObservation, ForeignOrMismatchedOwner, ValidOperation,
              RoleValidClaims, LiveRoleValid, StagedRoleValid, RetiredRoleValid,
              PrepareState, InitialLive, DiscardStageState, StageNextPartial,
              PartialClaim, RetireState, PublishState,
              DiscardRetiredState, CompleteClaim]
      | replace previous next =>
        cases slots with
        | mk live staged retired =>
          cases live <;> cases staged <;> cases retired <;>
            simp_all [advance, CompletionState, DesiredLive, HasUnknown,
              HasUnownedObservation, ForeignOrMismatchedOwner, ValidOperation,
              RoleValidClaims, LiveRoleValid, StagedRoleValid, RetiredRoleValid,
              PrepareState, InitialLive, DiscardStageState, StageNextPartial,
              PartialClaim, RetireState, StageNextComplete, PublishState,
              DiscardRetiredState, CompleteClaim, identity_ne_symm_of_plan_ne]
      | remove previous =>
        cases slots with
        | mk live staged retired =>
          cases live <;> cases staged <;> cases retired <;>
            simp_all [advance, CompletionState, DesiredLive, HasUnknown,
              HasUnownedObservation, ForeignOrMismatchedOwner, ValidOperation,
              RoleValidClaims, LiveRoleValid, StagedRoleValid, RetiredRoleValid,
              PrepareState, InitialLive, DiscardStageState, StageNextPartial,
              RetireState, PublishState,
              DiscardRetiredState, CompleteClaim]

theorem LS10_canonical_transition_table :
    _root_.PluginSdk.Installer.LocalSlot.LS10_canonical_transition_table model := by
  unfold _root_.PluginSdk.Installer.LocalSlot.LS10_canonical_transition_table
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · intro owner next
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, localInput]
  · intro owner next basis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      localInput, claimedPartial]
  · intro owner next basis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      RetireState, PublishState, CompleteClaim,
      localInput, claimedComplete]
  · intro owner next basis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      RetireState, PublishState, DiscardRetiredState, CompletionState,
      DesiredLive, CompleteClaim, localInput, claimedComplete]
  · intro owner previous next different basis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, CompleteClaim, localInput, claimedComplete, different]
  · intro owner previous next different liveBasis stageBasis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      CompleteClaim, localInput, claimedComplete, claimedPartial, different]
  · intro owner previous next different liveBasis stageBasis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      RetireState, StageNextComplete, CompleteClaim, localInput,
      claimedComplete, different]
  · intro owner previous next different stageBasis retiredBasis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      RetireState, StageNextComplete, PublishState, CompleteClaim,
      localInput, claimedComplete, different]
  · intro owner previous next different liveBasis retiredBasis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      RetireState, StageNextComplete, PublishState, DiscardRetiredState,
      DesiredLive, CompleteClaim, localInput,
      claimedComplete, different]
  · intro owner previous next different basis
    have nextNePrevious : next ≠ previous := identity_ne_symm_of_plan_ne different
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial, PartialClaim,
      RetireState, PublishState, DiscardRetiredState,
      DesiredLive, CompletionState, CompleteClaim, localInput,
      claimedComplete, different, nextNePrevious]
  · intro owner previous basis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial,
      RetireState, CompleteClaim, localInput, claimedComplete]
  · intro owner previous basis
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial,
      RetireState, PublishState, DiscardRetiredState,
      DesiredLive, CompleteClaim, localInput,
      claimedComplete]
  · intro owner previous
    simp [model, advance, HasUnknown, HasUnownedObservation,
      ForeignOrMismatchedOwner, ValidOperation, RoleValidClaims,
      LiveRoleValid, StagedRoleValid, RetiredRoleValid, PrepareState,
      InitialLive, DiscardStageState, StageNextPartial,
      RetireState, PublishState, DiscardRetiredState,
      DesiredLive, CompletionState, CompleteClaim, localInput]

theorem LS11_same_plan_replacement_refused : LS11_same_plan_replacement_refused model := by
  constructor
  · intro owner previous next slots samePlan
    change IsBlocked (advance { owner := owner, operation := .replace previous next, slots := slots })
    by_cases unknown : HasUnknown slots
    · simp [advance, unknown, IsBlocked]
    · simp [advance, unknown]
      by_cases unowned : HasUnownedObservation owner slots
      · simp [unowned, IsBlocked]
      · simp [unowned, ValidOperation, samePlan, IsBlocked]
  · intro owner previous next slots samePlan known unowned
    change advance { owner := owner, operation := .replace previous next, slots := slots } = .blocked .operation
    simp [advance, known, unowned, ValidOperation, samePlan]

end PluginSdk.Installer.LocalSlot.Proofs
