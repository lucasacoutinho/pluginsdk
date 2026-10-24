import PluginSdk.Catalog.Tools.Model
import PluginSdk.Catalog.Tools.Properties

namespace PluginSdk.Catalog.Tools

private theorem countName_cons (head : ToolDescriptor) (tail : List ToolDescriptor)
    (name : Authorization.ToolName) :
    CountName (head :: tail) name =
      (if head.name = name then 1 else 0) + CountName tail name := by
  simp [CountName, List.countP_cons, Nat.add_comm]

private theorem name_mem_map_iff_count_pos (input : List ToolDescriptor)
    (name : Authorization.ToolName) :
    name ∈ input.map (·.name) ↔ 0 < CountName input name := by
  simp only [CountName, List.countP_pos_iff, List.mem_map]
  constructor
  · rintro ⟨tool, member, equal⟩
    exact ⟨tool, member, by simp [equal]⟩
  · rintro ⟨tool, member, matchFacts⟩
    have equal : tool.name = name := by simpa using matchFacts
    exact ⟨tool, member, equal⟩

@[simp] private theorem mem_duplicateNames (input : List ToolDescriptor)
    (name : Authorization.ToolName) :
    name ∈ duplicateNames input ↔ 1 < CountName input name := by
  simp only [duplicateNames, Compiler.mem_ordered, Compiler.mem_unique,
    repeatedNameCandidates, List.mem_filter, decide_eq_true_eq]
  rw [name_mem_map_iff_count_pos]
  omega

private theorem bindingIssueKey_injective {left right : BindingIssue}
    (equal : BindingIssueKey left = BindingIssueKey right) : left = right := by
  cases left <;> cases right <;> simp [BindingIssueKey] at equal <;> rfl

@[simp] private theorem mem_bindingIssues (input : BindingInput) (issue : BindingIssue) :
    issue ∈ bindingIssues input ↔ RequiredBindingIssue input issue := by
  cases issue <;> simp [bindingIssues, bindingIssueCandidates, Compiler.mem_ordered,
    Compiler.mem_unique, RequiredBindingIssue]

private theorem normalize_accepted_facts {input : List ToolDescriptor} {tools : List ToolDescriptor}
    (accepted : normalize input = .accepted tools) :
    duplicateNames input = [] ∧ Compiler.ordered toolKey input = tools := by
  by_cases empty : duplicateNames input = []
  · exact ⟨empty, by simpa [normalize, empty] using accepted⟩
  · simp [normalize, empty] at accepted

private theorem normalize_rejected_list {input : List ToolDescriptor}
    {names : NonemptyList Authorization.ToolName}
    (rejected : normalize input = .rejected names) :
    names.toList = duplicateNames input := by
  by_cases empty : duplicateNames input = []
  · simp [normalize, empty] at rejected
  · have equal : Compiler.nonempty (duplicateNames input) empty = names := by
      simpa [normalize, empty] using rejected
    have listEqual := congrArg NonemptyList.toList equal
    have sourceList : (Compiler.nonempty (duplicateNames input) empty).toList =
        duplicateNames input := Compiler.nonempty_toList _ _
    exact listEqual.symm.trans sourceList

private theorem bind_accepted_iff (input : BindingInput) :
    bind input = .accepted ↔ bindingIssues input = [] := by
  by_cases empty : bindingIssues input = []
  · simp [bind, empty]
  · simp [bind, empty]

private theorem bind_rejected_list {input : BindingInput}
    {issues : NonemptyList BindingIssue}
    (rejected : bind input = .rejected issues) :
    issues.toList = bindingIssues input := by
  by_cases empty : bindingIssues input = []
  · simp [bind, empty] at rejected
  · have equal : Compiler.nonempty (bindingIssues input) empty = issues := by
      simpa [bind, empty] using rejected
    have listEqual := congrArg NonemptyList.toList equal
    have sourceList : (Compiler.nonempty (bindingIssues input) empty).toList =
        bindingIssues input := Compiler.nonempty_toList _ _
    exact listEqual.symm.trans sourceList

private theorem duplicate_rejection_exact (input : List ToolDescriptor)
    (name : Authorization.ToolName) :
    1 < CountName input name ↔
      ∃ names, normalize input = .rejected names ∧ name ∈ names.toList := by
  rw [← mem_duplicateNames]
  constructor
  · intro member
    cases values : duplicateNames input with
    | nil => simp [values] at member
    | cons head tail =>
      let names : NonemptyList Authorization.ToolName := ⟨head, tail⟩
      refine ⟨names, ?_, ?_⟩
      · have rejected : normalize input = .rejected names := by
          rw [normalize, values]
          simp [names, Compiler.nonempty]
        exact rejected
      · simpa [names, NonemptyList.toList, values] using member
  · rintro ⟨names, rejected, member⟩
    rw [normalize_rejected_list rejected] at member
    exact member

