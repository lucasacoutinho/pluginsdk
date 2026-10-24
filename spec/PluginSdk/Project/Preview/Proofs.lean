import PluginSdk.Project.Preview.Model
import PluginSdk.Project.Preview.Properties

namespace PluginSdk.Project.Preview.Proofs

open PluginSdk.Project.Preview

theorem PV1_direct_clients : PluginSdk.Project.Preview.PV1_direct_clients model := by
  intro client desired provider clientIsNotCursor
  cases client with
  | claudeCode => rfl
  | codex => rfl
  | cursor => exact False.elim (clientIsNotCursor rfl)

theorem PV2_no_provider : PluginSdk.Project.Preview.PV2_no_provider model := by
  intro desired
  cases desired <;> rfl

theorem PV3_qualified_inheritance : PluginSdk.Project.Preview.PV3_qualified_inheritance model := by
  rfl

theorem PV4_unqualified_refusal : PluginSdk.Project.Preview.PV4_unqualified_refusal model := by
  rfl

theorem PV5_removal_direct : PluginSdk.Project.Preview.PV5_removal_direct model := by
  intro client provider
  cases client <;> rfl

theorem PV6_inherited_exact : PluginSdk.Project.Preview.PV6_inherited_exact model := by
  intro input
  cases input with
  | mk client desired provider =>
      cases client <;> cases desired <;> cases provider <;> simp [model, route]

theorem PV7_apply_requires_provider : PluginSdk.Project.Preview.PV7_apply_requires_provider model := by
  intro provider
  cases provider <;> simp [model, mayApplyInherited, ProviderSucceeded]

theorem PV8_completion_inheritance_exact : PluginSdk.Project.Preview.PV8_completion_inheritance_exact model := by
  intro provider cleanup
  cases provider <;> cases cleanup <;>
    simp [model, finish, mayApplyInherited, localAbsenceConfirmedBool,
      ProviderSucceeded, LocalAbsenceConfirmed]

theorem PV9_failed_inheritance : PluginSdk.Project.Preview.PV9_failed_inheritance model := by
  intro provider cleanup didNotComplete
  cases provider <;> cases cleanup <;>
    simp [model, finish, mayApplyInherited, localAbsenceConfirmedBool,
      ProviderSucceeded, LocalAbsenceConfirmed] at *

theorem PV10_direct_completion : PluginSdk.Project.Preview.PV10_direct_completion model := by
  intro status
  cases status <;> rfl

end PluginSdk.Project.Preview.Proofs
