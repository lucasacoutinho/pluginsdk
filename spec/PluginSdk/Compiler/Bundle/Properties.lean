import PluginSdk.Compiler.Bundle.Types

namespace PluginSdk.Compiler.Bundle

def V1_digest_checked (model : Interface) : Prop :=
  ∀ input, model.check input = .valid → input.digest = input.computed

def V2_paths_canonical (model : Interface) : Prop :=
  ∀ input, model.check input = .valid →
    (paths input).Pairwise Utf8Before ∧ (paths input).Pairwise (fun left right => ¬ PathsConflict left right)

def V3_diagnostics_exact (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.check input = .rejected issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.check input = .rejected issues →
    (issues.toList.map IssueKey).Pairwise (List.Lex Utf8Before))

def V4_valid_bundle_accepted (model : Interface) : Prop :=
  ∀ input, input.digest = input.computed → (paths input).Pairwise Utf8Before →
    (paths input).Pairwise (fun left right => ¬ PathsConflict left right) → model.check input = .valid

end PluginSdk.Compiler.Bundle
