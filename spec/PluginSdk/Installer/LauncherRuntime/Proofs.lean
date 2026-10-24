import PluginSdk.Installer.LauncherRuntime.Properties
import PluginSdk.Installer.LauncherRuntime.Model

namespace PluginSdk.Installer.LauncherRuntime.Proofs

theorem NR1_absent_requires_nothing : NR1_absent_requires_nothing model := by
  intro platform
  rfl

theorem NR3_portable_checks_exact : NR3_portable_checks_exact model := by
  exact ⟨rfl, rfl⟩

theorem NR4_unsupported_exact : NR4_unsupported_exact model := by
  intro input
  cases input with
  | mk platform kind =>
    cases kind with
    | absent => simp [model, requirements]
    | portable =>
      by_cases linux : platform = "linux" <;>
        by_cases windows : platform = "win32" <;>
          simp [model, requirements, linux, windows]

theorem NR5_node_admission_exact : NR5_node_admission_exact model := by
  intro observation
  simp [model, acceptsNode, Bool.and_eq_true, Bool.or_eq_true]

end PluginSdk.Installer.LauncherRuntime.Proofs
