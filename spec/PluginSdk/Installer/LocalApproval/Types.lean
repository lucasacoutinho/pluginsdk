import PluginSdk.Domain
import PluginSdk.FileRead.Types
import PluginSdk.Installer.LocalPackage.Types
import PluginSdk.Installer.LocalSlot.Types
import PluginSdk.ExecutableIntent.Types

namespace PluginSdk.Installer.LocalApproval

abbrev Owner := PluginSdk.Installer.LocalSlot.Owner
abbrev Identity := PluginSdk.Installer.LocalSlot.Identity
abbrev PhysicalIdentity := PluginSdk.FileRead.Identity

structure Record where
  owner : Owner
  identity : Identity
  root : PhysicalIdentity
  deriving DecidableEq, Repr

structure Retained where
  owner : Owner
  identity : Identity
  files : PluginSdk.NonemptyList PluginSdk.ExecutableIntent.RetainedFile

structure Input where
  owner : Owner
  root : PhysicalIdentity
  record : Record
  retained : Retained

def BindingFacts (input : Input) : Prop :=
  input.record.owner = input.owner ∧
  input.retained.owner = input.owner ∧
  input.record.root = input.root ∧
  input.record.identity = input.retained.identity

instance (input : Input) : Decidable (BindingFacts input) := by
  unfold BindingFacts
  infer_instance

def BoundApproval (input : Input) : PluginSdk.Installer.LocalPackage.Approval :=
  ⟨input.owner, input.retained.identity, input.root, input.retained.files.toList⟩

structure Interface where
  bind : Input → Option PluginSdk.Installer.LocalPackage.Approval

end PluginSdk.Installer.LocalApproval
