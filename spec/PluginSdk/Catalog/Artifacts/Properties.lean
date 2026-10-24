import PluginSdk.Catalog.Artifacts.Types

namespace PluginSdk.Catalog.Artifacts

def E1_accepted_packages_exact (model : Interface) : Prop :=
  ∀ input, model.check input = .accepted → Realizes input

def E2_complete_packages_accepted (model : Interface) : Prop :=
  ∀ input, Realizes input → model.check input = .accepted

def E3_diagnostics_exact (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.check input = .rejected issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.check input = .rejected issues →
    (issues.toList.map IssueKey).Pairwise (List.Lex Utf8Before))

def E4_enumeration_invariant (model : Interface) : Prop :=
  ∀ input artifacts, input.artifacts.Perm artifacts →
    model.check input = model.check { input with artifacts }

end PluginSdk.Catalog.Artifacts
