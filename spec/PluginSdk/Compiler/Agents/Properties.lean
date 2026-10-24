import PluginSdk.Compiler.Agents.Types

namespace PluginSdk.Compiler.Agents

def G1_declarations_exact (model : Interface) : Prop :=
  ∀ input entries, model.render input = .rendered entries →
    (entries.map (·.name)).Perm (input.agents.map (·.name)) ∧ NamesUnique input ∧
    (entries.map (fun entry => entry.name.value)).Pairwise Utf8Before

def G2_definition_preserved (model : Interface) : Prop :=
  ∀ input entries, model.render input = .rendered entries →
    ∀ agent ∈ input.agents, ∃ entry ∈ entries, Matches input agent entry

def G3_namespace_exact (model : Interface) : Prop :=
  ∀ input entries, model.render input = .rendered entries →
    ∀ entry ∈ entries, entry.qualified = input.plugin ++ ":" ++ entry.name.value

def G4_paths_safe_distinct (model : Interface) : Prop :=
  ∀ input entries, model.render input = .rendered entries →
    (∀ entry ∈ entries, Contained entry.path.value) ∧
    (entries.map (fun entry => entry.path.value)).Nodup

def G5_duplicate_issues_exact (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.render input = .rejected issues →
    (issues.toList.map IssueKey).Pairwise KeyBefore)

def G6_unique_input_succeeds (model : Interface) : Prop :=
  ∀ input, NamesUnique input → ∃ entries, model.render input = .rendered entries

def G7_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.host = right.host → left.plugin = right.plugin →
    left.agents.Perm right.agents → model.render left = model.render right

def G8_empty_preserved (model : Interface) : Prop :=
  ∀ host plugin, model.render ⟨host, plugin, []⟩ = .rendered []

end PluginSdk.Compiler.Agents