private theorem binding_rejection_exact (input : BindingInput) (issue : BindingIssue) :
    RequiredBindingIssue input issue ↔
      ∃ issues, bind input = .rejected issues ∧ issue ∈ issues.toList := by
  rw [← mem_bindingIssues]
  constructor
  · intro member
    cases values : bindingIssues input with
    | nil => simp [values] at member
    | cons head tail =>
      let issues : NonemptyList BindingIssue := ⟨head, tail⟩
      refine ⟨issues, ?_, ?_⟩
      · have rejected : bind input = .rejected issues := by
          rw [bind, values]
          simp [issues, Compiler.nonempty]
        exact rejected
      · simpa [issues, NonemptyList.toList, values] using member
  · rintro ⟨issues, rejected, member⟩
    rw [bind_rejected_list rejected] at member
    exact member

private theorem countName_perm {left right : List ToolDescriptor}
    (permutation : left.Perm right) (name : Authorization.ToolName) :
    CountName left name = CountName right name := by
  exact permutation.countP_eq (fun tool => tool.name == name)

private theorem duplicateNames_perm {left right : List ToolDescriptor}
    (permutation : left.Perm right) : duplicateNames left = duplicateNames right := by
  unfold duplicateNames
  apply Compiler.ordered_unique_eq nameKey
  · intro name
    simp only [repeatedNameCandidates, List.mem_filter]
    have countEqual := countName_perm permutation name
    have namesPerm := permutation.map (fun tool => tool.name)
    constructor
    · rintro ⟨member, repeated⟩
      exact ⟨namesPerm.mem_iff.mp member, by simpa [countEqual] using repeated⟩
    · rintro ⟨member, repeated⟩
      exact ⟨namesPerm.mem_iff.mpr member, by simpa [countEqual] using repeated⟩
  · intro a b equal
    cases a
    cases b
    simp_all [nameKey]

private theorem countName_tail_le (head : ToolDescriptor) (tail : List ToolDescriptor)
    (name : Authorization.ToolName) :
    CountName tail name ≤ CountName (head :: tail) name := by
  rw [countName_cons]
  by_cases equal : head.name = name <;> simp [equal] <;> omega

private theorem names_nodup_of_no_duplicates (input : List ToolDescriptor)
    (empty : duplicateNames input = []) : (input.map (·.name)).Nodup := by
  induction input with
  | nil => simp
  | cons head tail ih =>
    rw [List.map_cons, List.nodup_cons]
    constructor
    · intro member
      have positiveTail := (name_mem_map_iff_count_pos tail head.name).mp member
      have repeatedInput : 1 < CountName (head :: tail) head.name := by
        rw [countName_cons]
        simp
        omega
      have repeatedMember := (mem_duplicateNames (head :: tail) head.name).mpr repeatedInput
      simp [empty] at repeatedMember
    · have tailEmpty : duplicateNames tail = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro name member
        have repeatedTail := (mem_duplicateNames tail name).mp member
        have repeatedInput : 1 < CountName (head :: tail) name := by
          have countLe := countName_tail_le head tail name
          omega
        have repeatedMember := (mem_duplicateNames (head :: tail) name).mpr repeatedInput
        simp [empty] at repeatedMember
      exact ih tailEmpty

private theorem countName_le_one_of_names_nodup (input : List ToolDescriptor)
    (name : Authorization.ToolName)
    (nodup : (input.map (·.name)).Nodup) : CountName input name ≤ 1 := by
  induction input with
  | nil => simp [CountName]
  | cons head tail ih =>
    have pair := List.nodup_cons.mp nodup
    by_cases equal : head.name = name
    · subst name
      have noTailMember : head.name ∉ tail.map (·.name) := pair.1
      have noTailCount : CountName tail head.name = 0 := by
        have noPositive : ¬ 0 < CountName tail head.name := fun positive =>
          noTailMember ((name_mem_map_iff_count_pos tail head.name).mpr positive)
        omega
      rw [countName_cons]
      simp [noTailCount]
    · have tailAtMost := ih pair.2
      rw [countName_cons]
      simp [equal]
      exact tailAtMost

private theorem ordered_tool_name_distinct (input : List ToolDescriptor)
    (nodup : (input.map (·.name)).Nodup) :
    input.Pairwise (fun left right => toolKey left ≠ toolKey right) := by
  have namesPairwise : input.Pairwise (fun left right => left.name ≠ right.name) := by
    exact List.pairwise_map.mp (List.nodup_iff_pairwise_ne.mp nodup)
  apply namesPairwise.imp
  intro left right nameDifferent keyEqual
  apply nameDifferent
  have valuesEqual : left.name.value = right.name.value := by
    have singletonEqual : [left.name.value] = [right.name.value] := by
      simpa [toolKey] using keyEqual
    simpa using singletonEqual
  exact congrArg Authorization.ToolName.mk valuesEqual

namespace Proofs

theorem T1_accepted_tools_exact : T1_accepted_tools_exact model := by
  intro input tools accepted
  obtain ⟨empty, sorted⟩ := normalize_accepted_facts accepted
  rw [← sorted]
  constructor
  · exact Compiler.ordered_perm _ _
  · have nodup := names_nodup_of_no_duplicates input empty
    have ordered := Compiler.ordered_strict toolKey input
      (ordered_tool_name_distinct input nodup)
    exact ordered.imp (fun less =>
      (List.cons_lex_cons_iff.mp less).elim id
        (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))

