import PluginSdk.Compiler.Agents.Model
import PluginSdk.Compiler.Agents.Properties

namespace PluginSdk.Compiler.Agents.Proofs

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process

private def CountName (agents : List Agent) (name : Name) : Nat :=
  agents.countP fun agent => agent.name == name

private theorem name_mem_map_iff_count_pos (agents : List Agent) (name : Name) :
    name ∈ agents.map Agent.name ↔ 0 < CountName agents name := by
  simp only [CountName, List.countP_pos_iff, List.mem_map]
  constructor
  · rintro ⟨agent, member, equal⟩
    exact ⟨agent, member, by simp [equal]⟩
  · rintro ⟨agent, member, matchFacts⟩
    have equal : agent.name = name := by simpa using matchFacts
    exact ⟨agent, member, equal⟩

@[simp] private theorem mem_duplicateNames (input : Input) (name : Name) :
    name ∈ duplicateNames input ↔ 1 < CountName input.agents name := by
  simp only [duplicateNames, mem_ordered, mem_unique, repeatedNameCandidates,
    List.mem_filter, decide_eq_true_eq]
  rw [name_mem_map_iff_count_pos]
  unfold CountName
  omega

@[simp] private theorem mem_failedIssues (input : Input) (issue : Issue) :
    issue ∈ failedIssues input ↔ RequiredIssue input issue := by
  cases issue with
  | duplicateAgent name =>
      simp [failedIssues, RequiredIssue, CountName]

private theorem name_eq_of_value_eq {left right : Name} (equal : left.value = right.value) :
    left = right := by
  cases left
  cases right
  simp_all

private theorem duplicateNames_perm {left right : Input}
    (permutation : left.agents.Perm right.agents) : duplicateNames left = duplicateNames right := by
  unfold duplicateNames
  apply ordered_unique_eq nameKey
  · intro name
    simp only [repeatedNameCandidates, List.mem_filter]
    have countEqual := permutation.countP_eq (fun agent => agent.name == name)
    have namesPerm := permutation.map Agent.name
    constructor
    · rintro ⟨member, repeated⟩
      exact ⟨namesPerm.mem_iff.mp member, by simpa [CountName, countEqual] using repeated⟩
    · rintro ⟨member, repeated⟩
      exact ⟨namesPerm.mem_iff.mpr member, by simpa [CountName, countEqual] using repeated⟩
  · intro a b equal
    cases a
    cases b
    simp_all [nameKey]

private theorem names_nodup_of_no_duplicates (agents : List Agent)
    (empty : duplicateNames ⟨.claudeCode, "", agents⟩ = []) : (agents.map Agent.name).Nodup := by
  apply List.nodup_iff_count.mpr
  intro name
  have noRepeated : ¬ 1 < CountName agents name := by
    intro repeated
    have member := (mem_duplicateNames ⟨.claudeCode, "", agents⟩ name).mpr repeated
    rw [empty] at member
    simp at member
  have countEq : (agents.map Agent.name).count name = CountName agents name := by
    simp [CountName, List.count_eq_countP, List.countP_map, Function.comp_def]
  rw [countEq]
  omega

private theorem countName_le_one_of_names_nodup (agents : List Agent) (name : Name)
    (nodup : (agents.map Agent.name).Nodup) : CountName agents name ≤ 1 := by
  have countEq : (agents.map Agent.name).count name = CountName agents name := by
    simp [CountName, List.count_eq_countP, List.countP_map, Function.comp_def]
  rw [← countEq]
  exact (List.nodup_iff_count.mp nodup) name

private theorem duplicateNames_nil_of_names_nodup (input : Input)
    (nodup : (input.agents.map Agent.name).Nodup) : duplicateNames input = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro name member
  have repeated := (mem_duplicateNames input name).mp member
  have atMost := countName_le_one_of_names_nodup input.agents name nodup
  change 1 < CountName input.agents name at repeated
  omega

private theorem failedIssues_nil_iff_duplicateNames_nil (input : Input) :
    failedIssues input = [] ↔ duplicateNames input = [] := by
  simp [failedIssues]

private theorem rendered_components (input : Input) (entries : List Entry)
    (rendered : model.render input = .rendered entries) :
    failedIssues input = [] ∧ entries = canonicalEntries input := by
  change render input = .rendered entries at rendered
  unfold render at rendered
  cases failure : failedIssues input with
  | nil =>
      simp only [failure] at rendered
      cases rendered
      exact ⟨rfl, rfl⟩
  | cons issue rest =>
      simp only [failure] at rendered
      cases rendered

