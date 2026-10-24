import PluginSdk.Installer.LocalSlot.Types

namespace PluginSdk.Installer.LocalSlot

def claimedComplete (owner : Owner) (identity : Identity) (basis : Fingerprint) : Observation :=
  .complete ⟨owner, identity⟩ basis

def claimedPartial (owner : Owner) (identity : Identity) (basis : Fingerprint) : Observation :=
  .partialPackage ⟨owner, identity⟩ basis

def localInput (owner : Owner) (operation : Operation)
    (live staged retired : Observation) : Input :=
  ⟨owner, operation, ⟨live, staged, retired⟩⟩

def LS1_unknown_refusal (model : Interface) : Prop :=
  ∀ input, HasUnknown input.slots → model.advance input = .blocked .unknown

def LS2_foreign_owner_refusal (model : Interface) : Prop :=
  (∀ input, HasUnownedObservation input.owner input.slots → IsBlocked (model.advance input)) ∧
  (∀ input, HasUnownedObservation input.owner input.slots → ¬ HasUnknown input.slots →
    model.advance input = .blocked .unowned)

def LS3_actions_require_valid_owned_roles (model : Interface) : Prop :=
  ∀ input, IsActionOrComplete (model.advance input) →
    ValidOperation input.operation ∧
    RoleValidKnownOwnedClaims input.owner input.operation input.slots

def LS4_retire_requires_previous_live (model : Interface) : Prop :=
  ∀ input, model.advance input = .step .retire → RetireState input

def LS5_publish_requires_staged_next (model : Interface) : Prop :=
  ∀ input, model.advance input = .step .publish → PublishState input

def LS6_discard_retired_requires_desired_live (model : Interface) : Prop :=
  ∀ input, model.advance input = .step .discardRetired → DiscardRetiredState input

def LS7_partial_cleanup_is_confined (model : Interface) : Prop :=
  ∀ input, model.advance input = .step .discardStage → DiscardStageState input

def LS8_prepare_preserves_initial_live (model : Interface) : Prop :=
  ∀ input, model.advance input = .step .prepare → PrepareState input

def LS9_completion_is_exact (model : Interface) : Prop :=
  ∀ input, model.advance input = .complete ↔ CompletionState input

def LS10_canonical_transition_table (model : Interface) : Prop :=
  (∀ (owner : Owner) (next : Identity),
    model.advance (localInput owner (.install next) .absent .absent .absent) = .step .prepare) ∧
  (∀ (owner : Owner) (next : Identity) (basis : Fingerprint),
    model.advance (localInput owner (.install next) .absent (claimedPartial owner next basis) .absent) =
        .step .discardStage) ∧
  (∀ (owner : Owner) (next : Identity) (basis : Fingerprint),
    model.advance (localInput owner (.install next) .absent (claimedComplete owner next basis) .absent) =
        .step .publish) ∧
  (∀ (owner : Owner) (next : Identity) (basis : Fingerprint),
    model.advance (localInput owner (.install next) (claimedComplete owner next basis) .absent .absent) =
        .complete) ∧
  (∀ (owner : Owner) (previous next : Identity), previous.plan ≠ next.plan →
    ∀ (basis : Fingerprint),
      model.advance (localInput owner (.replace previous next)
        (claimedComplete owner previous basis) .absent .absent) =
          .step .prepare) ∧
  (∀ (owner : Owner) (previous next : Identity), previous.plan ≠ next.plan →
    ∀ (liveBasis stageBasis : Fingerprint),
      model.advance (localInput owner (.replace previous next)
        (claimedComplete owner previous liveBasis) (claimedPartial owner next stageBasis) .absent) =
          .step .discardStage) ∧
  (∀ (owner : Owner) (previous next : Identity), previous.plan ≠ next.plan →
    ∀ (liveBasis stageBasis : Fingerprint),
      model.advance (localInput owner (.replace previous next)
        (claimedComplete owner previous liveBasis) (claimedComplete owner next stageBasis) .absent) =
          .step .retire) ∧
  (∀ (owner : Owner) (previous next : Identity), previous.plan ≠ next.plan →
    ∀ (stageBasis retiredBasis : Fingerprint),
      model.advance (localInput owner (.replace previous next) .absent
        (claimedComplete owner next stageBasis) (claimedComplete owner previous retiredBasis)) =
          .step .publish) ∧
  (∀ (owner : Owner) (previous next : Identity), previous.plan ≠ next.plan →
    ∀ (liveBasis retiredBasis : Fingerprint),
      model.advance (localInput owner (.replace previous next)
        (claimedComplete owner next liveBasis) .absent
        (claimedComplete owner previous retiredBasis)) = .step .discardRetired) ∧
  (∀ (owner : Owner) (previous next : Identity), previous.plan ≠ next.plan →
    ∀ (basis : Fingerprint),
      model.advance (localInput owner (.replace previous next)
        (claimedComplete owner next basis) .absent .absent) =
          .complete) ∧
  (∀ (owner : Owner) (previous : Identity) (basis : Fingerprint),
    model.advance (localInput owner (.remove previous)
      (claimedComplete owner previous basis) .absent .absent) =
        .step .retire) ∧
  (∀ (owner : Owner) (previous : Identity) (basis : Fingerprint),
    model.advance (localInput owner (.remove previous) .absent .absent
      (claimedComplete owner previous basis)) =
        .step .discardRetired) ∧
  (∀ (owner : Owner) (previous : Identity),
    model.advance (localInput owner (.remove previous) .absent .absent .absent) = .complete)

def LS11_same_plan_replacement_refused (model : Interface) : Prop :=
  (∀ (owner : Owner) (previous next : Identity) (slots : Slots), previous.plan = next.plan →
    IsBlocked (model.advance ⟨owner, .replace previous next, slots⟩)) ∧
  (∀ (owner : Owner) (previous next : Identity) (slots : Slots), previous.plan = next.plan →
    ¬ HasUnknown slots → ¬ HasUnownedObservation owner slots →
    model.advance ⟨owner, .replace previous next, slots⟩ = .blocked .operation)

end PluginSdk.Installer.LocalSlot
