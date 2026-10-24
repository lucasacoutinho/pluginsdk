import PluginSdk.Installer.Execution.Types

namespace PluginSdk.Installer.Execution

def I1_quiescence_exact (interface : Interface) : Prop :=
  ∀ input, interface.status input = .quiescent ↔ QuietEvidence input

def I2_activity_exact (interface : Interface) : Prop :=
  ∀ input, interface.status input = .active ↔ ActiveEvidence input

def I3_unknown_exact (interface : Interface) : Prop :=
  ∀ input, interface.status input = .unknown ↔
    ¬ QuietEvidence input ∧ ¬ ActiveEvidence input

def I4_job_accounting_not_completion (interface : Interface) : Prop :=
  ∀ name observedName state,
    interface.status ⟨.windowsJob name, .windowsJob observedName state⟩ ≠ .quiescent

end PluginSdk.Installer.Execution