private theorem rejected_list (input : Input) (issues : NonemptyList Issue)
    (rejected : model.render input = .rejected issues) : issues.toList = failedIssues input := by
  change render input = .rejected issues at rejected
  unfold render at rejected
  cases failure : failedIssues input with
  | nil => simp [failure] at rejected
  | cons head tail =>
      simp only [failure] at rejected
      cases issues with
      | mk issue rest =>
          simp only [Result.rejected.injEq] at rejected
          cases rejected
          rfl

private theorem duplicate_rejection_exact (input : Input) (issue : Issue) :
    RequiredIssue input issue ↔
      ∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList := by
  rw [← mem_failedIssues]
  constructor
  · intro member
    cases values : failedIssues input with
    | nil => simp [values] at member
    | cons head tail =>
        let issues : NonemptyList Issue := ⟨head, tail⟩
        refine ⟨issues, ?_, ?_⟩
        · have rejected : model.render input = .rejected issues := by
            change render input = .rejected issues
            rw [render, values]
          exact rejected
        · simpa [issues, NonemptyList.toList, values] using member
  · rintro ⟨issues, rejected, member⟩
    rw [rejected_list input issues rejected] at member
    exact member

private theorem key_before_singleton {left right : String}
    (ordered : KeyBefore [left] [right]) : Utf8Before left right := by
  cases ordered with
  | rel value => exact value
  | cons tail => cases tail

private theorem duplicateNames_ordered (input : Input) :
    (duplicateNames input).Pairwise (fun left right => Utf8Before left.value right.value) := by
  unfold duplicateNames
  have uniqueNodup := unique_nodup (repeatedNameCandidates input)
  have distinct : (unique (repeatedNameCandidates input)).Pairwise
      (fun left right => nameKey left ≠ nameKey right) := by
    exact uniqueNodup.imp (by
      intro left right different equal
      apply different
      have valuesEqual : left.value = right.value := by
        have singletonEqual : [left.value] = [right.value] := by
          simpa [nameKey] using equal
        simpa using singletonEqual
      exact name_eq_of_value_eq valuesEqual)
  have sorted := ordered_strict nameKey (unique (repeatedNameCandidates input)) distinct
  exact sorted.imp (fun {left right} less => key_before_singleton less)

private theorem failedIssueKeys_ordered (input : Input) :
    ((failedIssues input).map IssueKey).Pairwise KeyBefore := by
  unfold failedIssues
  simp only [List.map_map, Function.comp_def, IssueKey]
  change ((duplicateNames input).map (fun name => [name.value])).Pairwise KeyBefore
  apply List.Pairwise.map (fun name => [name.value])
    (fun left right ordered => by
      change KeyBefore [left.value] [right.value]
      exact List.Lex.rel ordered)
    (duplicateNames_ordered input)

private theorem pathValue_injective (host : Host) {left right : Name}
    (equal : PathValue host left = PathValue host right) : left = right := by
  have listEq := congrArg String.toList equal
  have normalized : "agents/".toList ++ (left.value.toList ++ (Extension host).toList) =
      "agents/".toList ++ (right.value.toList ++ (Extension host).toList) := by
    simpa only [PathValue, String.toList_append, List.append_assoc] using listEq
  have suffixEq := List.append_cancel_left normalized
  have namesEq := List.append_cancel_right suffixEq
  exact name_eq_of_value_eq (String.toList_inj.mp namesEq)

private theorem canonicalAgentNames_nodup (input : Input)
    (namesUnique : (input.agents.map Agent.name).Nodup) :
    ((canonicalAgents input).map Agent.name).Nodup := by
  have namesPerm := (ordered_perm AgentKey input.agents).map Agent.name
  exact namesPerm.nodup_iff.mpr namesUnique

private theorem canonicalAgents_names_ordered (input : Input)
    (namesUnique : (input.agents.map Agent.name).Nodup) :
    (canonicalAgents input).Pairwise
      (fun left right => Utf8Before left.name.value right.name.value) := by
  have namesPairwise : input.agents.Pairwise (fun left right => left.name ≠ right.name) :=
    List.pairwise_map.mp (List.nodup_iff_pairwise_ne.mp namesUnique)
  have keysDistinct : input.agents.Pairwise (fun left right => AgentKey left ≠ AgentKey right) :=
    namesPairwise.imp (by
      intro left right different equal
      apply different
      have valueEq : left.name.value = right.name.value := by
        have singletonEq : [left.name.value] = [right.name.value] := by
          simpa [AgentKey] using equal
        exact List.singleton_inj.mp singletonEq
      exact name_eq_of_value_eq valueEq)
  have sorted := ordered_strict AgentKey input.agents keysDistinct
  exact sorted.imp (fun {left right} less => key_before_singleton less)

