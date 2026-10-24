import PluginSdk.Installer.Worker.Model
import PluginSdk.Installer.Worker.Properties

namespace PluginSdk.Installer.Worker.Proofs

theorem O1_start_exact : PluginSdk.Installer.Worker.O1_start_exact model := by
  intro ⟨state, signal⟩
  cases state <;> cases signal <;> simp [model, admitWorkerRequest]

theorem O2_stop_exact : PluginSdk.Installer.Worker.O2_stop_exact model := by
  intro ⟨state, signal⟩
  cases state <;> cases signal <;> simp [model, admitWorkerRequest]

theorem O3_accepted_work_retained : PluginSdk.Installer.Worker.O3_accepted_work_retained model := by
  intro signal
  cases signal <;> rfl

theorem O4_no_second_start : PluginSdk.Installer.Worker.O4_no_second_start model := by
  intro ⟨state, first⟩ second
  cases state <;> cases first <;> cases second <;> simp [model, admitWorkerRequest]

end PluginSdk.Installer.Worker.Proofs
