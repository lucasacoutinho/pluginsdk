import PluginSdk.Catalog.Tools.Types

namespace PluginSdk.Catalog.Tools

def T1_accepted_tools_exact (model : Interface) : Prop :=
  ∀ input tools, model.normalize input = .accepted tools →
    tools.Perm input ∧ tools.Pairwise (fun a b => Utf8Before a.name.value b.name.value)

def T2_distinct_tools_accepted (model : Interface) : Prop :=
  ∀ input, (input.map (·.name)).Nodup →
    ∃ tools, model.normalize input = .accepted tools

def T3_duplicate_diagnostics_exact (model : Interface) : Prop :=
  (∀ input name, 1 < CountName input name ↔
    ∃ names, model.normalize input = .rejected names ∧ name ∈ names.toList) ∧
  (∀ input names, model.normalize input = .rejected names →
    (names.toList.map (·.value)).Pairwise Utf8Before)

def T4_tool_enumeration_invariant (model : Interface) : Prop :=
  ∀ input tools, input.Perm tools → model.normalize input = model.normalize tools

def T5_accepted_binding_exact (model : Interface) : Prop :=
  ∀ input, model.bind input = .accepted → BindingMatches input

def T6_matching_binding_accepted (model : Interface) : Prop :=
  ∀ input, BindingMatches input → model.bind input = .accepted

def T7_binding_diagnostics_exact (model : Interface) : Prop :=
  (∀ input issue, RequiredBindingIssue input issue ↔
    ∃ issues, model.bind input = .rejected issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.bind input = .rejected issues →
    (issues.toList.map BindingIssueKey).Pairwise Utf8Before)

end PluginSdk.Catalog.Tools
