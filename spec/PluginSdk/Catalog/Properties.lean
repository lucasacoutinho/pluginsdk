import PluginSdk.Catalog.Rules

namespace PluginSdk.Catalog

def C1_registration_adds_only_absent_key (model : Interface) : Prop :=
  ∀ ledger release next, model.register ledger release = .registered next ↔
    next = ledger ++ [release] ∧ ∀ prior ∈ ledger, prior.key ≠ release.key

def C2_conflicting_identity_rejected (model : Interface) : Prop :=
  ∀ ledger release, (∃ prior ∈ ledger, prior.key = release.key ∧ prior ≠ release) →
    model.register ledger release = .conflict

def C3_consistent_replay_unchanged (model : Interface) : Prop :=
  ∀ ledger release, release ∈ ledger → ConsistentKey ledger release →
    model.register ledger release = .unchanged

def C4_existing_bindings_preserved (model : Interface) : Prop :=
  ∀ ledger release prior, prior ∈ ledger →
    prior ∈ StateAfter ledger (model.register ledger release) ∧
    ∀ next ∈ StateAfter ledger (model.register ledger release), next.key = prior.key → next ∈ ledger

def C5_resolution_selects_exact_artifact (model : Interface) : Prop :=
  ∀ ledger key target release artifact,
    model.resolve ledger key target = .resolved release artifact →
      release ∈ ledger ∧ release.key = key ∧ ConsistentKey ledger release ∧
        Selects release target artifact

def C6_available_artifact_resolves (model : Interface) : Prop :=
  ∀ ledger release target artifact,
    release ∈ ledger → ConsistentKey ledger release → Selects release target artifact →
      model.resolve ledger release.key target = .resolved release artifact

end PluginSdk.Catalog
