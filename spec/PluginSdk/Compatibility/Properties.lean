import PluginSdk.Compatibility.Types

namespace PluginSdk.Compatibility

def N1_selected_is_sole_profile (model : Interface) : Prop :=
  ∀ input profile, model.select input = .selected profile → EligibleProfiles input = [profile]

def N2_sole_profile_selected (model : Interface) : Prop :=
  ∀ input profile, EligibleProfiles input = [profile] → model.select input = .selected profile

def N3_blocking_exact (model : Interface) : Prop :=
  (∀ input, model.select input = .unqualified ↔ EligibleProfiles input = []) ∧
  (∀ input, model.select input = .ambiguous ↔ 1 < (EligibleProfiles input).length)

def N4_selection_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.query = right.query → left.profiles.Perm right.profiles →
    model.select left = model.select right

def N5_ownership_exact (model : Interface) : Prop :=
  ∀ input, model.ownershipCompatible input = true ↔
    UniqueRegistration input.profiles input.current ∧
    UniqueRegistration input.profiles input.retained ∧ SameAdapter input.current input.retained

def N6_ownership_isolation (model : Interface) : Prop :=
  ∀ input, model.ownershipCompatible input = true →
    input.current.host = input.retained.host ∧ input.current.platform = input.retained.platform ∧
    input.current.scope = input.retained.scope ∧ input.current.revision = input.retained.revision

def N7_qualified_version_change_retains_ownership (model : Interface) : Prop :=
  ∀ input, UniqueRegistration input.profiles input.current →
    UniqueRegistration input.profiles input.retained → SameAdapter input.current input.retained →
    input.current.version ≠ input.retained.version → model.ownershipCompatible input = true

def N8_ownership_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.current = right.current → left.retained = right.retained →
    left.profiles.Perm right.profiles → model.ownershipCompatible left = model.ownershipCompatible right

end PluginSdk.Compatibility
