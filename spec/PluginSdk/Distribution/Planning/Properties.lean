import PluginSdk.Distribution.Planning.Types

namespace PluginSdk.Distribution.Planning

def D1_accepted_steps_exact (model : Interface) : Prop :=
  ∀ input steps, model.normalize input = .ready steps →
    steps.toList.Perm (ReadySteps input.toList) ∧ FullyReady input.toList ∧
    (steps.toList.map (·.target.value)).Pairwise Utf8Before ∧
    (steps.toList.map (·.installation)).Nodup

def D2_ready_destinations_accepted (model : Interface) : Prop :=
  ∀ input, FullyReady input.toList → (input.toList.map CandidateTarget).Nodup →
    ((ReadySteps input.toList).map (·.installation)).Nodup →
    ∃ steps, model.normalize input = .ready steps

def D3_issues_exact (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input.toList issue ↔
    ∃ issues, model.normalize input = .blocked issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.normalize input = .blocked issues →
    (issues.toList.map IssueKey).Pairwise Compiler.KeyBefore)

def D4_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.toList.Perm right.toList → model.normalize left = model.normalize right

end PluginSdk.Distribution.Planning
