import PluginSdk.Compiler.Process.Facts

namespace PluginSdk.Compiler.Process

private theorem bindings_unique_by_name
    {bindings : List (EnvironmentName × EnvironmentValue)}
    (namesUnique : (bindings.map Prod.fst).Nodup) :
    ∀ left ∈ bindings, ∀ right ∈ bindings, left.1 = right.1 → left = right := by
  apply Compiler.key_injective_on Prod.fst
  exact (List.pairwise_map (f := Prod.fst)
    (R := fun left right : EnvironmentName => left ≠ right)).mp namesUnique

private theorem lowerBindings_key_injective
    {left right : List (EnvironmentName × EnvironmentValue)}
    (namesUnique : (left.map Prod.fst).Nodup) (permutation : left.Perm right) :
    ∀ a ∈ left.map lowerBinding, ∀ b ∈ right.map lowerBinding,
      environmentKey a = environmentKey b → a = b := by
  intro a aMember b bMember keyEqual
  have valueEqual : a.1.value = b.1.value := by
    have singletonEqual : [a.1.value] = [b.1.value] := by
      simpa [environmentKey] using keyEqual
    exact List.singleton_inj.mp singletonEqual
  have loweredNameEqual : a.1 = b.1 :=
    environmentName_eq_of_value_eq valueEqual
  obtain ⟨originalA, originalAMember, lowerAEqual⟩ := List.mem_map.mp aMember
  obtain ⟨originalB, originalBMember, lowerBEqual⟩ := List.mem_map.mp bMember
  have originalBLeftMember : originalB ∈ left :=
    permutation.mem_iff.mpr originalBMember
  have originalNameEqual : originalA.1 = originalB.1 :=
    (congrArg Prod.fst lowerAEqual).trans
      (loweredNameEqual.trans (congrArg Prod.fst lowerBEqual).symm)
  have sameBinding := bindings_unique_by_name namesUnique originalA
    originalAMember originalB originalBLeftMember originalNameEqual
  have lowerEqual : lowerBinding originalA = lowerBinding originalB :=
    congrArg lowerBinding sameBinding
  rw [lowerAEqual, lowerBEqual] at lowerEqual
  exact lowerEqual

private theorem bindingValue_perm {α : Type}
    {left right : List (EnvironmentName × α)}
    (permutation : left.Perm right)
    (unique : ∀ a ∈ left, ∀ b ∈ right, a.1 = b.1 → a = b)
    (resolve : α → String) (name : EnvironmentName) :
    BindingValue resolve left name = BindingValue resolve right name := by
  let selected : (EnvironmentName × α) → Bool := fun binding => binding.1 == name
  have findEqual : left.find? selected = right.find? selected := by
    cases found : left.find? selected with
    | none =>
      have rightNoMatches : ∀ value ∈ right, ¬ selected value := by
        intro value member
        have leftMember := permutation.mem_iff.mpr member
        exact (List.find?_eq_none.mp found) value leftMember
      have rightNone : right.find? selected = none :=
        List.find?_eq_none.mpr rightNoMatches
      exact rightNone.symm
    | some binding =>
      have member : binding ∈ left := List.mem_of_find?_eq_some found
      have isSelected : selected binding = true :=
        (List.find?_eq_some_iff_append.mp found).1
      have rightMember : binding ∈ right := permutation.mem_iff.mp member
      cases rightFound : right.find? selected with
      | none =>
        have noMatch := (List.find?_eq_none.mp rightFound) binding rightMember
        exact False.elim (noMatch isSelected)
      | some other =>
        have otherMember : other ∈ right := List.mem_of_find?_eq_some rightFound
        have otherIsSelected : selected other = true :=
          (List.find?_eq_some_iff_append.mp rightFound).1
        have bindingKey : binding.1 = name := by
          simpa [selected, beq_iff_eq] using isSelected
        have otherKey : other.1 = name := by
          simpa [selected, beq_iff_eq] using otherIsSelected
        have same := unique binding member other otherMember (bindingKey.trans otherKey.symm)
        subst other
        rfl
  unfold BindingValue
  rw [findEqual]

