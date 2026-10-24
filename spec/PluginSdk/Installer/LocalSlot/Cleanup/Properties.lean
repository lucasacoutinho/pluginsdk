import PluginSdk.Installer.LocalSlot.Cleanup.Types

namespace PluginSdk.Installer.LocalSlot.Cleanup

def LC1_unknown_refusal (model : Interface) : Prop :=
  ∀ input, HasUnknown input.slots → model.cleanup input = .blocked .unknown

def LC2_unowned_refusal (model : Interface) : Prop :=
  ∀ input, ¬ HasUnknown input.slots → HasUnownedObservation input.owner input.slots →
    model.cleanup input = .blocked .unowned

def LC3_actions_require_owned_valid_roles (model : Interface) : Prop :=
  ∀ input, (model.cleanup input = .complete ∨ ∃ role, model.cleanup input = .step role) →
    Admitted input

def LC4_step_selects_present_role (model : Interface) : Prop :=
  ∀ input role, model.cleanup input = .step role → atRole input.slots role ≠ .absent

def LC5_completion_is_exact (model : Interface) : Prop :=
  ∀ input, model.cleanup input = .complete ↔ Admitted input ∧ Empty input.slots

def LC6_admitted_residual_progresses (model : Interface) : Prop :=
  ∀ input, Admitted input → ¬ Empty input.slots →
    ∃ role, model.cleanup input = .step role

def LC7_step_preserves_admission (model : Interface) : Prop :=
  ∀ input role, model.cleanup input = .step role →
    Admitted { input with slots := clear input.slots role }

def LC8_step_decreases_role_count (model : Interface) : Prop :=
  ∀ input role, model.cleanup input = .step role →
    count (clear input.slots role) + 1 = count input.slots

def LC9_three_steps_finish (model : Interface) : Prop :=
  ∀ input, Admitted input → model.cleanup (simulate model 3 input) = .complete

def LC10_archive_priority (model : Interface) : Prop :=
  (∀ input, Admitted input → input.slots.staged ≠ .absent →
    model.cleanup input = .step .staged) ∧
  (∀ input, Admitted input → input.slots.staged = .absent → input.slots.retired ≠ .absent →
    model.cleanup input = .step .retired) ∧
  (∀ input, Admitted input → input.slots.staged = .absent → input.slots.retired = .absent →
    input.slots.live ≠ .absent → model.cleanup input = .step .live)

def LC11_invalid_operation_refused (model : Interface) : Prop :=
  ∀ input, ¬ HasUnknown input.slots → ¬ HasUnownedObservation input.owner input.slots →
    ¬ ValidOperation input.operation → model.cleanup input = .blocked .operation

def LC12_invalid_role_claim_refused (model : Interface) : Prop :=
  ∀ input, ¬ HasUnknown input.slots → ¬ HasUnownedObservation input.owner input.slots →
    ValidOperation input.operation → ¬ RoleValidClaims input.owner input.operation input.slots →
    model.cleanup input = .blocked .drift

end PluginSdk.Installer.LocalSlot.Cleanup
