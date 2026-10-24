import PluginSdk.Installer.Companions.Types

namespace PluginSdk.Installer.Companions

open PluginSdk.Compiler

def F1_accepted_before_safe (model : Interface) : Prop :=
  ∀ input changes, model.review input = .ready changes → Safe input

def F2_safe_input_succeeds (model : Interface) : Prop :=
  ∀ input, Safe input → ∃ changes, model.review input = .ready changes

def F3_issues_exact (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.review input = .blocked issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.review input = .blocked issues →
    (issues.toList.map IssueKey).Pairwise KeyBefore)

def F4_required_names_exact (model : Interface) : Prop :=
  ∀ input changes, model.review input = .ready changes →
    (changes.map Change.name).Nodup ∧
    (∀ name, name ∈ changes.map Change.name ↔ RequiredName input name) ∧
    (changes.map (fun change => change.name.value)).Pairwise Utf8Before

def F5_changes_preserve_identities (model : Interface) : Prop :=
  ∀ input changes, model.review input = .ready changes →
    ∀ change, change ∈ changes ↔ ExpectedChange input change

def F6_unrelated_observations_irrelevant (model : Interface) : Prop :=
  ∀ left right, left.previous = right.previous → left.desired = right.desired →
    (∀ name, RequiredName left name → Observed left name = Observed right name) →
    model.review left = model.review right

def F7_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.previous.Perm right.previous → left.desired.Perm right.desired →
    left.observed.Perm right.observed → model.review left = model.review right

def F8_unchanged_set_keeps_only (model : Interface) : Prop :=
  ∀ input changes, input.previous = input.desired → model.review input = .ready changes →
    ∀ change ∈ changes, ∃ name digest, change = .keep name digest

end PluginSdk.Installer.Companions
