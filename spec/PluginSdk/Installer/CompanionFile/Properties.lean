import PluginSdk.Installer.CompanionFile.Types

namespace PluginSdk.Installer.CompanionFile

def RF1_linux_private_metadata_exact (model : Interface) : Prop :=
  (model.admit ⟨"linux", .absent⟩ = .ready .absent) ∧
  ∀ digest mode basis,
    model.admit ⟨"linux", .file digest mode⟩ = .ready basis ↔
      mode = privateMode ∧ basis = .file digest mode

def RF2_windows_metadata_exact (model : Interface) : Prop :=
  (model.admit ⟨"win32", .absent⟩ = .ready .absent) ∧
  ∀ digest attributes security streams basis,
    model.admit ⟨"win32", .windowsFile digest attributes security streams⟩ = .ready basis ↔
      ProjectFile.SupportedAttributes attributes ∧ streams = .defaultOnly ∧
        basis = .windowsFile digest attributes security

def RF3_unknown_platform_refused (model : Interface) : Prop :=
  ∀ input, input.platform ≠ "linux" → input.platform ≠ "win32" →
    model.admit input = .blocked (.metadata .platform)

def RF4_foreign_representation_refused (model : Interface) : Prop :=
  (∀ digest mode, model.admit ⟨"win32", .file digest mode⟩ = .blocked (.metadata .representation)) ∧
  (∀ digest attributes security streams,
    model.admit ⟨"linux", .windowsFile digest attributes security streams⟩ = .blocked (.metadata .representation))

def RF5_review_requires_exact_basis (model : Interface) : Prop :=
  ∀ input basis, model.review input = .ready basis ↔
    input.reviewed = basis ∧ model.admit input.current = .ready basis

def RF6_review_preserves_refusal (model : Interface) : Prop :=
  ∀ input reason, model.admit input.current = .blocked reason →
    model.review input = .blocked reason

def RF7_metadata_drift_refused (model : Interface) : Prop :=
  ∀ input basis, model.admit input.current = .ready basis → input.reviewed ≠ basis →
    model.review input = .blocked (.metadata .changed)

def RF8_projection_exact (model : Interface) : Prop :=
  (∀ input basis, model.admit input = .ready basis → model.observe input = projectedBasis basis) ∧
  (∀ input reason, model.admit input = .blocked reason → model.observe input = .unknown) ∧
  (∀ input, model.observe input ≠ .conflict)

end PluginSdk.Installer.CompanionFile
