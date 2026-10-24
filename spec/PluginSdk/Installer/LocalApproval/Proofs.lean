import PluginSdk.Installer.LocalApproval.Model
import PluginSdk.Installer.LocalApproval.Properties

namespace PluginSdk.Installer.LocalApproval.Proofs

open PluginSdk.Installer.LocalApproval

theorem LA1_owners_exact : PluginSdk.Installer.LocalApproval.LA1_owners_exact model := by
  intro input approval result
  by_cases facts : BindingFacts input
  · have equal : BoundApproval input = approval := by
      simpa [model, bindLocalApproval, facts] using result
    subst approval
    simp only [BindingFacts] at facts
    exact ⟨facts.1, facts.2.1, rfl⟩
  · simp [model, bindLocalApproval, facts] at result

theorem LA2_full_identity_exact :
    PluginSdk.Installer.LocalApproval.LA2_full_identity_exact model := by
  intro input approval result
  by_cases facts : BindingFacts input
  · have equal : BoundApproval input = approval := by
      simpa [model, bindLocalApproval, facts] using result
    subst approval
    simp only [BindingFacts] at facts
    exact ⟨facts.2.2.2, rfl⟩
  · simp [model, bindLocalApproval, facts] at result

theorem LA3_physical_root_exact :
    PluginSdk.Installer.LocalApproval.LA3_physical_root_exact model := by
  intro input approval result
  by_cases facts : BindingFacts input
  · have equal : BoundApproval input = approval := by
      simpa [model, bindLocalApproval, facts] using result
    subst approval
    simp only [BindingFacts] at facts
    exact ⟨facts.2.2.1, rfl⟩
  · simp [model, bindLocalApproval, facts] at result

theorem LA4_retained_descriptors_exact :
    PluginSdk.Installer.LocalApproval.LA4_retained_descriptors_exact model := by
  intro input approval result
  by_cases facts : BindingFacts input
  · have equal : BoundApproval input = approval := by
      simpa [model, bindLocalApproval, facts] using result
    subst approval
    rfl
  · simp [model, bindLocalApproval, facts] at result

theorem LA5_bound_input_produces_approval :
    PluginSdk.Installer.LocalApproval.LA5_bound_input_produces_approval model := by
  intro input facts
  simp [model, bindLocalApproval, facts]

end PluginSdk.Installer.LocalApproval.Proofs
