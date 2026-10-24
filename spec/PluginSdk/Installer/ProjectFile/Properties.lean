import PluginSdk.Installer.ProjectFile.Types

namespace PluginSdk.Installer.ProjectFile

def PF1_linux_metadata_exact (model : Interface) : Prop :=
  (model.admit ⟨"linux", .absent⟩ = .ready .absent) ∧
  ∀ digest mode, model.admit ⟨"linux", .file digest mode⟩ = .ready (.file digest mode)

def PF2_windows_metadata_exact (model : Interface) : Prop :=
  (model.admit ⟨"win32", .absent⟩ = .ready .absent) ∧
  ∀ digest attributes security streams basis,
    model.admit ⟨"win32", .windowsFile digest attributes security streams⟩ = .ready basis ↔
      SupportedAttributes attributes ∧ streams = .defaultOnly ∧
        basis = .windowsFile digest attributes security

def PF3_unknown_platform_refused (model : Interface) : Prop :=
  ∀ input, input.platform ≠ "linux" → input.platform ≠ "win32" →
    model.admit input = .blocked .platform

def PF4_foreign_representation_refused (model : Interface) : Prop :=
  (∀ digest mode, model.admit ⟨"win32", .file digest mode⟩ = .blocked .representation) ∧
  (∀ digest attributes security streams,
    model.admit ⟨"linux", .windowsFile digest attributes security streams⟩ = .blocked .representation)

def PF5_review_requires_exact_basis (model : Interface) : Prop :=
  ∀ input basis, model.review input = .ready basis ↔
    input.reviewed = basis ∧ model.admit input.current = .ready basis

def PF6_review_preserves_refusal (model : Interface) : Prop :=
  ∀ input reason, model.admit input.current = .blocked reason →
    model.review input = .blocked reason

def PF7_metadata_drift_refused (model : Interface) : Prop :=
  ∀ input basis, model.admit input.current = .ready basis → input.reviewed ≠ basis →
    model.review input = .blocked .changed

end PluginSdk.Installer.ProjectFile
