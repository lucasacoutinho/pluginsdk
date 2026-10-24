import PluginSdk.Project.Preview.Types

namespace PluginSdk.Project.Preview

def PV1_direct_clients (model : Interface) : Prop :=
  ∀ client desired provider, client ≠ .cursor →
    model.route ⟨client, desired, provider⟩ = .direct client desired

def PV2_no_provider (model : Interface) : Prop :=
  ∀ desired, model.route ⟨.cursor, desired, .none⟩ = .direct .cursor desired

def PV3_qualified_inheritance (model : Interface) : Prop :=
  model.route ⟨.cursor, .present, .qualified⟩ = .inherited

def PV4_unqualified_refusal (model : Interface) : Prop :=
  model.route ⟨.cursor, .present, .unqualified⟩ = .blocked

def PV5_removal_direct (model : Interface) : Prop :=
  ∀ client provider, model.route ⟨client, .absent, provider⟩ = .direct client .absent

def PV6_inherited_exact (model : Interface) : Prop :=
  ∀ input, model.route input = .inherited ↔
    input.client = .cursor ∧ input.desired = .present ∧ input.provider = .qualified

def PV7_apply_requires_provider (model : Interface) : Prop :=
  ∀ provider, model.mayApplyInherited provider = true ↔ ProviderSucceeded provider

def PV8_completion_inheritance_exact (model : Interface) : Prop :=
  ∀ provider cleanup, model.finish (.inherited provider cleanup) = .inherited ↔
    ProviderSucceeded provider ∧ LocalAbsenceConfirmed cleanup

def PV9_failed_inheritance (model : Interface) : Prop :=
  ∀ provider cleanup, ¬ (ProviderSucceeded provider ∧ LocalAbsenceConfirmed cleanup) →
    model.finish (.inherited provider cleanup) =
      if provider = .uncertain ∨ cleanup = .uncertain then .uncertain else .notApplied

def PV10_direct_completion (model : Interface) : Prop :=
  ∀ status, model.finish (.direct status) = status.toCompletion

end PluginSdk.Project.Preview