theorem G1_declarations_exact : G1_declarations_exact model := by
  intro input entries rendered
  obtain ⟨noIssues, entriesEq⟩ := rendered_components input entries rendered
  have duplicateEmpty := (failedIssues_nil_iff_duplicateNames_nil input).mp noIssues
  have fixedDuplicateEmpty :
      duplicateNames ⟨.claudeCode, "", input.agents⟩ = [] := by
    simpa [duplicateNames, repeatedNameCandidates] using duplicateEmpty
  have namesUnique := names_nodup_of_no_duplicates input.agents fixedDuplicateEmpty
  have namesPerm : (canonicalEntries input).map Entry.name |>.Perm
      (input.agents.map Agent.name) := by
    rw [show (canonicalEntries input).map Entry.name =
      (canonicalAgents input).map Agent.name by simp [canonicalEntries, renderEntry]]
    exact (ordered_perm AgentKey input.agents).map Agent.name
  have entriesOrdered :
      ((canonicalEntries input).map (fun entry => entry.name.value)).Pairwise Utf8Before := by
    rw [show (canonicalEntries input).map (fun entry => entry.name.value) =
      (canonicalAgents input).map (fun agent => agent.name.value) by
        simp [canonicalEntries, renderEntry]]
    exact List.Pairwise.map (fun (agent : Agent) => agent.name.value)
      (fun _ _ ordered => ordered) (canonicalAgents_names_ordered input namesUnique)
  constructor
  · simpa [entriesEq] using namesPerm
  · exact ⟨namesUnique, by simpa [entriesEq] using entriesOrdered⟩

theorem G2_definition_preserved : G2_definition_preserved model := by
  intro input entries rendered agent agentMember
  obtain ⟨_, entriesEq⟩ := rendered_components input entries rendered
  have canonicalMember : agent ∈ canonicalAgents input :=
    (ordered_perm AgentKey input.agents).mem_iff.mpr agentMember
  have entryMember : renderEntry input agent ∈ entries := by
    rw [entriesEq]
    exact List.mem_map.mpr ⟨agent, canonicalMember, rfl⟩
  exact ⟨renderEntry input agent, entryMember,
    by simp [Matches, renderEntry, agentPath, Qualified]⟩

theorem G3_namespace_exact : G3_namespace_exact model := by
  intro input entries rendered entry member
  obtain ⟨_, entriesEq⟩ := rendered_components input entries rendered
  have canonicalMember : entry ∈ canonicalEntries input := by
    rw [← entriesEq]
    exact member
  obtain ⟨agent, _, entryEq⟩ := List.mem_map.mp canonicalMember
  subst entry
  rfl

theorem G4_paths_safe_distinct : G4_paths_safe_distinct model := by
  intro input entries rendered
  obtain ⟨noIssues, entriesEq⟩ := rendered_components input entries rendered
  have duplicateEmpty := (failedIssues_nil_iff_duplicateNames_nil input).mp noIssues
  have fixedDuplicateEmpty :
      duplicateNames ⟨.claudeCode, "", input.agents⟩ = [] := by
    simpa [duplicateNames, repeatedNameCandidates] using duplicateEmpty
  have namesUnique := names_nodup_of_no_duplicates input.agents fixedDuplicateEmpty
  have canonicalNamesUnique := canonicalAgentNames_nodup input namesUnique
  have canonicalNamePairwise : (canonicalAgents input).Pairwise
      (fun left right => left.name ≠ right.name) :=
    List.pairwise_map.mp (List.nodup_iff_pairwise_ne.mp canonicalNamesUnique)
  have canonicalPathsPairwise : (canonicalAgents input).Pairwise
      (fun left right =>
        (agentPath input.host left.name).value ≠ (agentPath input.host right.name).value) := by
    exact canonicalNamePairwise.imp (by
      intro left right different equal
      apply different
      have pathEqual : PathValue input.host left.name = PathValue input.host right.name := by
        simpa [agentPath] using equal
      exact pathValue_injective input.host pathEqual)
  have entriesPathsNodup :
      ((canonicalEntries input).map (fun entry => entry.path.value)).Nodup := by
    rw [show (canonicalEntries input).map (fun entry => entry.path.value) =
      (canonicalAgents input).map (fun agent => (agentPath input.host agent.name).value) by
        simp [canonicalEntries, renderEntry]]
    exact List.nodup_iff_pairwise_ne.mpr <| List.Pairwise.map
      (fun (agent : Agent) => (agentPath input.host agent.name).value)
      (fun _ _ distinct => distinct) canonicalPathsPairwise
  constructor
  · intro entry member
    have canonicalMember : entry ∈ canonicalEntries input := by
      rw [← entriesEq]
      exact member
    obtain ⟨agent, _, entryEq⟩ := List.mem_map.mp canonicalMember
    subst entry
    exact (agentPath input.host agent.name).contained
  · simpa [entriesEq] using entriesPathsNodup

