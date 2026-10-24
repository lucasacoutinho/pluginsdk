import PluginSdk.Installer.Worker.Types

namespace PluginSdk.Installer.Worker

def O1_start_exact (interface : Interface) : Prop :=
  ∀ input, (interface.admit input).action = .start ↔
    input.state = .waiting ∧ input.signal = .request

def O2_stop_exact (interface : Interface) : Prop :=
  ∀ input, (interface.admit input).action = .stop ↔
    input.state = .waiting ∧ (input.signal = .invalid ∨ input.signal = .disconnect)

def O3_accepted_work_retained (interface : Interface) : Prop :=
  ∀ signal, interface.admit ⟨.accepted, signal⟩ = ⟨.accepted, .ignore⟩

def O4_no_second_start (interface : Interface) : Prop :=
  ∀ input signal, (interface.admit ⟨(interface.admit input).state, signal⟩).action ≠ .start

end PluginSdk.Installer.Worker
