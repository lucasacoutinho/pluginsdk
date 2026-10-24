import PluginSdk.Installer.ProjectActivation.Types

namespace PluginSdk.Installer.ProjectActivation

open PluginSdk.Compiler

def PA1_build_admission_exact (model : Interface) : Prop :=
  ∀ input, input.agents.Nodup ↔ ∃ cache activation, model.build input = .rendered cache activation

def PA2_duplicate_diagnostics_exact (model : Interface) : Prop :=
  (∀ input agent, Repeated input agent ↔
    ∃ duplicates, model.build input = .rejected duplicates ∧ agent ∈ duplicates.toList) ∧
  (∀ input duplicates, model.build input = .rejected duplicates →
    duplicates.toList.Nodup ∧ (duplicates.toList.map (fun name => name.value)).Pairwise Utf8Before)

def PA3_cache_paths_exact (model : Interface) : Prop :=
  ∀ input cache activation, model.build input = .rendered cache activation → CacheMatches input cache

def PA4_agent_bindings_exact (model : Interface) : Prop :=
  ∀ input cache activation, model.build input = .rendered cache activation →
    UniqueBindings activation.agents ∧
    (∀ binding, binding ∈ activation.agents ↔
      ∃ agent ∈ input.agents, BindingMatches input cache agent binding)

def PA5_registration_preserved (model : Interface) : Prop :=
  ∀ input cache activation, model.build input = .rendered cache activation →
    activation.registration = input.registration

def PA6_build_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.platform = right.platform → left.home = right.home →
    left.version = right.version → left.registration = right.registration →
    left.agents.Perm right.agents → model.build left = model.build right

def PA7_basic_package_has_no_agents (model : Interface) : Prop :=
  ∀ input, input.agents = [] →
    ∃ cache, model.build input = .rendered cache ⟨input.registration, []⟩

def PA8_market_source_does_not_change_cache (model : Interface) : Prop :=
  ∀ input cache activation root, model.build input = .rendered cache activation →
    model.build { input with registration := { input.registration with root := root } } =
      .rendered cache { activation with registration := { input.registration with root := root } }

def RA1_authority_admission_exact (model : Interface) : Prop :=
  ∀ input, model.review input = .ready ↔ Safe input

def RA2_authority_reason_exact (model : Interface) : Prop :=
  ∀ input reason, model.review input = .blocked reason ↔ RequiredReason input reason

def RA3_owned_declarations_exact (model : Interface) : Prop :=
  ∀ input, HasRoles input → model.review input = .ready → OwnedExact input

def RA4_foreign_collision_refused (model : Interface) : Prop :=
  ∀ input observation, HasRoles input → UniqueBasis input → Known input →
    observation ∈ input.observed → ForeignConflict input observation →
    model.review input = .blocked .unowned

def RA5_basic_package_requires_no_role_scan (model : Interface) : Prop :=
  ∀ observed, model.review ⟨[], [], observed⟩ = .ready

def RA6_authority_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.previous.Perm right.previous → left.desired.Perm right.desired →
    left.observed.Perm right.observed → model.review left = model.review right

end PluginSdk.Installer.ProjectActivation
