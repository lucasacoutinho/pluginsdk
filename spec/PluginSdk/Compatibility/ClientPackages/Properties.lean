import PluginSdk.Compatibility.ClientPackages.Types

namespace PluginSdk.Compatibility.ClientPackages

def CB1_family_exact (model : Interface) : Prop :=
  ∀ client, FitsClient client (model.packageClient client) = true

def CB2_normalization_exact (model : Interface) : Prop :=
  ∀ input, (model.buildClients input).toList = RequiredClients input

def CB3_coverage_exact (model : Interface) : Prop :=
  ∀ input family, family ∈ (model.buildClients input).toList ↔
    ∃ client ∈ input.toList, FitsClient client family = true

def CB4_valid_nonempty_output (model : Interface) : Prop :=
  ∀ input, (model.buildClients input).toList ≠ [] ∧
    (model.buildClients input).toList.Nodup ∧ (model.buildClients input).toList.length ≤ 2

def CB5_membership_invariant (model : Interface) : Prop :=
  ∀ left right, (∀ client, client ∈ left.toList ↔ client ∈ right.toList) →
    model.buildClients left = model.buildClients right

def CB6_legacy_and_cursor_conservation (model : Interface) : Prop :=
  (∀ family, model.packageClient (legacyClient family) = family) ∧
  (∀ input, model.buildClients input = model.buildClients (replaceCursorInput input))

end PluginSdk.Compatibility.ClientPackages