private theorem find_lowerBinding
    (bindings : List (EnvironmentName × EnvironmentValue)) (name : EnvironmentName) :
    (bindings.map lowerBinding).find? (fun binding => binding.1 == name) =
      (bindings.find? (fun binding => binding.1 == name)).map lowerBinding := by
  induction bindings with
  | nil => rfl
  | cons binding rest ih =>
    by_cases selected : binding.1 == name
    · simp [selected, lowerBinding]
    · simp [selected, lowerBinding, ih]

private theorem bindingValue_lowerEnvironmentMap
    (bindings : List (EnvironmentName × EnvironmentValue)) (name : EnvironmentName)
    (root : String) (ambient : EnvironmentName → String) :
    BindingValue (Word.resolve root ambient) (bindings.map lowerBinding) name =
      BindingValue (EnvironmentValue.resolve ambient) bindings name := by
  unfold BindingValue
  rw [find_lowerBinding]
  cases found : bindings.find? (fun binding => binding.1 == name) with
  | none => rfl
  | some binding =>
    cases value : binding.2 <;>
      simp [lowerBinding, lowerEnvironmentValue, Word.resolve, EnvironmentValue.resolve, value]

private theorem planEnvironment_bindingValue
    (input : Input) (root : String) (ambient : EnvironmentName → String)
    (absent : issues input = []) (name : EnvironmentName) :
    BindingValue (Word.resolve root ambient) (planEnvironment input.definition) name =
      BindingValue (EnvironmentValue.resolve ambient) input.definition.environment name := by
  let bindings := input.definition.environment.map lowerBinding
  have permutation : (Compiler.ordered environmentKey bindings).Perm bindings :=
    Compiler.ordered_perm environmentKey bindings
  have namesUnique := environmentNames_nodup_of_issues_empty absent
  have unique := lowerBindings_key_injective namesUnique (List.Perm.refl _)
  have orderedUnique : ∀ a ∈ Compiler.ordered environmentKey bindings,
      ∀ b ∈ bindings, a.1 = b.1 → a = b := by
    intro a aMember b bMember nameEqual
    have keyEqual : environmentKey a = environmentKey b := by
      simp [environmentKey, nameEqual]
    exact unique a (permutation.mem_iff.mp aMember) b bMember keyEqual
  have reordered := bindingValue_perm permutation orderedUnique
    (Word.resolve root ambient) name
  change BindingValue (Word.resolve root ambient) (Compiler.ordered environmentKey bindings) name = _
  rw [reordered]
  exact bindingValue_lowerEnvironmentMap input.definition.environment name root ambient

private theorem planEnvironment_perm
    {left right : Input}
    (permutation : left.definition.environment.Perm right.definition.environment)
    (namesUnique : (left.definition.environment.map Prod.fst).Nodup) :
    planEnvironment left.definition = planEnvironment right.definition := by
  unfold planEnvironment
  apply Compiler.ordered_eq_of_perm environmentKey (permutation.map lowerBinding)
  exact lowerBindings_key_injective namesUnique permutation

private theorem planOf_perm {left right : Input}
    (commandEqual : left.definition.command = right.definition.command)
    (argsEqual : left.definition.args = right.definition.args)
    (cwdEqual : left.definition.cwd = right.definition.cwd)
    (environmentPermutation : left.definition.environment.Perm right.definition.environment)
    (absent : issues left = []) : planOf left = planOf right := by
  have environmentEqual := planEnvironment_perm environmentPermutation
    (environmentNames_nodup_of_issues_empty absent)
  simp only [planOf, commandEqual, argsEqual, cwdEqual, environmentEqual]

namespace Proofs

theorem M1_accepts_exactly_representable :
    M1_accepts_exactly_representable model := by
  intro input
  exact (planned_iff_issues_empty input).trans (issues_empty_iff_representable input)

theorem M2_preserves_process : M2_preserves_process model := by
  intro input plan planned
  have absent : issues input = [] :=
    (planned_iff_issues_empty input).mp ⟨plan, planned⟩
  have planEqual : plan = planOf input := by
    change lower input = .planned plan at planned
    unfold lower at planned
    rw [absent] at planned
    cases planned
    rfl
  rw [planEqual]
  unfold Preserves
  intro root ambient
  refine ⟨?_, ?_, ?_, ?_⟩
  · cases command : input.definition.command <;>
      simp [planOf, lowerProgram, executableText, Word.resolve, ProgramValue, AtRoot, command]
  · change (input.definition.args.map lowerArgument).map (Word.resolve root ambient) =
      input.definition.args.map (ArgumentValue root)
    rw [List.map_map]
    apply List.map_congr_left
    intro argument _
    cases argument <;> rfl
  · cases cwd : input.definition.cwd <;>
      simp [planOf, Word.resolve, AtRoot, cwd]
  · intro name
    exact planEnvironment_bindingValue input root ambient absent name