theorem G5_duplicate_issues_exact : G5_duplicate_issues_exact model := by
  constructor
  · intro input issue
    exact duplicate_rejection_exact input issue
  · intro input issues rejected
    rw [rejected_list input issues rejected]
    exact failedIssueKeys_ordered input

theorem G6_unique_input_succeeds : G6_unique_input_succeeds model := by
  intro input namesUnique
  have duplicatesEmpty := duplicateNames_nil_of_names_nodup input namesUnique
  have issuesEmpty : failedIssues input = [] := by
    simp [failedIssues, duplicatesEmpty]
  refine ⟨canonicalEntries input, ?_⟩
  change render input = .rendered (canonicalEntries input)
  simp [render, issuesEmpty]

theorem G7_enumeration_invariant : G7_enumeration_invariant model := by
  intro left right hostEqual pluginEqual agentsPermutation
  have duplicatesEqual := duplicateNames_perm agentsPermutation
  have issuesEqual : failedIssues left = failedIssues right := by
    simp [failedIssues, duplicatesEqual]
  cases failure : failedIssues left with
  | nil =>
      have issuesRightEmpty : failedIssues right = [] := by
        rw [← issuesEqual]
        exact failure
      have duplicatesEmpty := (failedIssues_nil_iff_duplicateNames_nil left).mp failure
      have fixedDuplicatesEmpty :
          duplicateNames ⟨.claudeCode, "", left.agents⟩ = [] := by
        simpa [duplicateNames, repeatedNameCandidates] using duplicatesEmpty
      have namesUnique := names_nodup_of_no_duplicates left.agents fixedDuplicatesEmpty
      have namesPairwise : left.agents.Pairwise (fun l r => l.name ≠ r.name) :=
        List.pairwise_map.mp (List.nodup_iff_pairwise_ne.mp namesUnique)
      have keyInjective := key_injective_on (fun agent : Agent => agent.name) namesPairwise
      have canonicalEqual : canonicalAgents left = canonicalAgents right := by
        unfold canonicalAgents
        apply ordered_eq_of_perm AgentKey agentsPermutation
        intro a aMember b bMember keyEqual
        have bInLeft : b ∈ left.agents := agentsPermutation.mem_iff.mpr bMember
        have namesEqual : a.name = b.name := by
          have valuesEqual : a.name.value = b.name.value := by
            have singletonEqual : [a.name.value] = [b.name.value] := by
              simpa [AgentKey] using keyEqual
            exact List.singleton_inj.mp singletonEqual
          exact name_eq_of_value_eq valuesEqual
        exact keyInjective a aMember b bInLeft namesEqual
      have entriesEqual : canonicalEntries left = canonicalEntries right := by
        simp [canonicalEntries, canonicalEqual, renderEntry, agentPath,
          hostEqual, pluginEqual]
      change render left = render right
      simp [render, failure, issuesRightEmpty, entriesEqual]
  | cons issue rest =>
      have issuesRight : failedIssues right = issue :: rest := by
        rw [← issuesEqual]
        exact failure
      change render left = render right
      simp [render, failure, issuesRight]

theorem G8_empty_preserved : G8_empty_preserved model := by
  intro host plugin
  change render ⟨host, plugin, []⟩ = .rendered []
  simp [render, failedIssues, duplicateNames, repeatedNameCandidates,
    canonicalEntries, canonicalAgents, ordered, unique]

end PluginSdk.Compiler.Agents.Proofs
