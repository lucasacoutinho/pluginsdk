import PluginSdk.Installer.ProjectFile.Model
import PluginSdk.Installer.ProjectFile.Properties

namespace PluginSdk.Installer.ProjectFile.Proofs

theorem PF1_linux_metadata_exact :
    _root_.PluginSdk.Installer.ProjectFile.PF1_linux_metadata_exact model := by
  constructor
  · rfl
  · intro digest mode
    rfl

theorem PF2_windows_metadata_exact :
    _root_.PluginSdk.Installer.ProjectFile.PF2_windows_metadata_exact model := by
  constructor
  · rfl
  · intro digest attributes security streams basis
    by_cases supported : SupportedAttributes attributes
    · by_cases defaultOnly : streams = .defaultOnly <;>
        simp [model, admit, supported, defaultOnly, eq_comm]
    · simp [model, admit, supported]

theorem PF3_unknown_platform_refused :
    _root_.PluginSdk.Installer.ProjectFile.PF3_unknown_platform_refused model := by
  intro input notLinux notWindows
  simp [model, admit, notLinux, notWindows]

theorem PF4_foreign_representation_refused :
    _root_.PluginSdk.Installer.ProjectFile.PF4_foreign_representation_refused model := by
  constructor <;> intros <;> simp [model, admit]

theorem PF5_review_requires_exact_basis :
    _root_.PluginSdk.Installer.ProjectFile.PF5_review_requires_exact_basis model := by
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

theorem PF6_review_preserves_refusal :
    _root_.PluginSdk.Installer.ProjectFile.PF6_review_preserves_refusal model := by
  intro input reason refused
  have refused' : admit input.current = .blocked reason := by
    simpa [model] using refused
  simp [model, review, refused']

theorem PF7_metadata_drift_refused :
    _root_.PluginSdk.Installer.ProjectFile.PF7_metadata_drift_refused model := by
  intro input basis admitted reviewed
  have admitted' : admit input.current = .ready basis := by
    simpa [model] using admitted
  simp [model, review, admitted', reviewed]

end PluginSdk.Installer.ProjectFile.Proofs