theorem M3_diagnostics_sound_complete :
    M3_diagnostics_sound_complete model := by
  refine ⟨?_, ?_⟩
  · intro input issue
    constructor
    · intro required
      exact issues_reject ((mem_issues input issue).mpr required)
    · rintro ⟨output, rejected, member⟩
      rw [rejected_facts rejected] at member
      exact (mem_issues input issue).mp member
  · intro input output rejected
    rw [rejected_facts rejected]
    apply List.pairwise_map.mpr
    apply Compiler.ordered_strict
    exact (Compiler.unique_nodup _).imp
      (fun different equal => different (issueKey_injective equal))

theorem M4_canonical_environment : M4_canonical_environment model := by
  intro input plan planned
  have absent : issues input = [] :=
    (planned_iff_issues_empty input).mp ⟨plan, planned⟩
  have planEqual : plan = planOf input := by
    change lower input = .planned plan at planned
    unfold lower at planned
    rw [absent] at planned
    cases planned
    rfl
  rw [planEqual]
  have namesUnique := environmentNames_nodup_of_issues_empty absent
  have originalKeyDistinct : input.definition.environment.Pairwise
      (fun left right => left.1 ≠ right.1) := by
    apply (List.pairwise_map
      (f := fun binding : EnvironmentName × EnvironmentValue => binding.1)
      (R := fun left right : EnvironmentName => left ≠ right)).mp
    exact namesUnique
  have lowerKeyDistinct :
      (input.definition.environment.map lowerBinding).Pairwise
        (fun left right => environmentKey left ≠ environmentKey right) := by
    apply (List.pairwise_map (f := lowerBinding)
      (R := fun left right : EnvironmentName × Word => environmentKey left ≠ environmentKey right)).mpr
    exact originalKeyDistinct.imp (fun {left right} different equal => different (by
      have valuesEqual : left.1.value = right.1.value := by
        have singletonEqual : [left.1.value] = [right.1.value] := by
          simpa [environmentKey, lowerBinding] using equal
        exact List.singleton_inj.mp singletonEqual
      exact environmentName_eq_of_value_eq valuesEqual))
  have sortedKeys := Compiler.ordered_strict environmentKey
    (input.definition.environment.map lowerBinding) lowerKeyDistinct
  have sortedNames : (planEnvironment input.definition).Pairwise
      (fun left right => Utf8Before left.1.value right.1.value) := by
    unfold planEnvironment
    exact sortedKeys.imp (fun less => by
      unfold environmentKey at less
      exact (List.cons_lex_cons_iff.mp less).elim id
        (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))
  change (planEnvironment input.definition).map (fun binding => binding.1.value) |>.Pairwise Utf8Before
  exact (List.pairwise_map
    (f := fun binding : EnvironmentName × Word => binding.1.value)
    (R := Utf8Before)).mpr sortedNames

theorem M5_enumeration_invariant : M5_enumeration_invariant model := by
  intro left right hostEqual commandEqual argsEqual cwdEqual environmentPermutation filesPermutation
  have issueEqual : issues left = issues right := by
    change Compiler.ordered IssueKey (Compiler.unique (rawIssues left)) =
      Compiler.ordered IssueKey (Compiler.unique (rawIssues right))
    apply Compiler.ordered_unique_eq IssueKey
    · intro issue
      simp only [mem_rawIssues]
      exact requiredIssue_perm hostEqual commandEqual argsEqual cwdEqual
        environmentPermutation filesPermutation issue
    · intro a b equal
      exact issueKey_injective equal
  have planEqual : issues left = [] → planOf left = planOf right := by
    intro absent
    exact planOf_perm commandEqual argsEqual cwdEqual environmentPermutation absent
  change lower left = lower right
  unfold lower
  rw [← issueEqual]
  cases present : issues left with
  | nil => exact congrArg Result.planned (planEqual present)
  | cons head tail => simp

end Proofs
end PluginSdk.Compiler.Process
