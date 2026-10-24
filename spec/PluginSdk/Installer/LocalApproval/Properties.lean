import PluginSdk.Installer.LocalApproval.Types

namespace PluginSdk.Installer.LocalApproval

def LA1_owners_exact (model : Interface) : Prop :=
  ∀ input approval, model.bind input = some approval →
    input.record.owner = input.owner ∧
    input.retained.owner = input.owner ∧
    approval.owner = input.owner

def LA2_full_identity_exact (model : Interface) : Prop :=
  ∀ input approval, model.bind input = some approval →
    input.record.identity = input.retained.identity ∧
    approval.identity = input.retained.identity

def LA3_physical_root_exact (model : Interface) : Prop :=
  ∀ input approval, model.bind input = some approval →
    input.record.root = input.root ∧
    approval.root = input.root

def LA4_retained_descriptors_exact (model : Interface) : Prop :=
  ∀ input approval, model.bind input = some approval →
    approval.files = input.retained.files.toList

def LA5_bound_input_produces_approval (model : Interface) : Prop :=
  ∀ input, BindingFacts input → model.bind input = some (BoundApproval input)

end PluginSdk.Installer.LocalApproval
