import PluginSdk.WindowsPath.Model

namespace PluginSdk.WindowsPath.Proofs

theorem WP15_native_exact_matches : WP15_native_exact_matches model := by
  intro platform path
  simp [model, matchesNativePath]

theorem WP16_native_other_platform_exact : WP16_native_other_platform_exact model := by
  intro input platform
  change matchesNativePath input = true ↔ input.reported = input.expected
  by_cases same : input.reported = input.expected <;>
    simp [matchesNativePath, same, platform]

theorem WP17_native_admission_exact : WP17_native_admission_exact model := by
  intro input
  change matchesNativePath input = true ↔ NativePathFacts input
  by_cases same : input.reported = input.expected <;>
    simp [matchesNativePath, NativePathFacts, same, and_assoc]

theorem WP18_native_unsafe_has_no_alias : WP18_native_unsafe_has_no_alias model := by
  intro input unsafePath
  change matchesNativePath input = true ↔ input.reported = input.expected
  by_cases same : input.reported = input.expected <;>
    simp [matchesNativePath, same, unsafePath]

theorem WP19_native_other_path_refused : WP19_native_other_path_refused model := by
  intro input different unrecognized
  change matchesNativePath input = false
  simp [matchesNativePath, different, unrecognized]

theorem WP20_native_extended_matches : WP20_native_extended_matches model := by
  intro path safe
  change matchesNativePath ⟨"win32", path, extendedDosPath path⟩ = true
  by_cases same : extendedDosPath path = path <;>
    simp [matchesNativePath, same, safe]

end PluginSdk.WindowsPath.Proofs