theorem T2_distinct_tools_accepted : T2_distinct_tools_accepted model := by
  intro input distinct
  have noDuplicates : duplicateNames input = [] := by
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro name member
    have repeated := (mem_duplicateNames input name).mp member
    have countAtMost := countName_le_one_of_names_nodup input name distinct
    omega
  refine ⟨Compiler.ordered toolKey input, ?_⟩
  simp [model, normalize, noDuplicates]

theorem T3_duplicate_diagnostics_exact : T3_duplicate_diagnostics_exact model := by
  refine ⟨?_, ?_⟩
  · intro input name
    simpa [model] using duplicate_rejection_exact input name
  · intro input names rejected
    rw [normalize_rejected_list rejected]
    apply List.pairwise_map.mpr
    have ordered := Compiler.ordered_strict nameKey
      (Compiler.unique (repeatedNameCandidates input))
      ((Compiler.unique_nodup _).imp (by
        intro left right different equal
        apply different
        have valuesEqual : left.value = right.value := by
          have singletonEqual : [left.value] = [right.value] := by
            simpa [nameKey] using equal
          simpa using singletonEqual
        cases left
        cases right
        simp_all))
    exact ordered.imp (fun less =>
      (List.cons_lex_cons_iff.mp less).elim id
        (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))

theorem T4_tool_enumeration_invariant : T4_tool_enumeration_invariant model := by
  intro input other permutation
  have duplicatesSame := duplicateNames_perm permutation
  by_cases empty : duplicateNames input = []
  · have otherEmpty : duplicateNames other = [] := by
      rw [← duplicatesSame]
      exact empty
    have namesNodup := names_nodup_of_no_duplicates input empty
    have namesPairwise : input.Pairwise (fun left right => left.name ≠ right.name) := by
      exact List.pairwise_map.mp (List.nodup_iff_pairwise_ne.mp namesNodup)
    have keyInjective := Compiler.key_injective_on (fun tool : ToolDescriptor => tool.name) namesPairwise
    have sortedEqual : Compiler.ordered toolKey input = Compiler.ordered toolKey other := by
      apply Compiler.ordered_eq_of_perm toolKey permutation
      intro left leftMember right rightMember keyEqual
      have rightInInput : right ∈ input := permutation.mem_iff.mpr rightMember
      have nameEqual : left.name = right.name := by
        have valueEqual : left.name.value = right.name.value := by
          have singletonEqual : [left.name.value] = [right.name.value] := by
            simpa [toolKey] using keyEqual
          simpa using singletonEqual
        exact congrArg Authorization.ToolName.mk valueEqual
      exact keyInjective left leftMember right rightInInput nameEqual
    change normalize input = normalize other
    simp [normalize, empty, otherEmpty, sortedEqual]
  · have otherNonempty : duplicateNames other ≠ [] := by
      intro no
      apply empty
      rw [duplicatesSame]
      exact no
    change normalize input = normalize other
    simp [normalize, otherNonempty, duplicatesSame]

theorem T5_accepted_binding_exact : T5_accepted_binding_exact model := by
  intro input accepted
  have noIssues : bindingIssues input = [] := (bind_accepted_iff input).mp accepted
  have noRequired : ∀ issue, ¬ RequiredBindingIssue input issue := by
    intro issue required
    have member := (mem_bindingIssues input issue).mpr required
    rw [noIssues] at member
    simp at member
  refine ⟨?_, ?_, ?_⟩
  · by_cases equal : input.actual.organization = input.expected.organization
    · exact equal
    · exact False.elim (noRequired .organizationMismatch equal)
  · by_cases equal : input.actual.service = input.expected.service
    · exact equal
    · exact False.elim (noRequired .serviceMismatch equal)
  · by_cases equal : input.actual.digest = input.expected.digest
    · exact equal
    · exact False.elim (noRequired .digestMismatch equal)

theorem T6_matching_binding_accepted : T6_matching_binding_accepted model := by
  intro input matchFacts
  apply (bind_accepted_iff input).2
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro issue member
  have required := (mem_bindingIssues input issue).mp member
  rcases matchFacts with ⟨organization, service, digest⟩
  cases issue <;> simp [RequiredBindingIssue, organization, service, digest] at required

theorem T7_binding_diagnostics_exact : T7_binding_diagnostics_exact model := by
  refine ⟨?_, ?_⟩
  · intro input issue
    simpa [model] using binding_rejection_exact input issue
  · intro input issues rejected
    rw [bind_rejected_list rejected]
    apply List.pairwise_map.mpr
    have ordered := Compiler.ordered_strict issueKey
      (Compiler.unique (bindingIssueCandidates input))
      ((Compiler.unique_nodup _).imp (by
        intro left right different equal
        apply different
        exact bindingIssueKey_injective (by
          have singletonEqual : [BindingIssueKey left] = [BindingIssueKey right] := by
            simpa [issueKey] using equal
          simpa using singletonEqual)))
    exact ordered.imp (fun less =>
      (List.cons_lex_cons_iff.mp less).elim id
        (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))

end Proofs
end PluginSdk.Catalog.Tools
