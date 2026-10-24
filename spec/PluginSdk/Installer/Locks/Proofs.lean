import PluginSdk.Installer.Locks.Model
import PluginSdk.Installer.Locks.Properties

namespace PluginSdk.Installer.Locks.Proofs

theorem IL1_user_exact : PluginSdk.Installer.Locks.IL1_user_exact model := by
  intro home
  rfl

theorem IL2_project_exact : PluginSdk.Installer.Locks.IL2_project_exact model := by
  intro home root
  rfl

theorem IL3_same_project_subject_across_homes :
    PluginSdk.Installer.Locks.IL3_same_project_subject_across_homes model := by
  intro home₁ home₂ root
  simp [PluginSdk.Installer.Locks.ProjectSubjects, model,
    PluginSdk.Installer.Locks.installationLockSubjects]

theorem IL4_exactly_one_home_first_input_home :
    PluginSdk.Installer.Locks.IL4_exactly_one_home_first_input_home model := by
  intro scope
  cases scope with
  | user home =>
    exact ⟨[], by simp [model, PluginSdk.Installer.Locks.installationLockSubjects,
      PluginSdk.Installer.Locks.Scope.home, PluginSdk.Installer.Locks.HomeRoots]⟩
  | project home root =>
    exact ⟨[.project root], by simp [model,
      PluginSdk.Installer.Locks.installationLockSubjects,
      PluginSdk.Installer.Locks.Scope.home, PluginSdk.Installer.Locks.HomeRoots]⟩

end PluginSdk.Installer.Locks.Proofs
