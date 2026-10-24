import PluginSdk.Installer.LocalSlot.Types
import PluginSdk.Lifecycle.Types

namespace PluginSdk.Installer.LocalObservation

abbrev Owner := PluginSdk.Installer.LocalSlot.Owner
abbrev Identity := PluginSdk.Installer.LocalSlot.Identity
abbrev Fingerprint := PluginSdk.Installer.LocalSlot.Fingerprint
abbrev Slots := PluginSdk.Installer.LocalSlot.Slots
abbrev SlotObservation := PluginSdk.Installer.LocalSlot.Observation
abbrev LifecycleObservation := PluginSdk.Lifecycle.Observation

structure Input where
  owner : Owner
  slots : Slots
  deriving DecidableEq, Repr

structure Interface where
  observe : Input → LifecycleObservation

def AuxiliaryAbsent (slots : Slots) : Prop :=
  slots.staged = .absent ∧ slots.retired = .absent

instance (slots : Slots) : Decidable (AuxiliaryAbsent slots) := by
  unfold AuxiliaryAbsent
  infer_instance

end PluginSdk.Installer.LocalObservation
