import PluginSdk.Installer.LocalObservation.Types
import PluginSdk.Lifecycle.Model

namespace PluginSdk.Installer.LocalObservation

def LO1_auxiliary_roles_force_unknown (observer : Interface) : Prop :=
  ∀ input, ¬ AuxiliaryAbsent input.slots → observer.observe input = .unknown

def LO2_absence_is_exact (observer : Interface) : Prop :=
  ∀ input, observer.observe input = .absent ↔
    AuxiliaryAbsent input.slots ∧ input.slots.live = .absent

def LO3_owned_present_preserves_identity_and_basis (observer : Interface) : Prop :=
  ∀ input basis identity, observer.observe input = .present basis (some identity) ↔
    AuxiliaryAbsent input.slots ∧
      ∃ claim, input.slots.live = .complete claim basis ∧
        claim.owner = input.owner ∧ claim.identity = identity

def LO4_unowned_present_preserves_basis (observer : Interface) : Prop :=
  ∀ input basis, observer.observe input = .present basis none ↔
    AuxiliaryAbsent input.slots ∧
      (input.slots.live = .foreign basis ∨
        (∃ claim, input.slots.live = .partialPackage claim basis) ∨
        (∃ claim, input.slots.live = .complete claim basis ∧ claim.owner ≠ input.owner))

def LO5_unknown_is_exact (observer : Interface) : Prop :=
  ∀ input, observer.observe input = .unknown ↔
    ¬ AuxiliaryAbsent input.slots ∨ input.slots.live = .unknown

def LO6_pending_auxiliary_is_uncertain (observer : Interface) : Prop :=
  ∀ input pending, ¬ AuxiliaryAbsent input.slots →
    PluginSdk.Lifecycle.model.settle ⟨pending, observer.observe input⟩ =
      .uncertain pending .unknown

end PluginSdk.Installer.LocalObservation
