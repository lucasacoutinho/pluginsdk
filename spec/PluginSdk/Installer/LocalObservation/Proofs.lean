import PluginSdk.Installer.LocalObservation.Model
import PluginSdk.Installer.LocalObservation.Properties

namespace PluginSdk.Installer.LocalObservation.Proofs

open PluginSdk.Installer.LocalObservation

theorem LO1_auxiliary_roles_force_unknown :
    LO1_auxiliary_roles_force_unknown model := by
  intro input nonAbsent
  by_cases auxiliary : AuxiliaryAbsent input.slots
  · exact False.elim (nonAbsent auxiliary)
  · simp [model, observeLocalSlots, auxiliary]

theorem LO2_absence_is_exact : LO2_absence_is_exact model := by
  intro input
  cases input with
  | mk owner slots =>
      cases slots with
      | mk live staged retired =>
          cases live <;> cases staged <;> cases retired <;>
            simp [model, observeLocalSlots, AuxiliaryAbsent] <;>
              split <;> simp_all

theorem LO3_owned_present_preserves_identity_and_basis :
    LO3_owned_present_preserves_identity_and_basis model := by
  intro input basis identity
  cases input with
  | mk owner slots =>
      cases slots with
      | mk live staged retired =>
          by_cases auxiliary : AuxiliaryAbsent ⟨live, staged, retired⟩
          · rcases auxiliary with ⟨stagedAbsent, retiredAbsent⟩
            cases stagedAbsent
            cases retiredAbsent
            cases live with
            | absent => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | unknown => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | foreign liveBasis => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | partialPackage claim liveBasis => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | complete claim liveBasis =>
                by_cases ownerMatches : claim.owner = owner
                · simp [model, observeLocalSlots, AuxiliaryAbsent, ownerMatches]
                  constructor
                  · rintro ⟨sameBasis, sameIdentity⟩
                    exact ⟨claim, ⟨⟨rfl, sameBasis⟩, ⟨ownerMatches, sameIdentity⟩⟩⟩
                  · rintro ⟨otherClaim, ⟨⟨sameClaim, sameBasis⟩, ⟨_ownerMatches, sameIdentity⟩⟩⟩
                    cases sameClaim
                    exact ⟨sameBasis, sameIdentity⟩
                · simp [model, observeLocalSlots, AuxiliaryAbsent, ownerMatches]
          · by_cases stagedAbsent : staged = .absent
            · by_cases retiredAbsent : retired = .absent
              · exact False.elim (auxiliary ⟨stagedAbsent, retiredAbsent⟩)
              · simp [model, observeLocalSlots, AuxiliaryAbsent, stagedAbsent, retiredAbsent]
            · simp [model, observeLocalSlots, AuxiliaryAbsent, stagedAbsent]

theorem LO4_unowned_present_preserves_basis : LO4_unowned_present_preserves_basis model := by
  intro input basis
  cases input with
  | mk owner slots =>
      cases slots with
      | mk live staged retired =>
          by_cases auxiliary : AuxiliaryAbsent ⟨live, staged, retired⟩
          · rcases auxiliary with ⟨stagedAbsent, retiredAbsent⟩
            cases stagedAbsent
            cases retiredAbsent
            cases live with
            | absent => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | unknown => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | foreign liveBasis => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | partialPackage claim liveBasis => simp [model, observeLocalSlots, AuxiliaryAbsent]
            | complete claim liveBasis =>
                by_cases ownerMatches : claim.owner = owner
                · simp [model, observeLocalSlots, AuxiliaryAbsent, ownerMatches]
                · simp [model, observeLocalSlots, AuxiliaryAbsent, ownerMatches]
                  constructor
                  · intro sameBasis
                    exact ⟨claim, ⟨⟨rfl, sameBasis⟩, ownerMatches⟩⟩
                  · rintro ⟨otherClaim, ⟨sameClaim, sameBasis⟩, _ownerDiffers⟩
                    cases sameClaim
                    exact sameBasis
          · by_cases stagedAbsent : staged = .absent
            · by_cases retiredAbsent : retired = .absent
              · exact False.elim (auxiliary ⟨stagedAbsent, retiredAbsent⟩)
              · simp [model, observeLocalSlots, AuxiliaryAbsent, stagedAbsent, retiredAbsent]
            · simp [model, observeLocalSlots, AuxiliaryAbsent, stagedAbsent]

theorem LO5_unknown_is_exact : LO5_unknown_is_exact model := by
  intro input
  cases input with
  | mk owner slots =>
      cases slots with
      | mk live staged retired =>
          cases live <;> cases staged <;> cases retired <;>
            simp [model, observeLocalSlots, AuxiliaryAbsent] <;>
              split <;> simp_all

theorem LO6_pending_auxiliary_is_uncertain :
    LO6_pending_auxiliary_is_uncertain model := by
  intro input pending nonAbsent
  have observedUnknown : observeLocalSlots input = .unknown :=
    LO1_auxiliary_roles_force_unknown input nonAbsent
  simp [model, observedUnknown,
    PluginSdk.Lifecycle.model, PluginSdk.Lifecycle.settle,
    PluginSdk.Lifecycle.established]

end PluginSdk.Installer.LocalObservation.Proofs
