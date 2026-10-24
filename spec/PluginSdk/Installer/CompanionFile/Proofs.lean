import PluginSdk.Installer.CompanionFile.Model
import PluginSdk.Installer.CompanionFile.Properties

namespace PluginSdk.Installer.CompanionFile.Proofs

theorem RF1_linux_private_metadata_exact :
    _root_.PluginSdk.Installer.CompanionFile.RF1_linux_private_metadata_exact model := by
  constructor
  · rfl
  · intro digest mode basis
    by_cases isPrivate : mode = privateMode
    · simp [model, admit, ProjectFile.admit, isPrivate, eq_comm]
    · simp [model, admit, ProjectFile.admit, isPrivate]

theorem RF2_windows_metadata_exact :
    _root_.PluginSdk.Installer.CompanionFile.RF2_windows_metadata_exact model := by
  constructor
  · rfl
  · intro digest attributes security streams basis
    by_cases supported : ProjectFile.SupportedAttributes attributes
    · by_cases defaultOnly : streams = .defaultOnly <;>
        simp [model, admit, ProjectFile.admit, supported, defaultOnly, eq_comm]
    · simp [model, admit, ProjectFile.admit, supported]

theorem RF3_unknown_platform_refused :
    _root_.PluginSdk.Installer.CompanionFile.RF3_unknown_platform_refused model := by
  intro input notLinux notWindows
  simp [model, admit, ProjectFile.admit, notLinux, notWindows]

theorem RF4_foreign_representation_refused :
    _root_.PluginSdk.Installer.CompanionFile.RF4_foreign_representation_refused model := by
  constructor <;> intros <;> simp [model, admit, ProjectFile.admit]

theorem RF5_review_requires_exact_basis :
    _root_.PluginSdk.Installer.CompanionFile.RF5_review_requires_exact_basis model := by
  intro input basis
  cases admitted : admit input.current with
  | blocked reason => simp [model, review, admitted]
  | ready admittedBasis =>
    by_cases same : input.reviewed = admittedBasis
    · simp [model, review, admitted, same, eq_comm]
    · simp [model, review, admitted, same, eq_comm]
      intro basisEqReviewed basisEqAdmitted
      apply same
      calc
        input.reviewed = basis := basisEqReviewed.symm
        _ = admittedBasis := basisEqAdmitted

theorem RF6_review_preserves_refusal :
    _root_.PluginSdk.Installer.CompanionFile.RF6_review_preserves_refusal model := by
  intro input reason refused
  have refused' : admit input.current = .blocked reason := by
    simpa [model] using refused
  simp [model, review, refused']

theorem RF7_metadata_drift_refused :
    _root_.PluginSdk.Installer.CompanionFile.RF7_metadata_drift_refused model := by
  intro input basis admitted reviewed
  have admitted' : admit input.current = .ready basis := by
    simpa [model] using admitted
  simp [model, review, admitted', reviewed]

theorem RF8_projection_exact :
    _root_.PluginSdk.Installer.CompanionFile.RF8_projection_exact model := by
  constructor
  · intro input basis admitted
    have admitted' : admit input = .ready basis := by
      simpa [model] using admitted
    simp [model, observe, admitted']
  constructor
  · intro input reason refused
    have refused' : admit input = .blocked reason := by
      simpa [model] using refused
    simp [model, observe, refused']
  · intro input
    cases admitted : admit input with
    | ready basis => cases basis <;> simp [model, observe, projectedBasis, admitted]
    | blocked reason => simp [model, observe, admitted]

end PluginSdk.Installer.CompanionFile.Proofs
