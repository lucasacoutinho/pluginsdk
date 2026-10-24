import PluginSdk.WindowsPath.Proofs

namespace PluginSdk.WindowsPath.Proofs

private theorem minimum_spec (initial : Nat) (values : List Nat) :
    (∀ value, value ∈ initial :: values → values.foldl Nat.min initial ≤ value) ∧
      values.foldl Nat.min initial ∈ initial :: values := by
  induction values generalizing initial with
  | nil => simp
  | cons first rest ih =>
      simp only [List.foldl_cons]
      have next := ih (Nat.min initial first)
      have belowMin := next.1 (Nat.min initial first) (by simp)
      constructor
      · intro value member
        rcases List.mem_cons.mp member with equal | member
        · subst value
          exact Nat.le_trans belowMin (Nat.min_le_left _ _)
        · rcases List.mem_cons.mp member with equal | member
          · subst value
            exact Nat.le_trans belowMin (Nat.min_le_right _ _)
          · exact next.1 value (List.mem_cons_of_mem _ member)
      · rcases List.mem_cons.mp next.2 with equal | member
        · by_cases order : initial ≤ first
          · exact List.mem_cons.mpr (Or.inl (equal.trans (Nat.min_eq_left order)))
          · have order : first ≤ initial := by omega
            exact List.mem_cons.mpr (Or.inr (List.mem_cons.mpr (Or.inl (equal.trans (Nat.min_eq_right order)))))
        · exact List.mem_cons_of_mem _ (List.mem_cons_of_mem _ member)

private theorem remaining_spec (input : RootInput) :
    (∀ view, view ∈ input.views → minimumRemaining input ≤ viewRemaining view) ∧
      ∃ view, view ∈ input.views ∧ minimumRemaining input = viewRemaining view := by
  have minimum := minimum_spec (viewRemaining input.head) (input.tail.map viewRemaining)
  constructor
  · intro view member
    apply minimum.1
    rcases List.mem_cons.mp member with equal | member
    · subst view
      simp
    · exact List.mem_cons_of_mem _ (List.mem_map.mpr ⟨view, member, rfl⟩)
  · rcases List.mem_cons.mp minimum.2 with equal | member
    · exact ⟨input.head, by simp [RootInput.views], equal⟩
    · rcases List.mem_map.mp member with ⟨view, member, equal⟩
      exact ⟨view, List.mem_cons_of_mem _ member, equal.symm⟩

theorem WP10_root_capacity_exact : WP10_root_capacity_exact model := by
  intro input
  change RootCapacityFacts input (deriveRootCapacity input)
  by_cases fits : rootViewsWithin input = true
  · have chosen : deriveRootCapacity input = .available ⟨input.maxComponentUnits, minimumRemaining input⟩ := by
      simp [deriveRootCapacity, fits]
    rw [chosen]
    change input.maxComponentUnits = input.maxComponentUnits ∧
      (∀ view, view ∈ input.views → rootOverhead view.root + minimumRemaining input ≤ view.maxPathBufferUnits) ∧
      ∃ view, view ∈ input.views ∧ rootOverhead view.root + minimumRemaining input = view.maxPathBufferUnits
    have bounds : ∀ view, view ∈ input.views → rootOverhead view.root ≤ view.maxPathBufferUnits := by
      simpa only [rootViewsWithin, List.all_eq_true, decide_eq_true_eq] using fits
    have minimum := remaining_spec input
    refine ⟨rfl, ?_, ?_⟩
    · intro view member
      have rootBound := bounds view member
      have remainingBound := minimum.1 view member
      unfold viewRemaining at remainingBound
      omega
    · rcases minimum.2 with ⟨view, member, equal⟩
      refine ⟨view, member, ?_⟩
      have rootBound := bounds view member
      unfold viewRemaining at equal
      omega
  · have chosen : deriveRootCapacity input = .refused := by simp [deriveRootCapacity, fits]
    rw [chosen]
    change ∃ view, view ∈ input.views ∧ view.maxPathBufferUnits < rootOverhead view.root
    apply Classical.byContradiction
    intro noWitness
    apply fits
    change input.views.all (fun view => decide (rootOverhead view.root ≤ view.maxPathBufferUnits)) = true
    apply List.all_eq_true.mpr
    intro view member
    have inside : rootOverhead view.root ≤ view.maxPathBufferUnits := by
      apply Nat.le_of_not_lt
      intro outside
      exact noWitness ⟨view, member, outside⟩
    simp only [decide_eq_true_eq]
    exact inside

private def charUnits (character : Char) : Nat := if character.toNat ≤ 65535 then 1 else 2
private def listUnits (characters : List Char) : Nat := characters.foldl (fun total character => total + charUnits character) 0

private theorem units_acc (characters : List Char) (initial : Nat) :
    characters.foldl (fun total character => total + charUnits character) initial = initial + listUnits characters := by
  induction characters generalizing initial with
  | nil => simp [listUnits]
  | cons first rest ih =>
      simp only [List.foldl_cons, listUnits, Nat.zero_add]
      rw [ih (initial + charUnits first), ih (charUnits first)]
      omega

private theorem list_units_append (first second : List Char) :
    listUnits (first ++ second) = listUnits first + listUnits second := by
  unfold listUnits
  rw [List.foldl_append, units_acc]
  rfl

private theorem list_units_cons (first : Char) (rest : List Char) :
    listUnits (first :: rest) = charUnits first + listUnits rest := by
  unfold listUnits
  simp only [List.foldl_cons, Nat.zero_add]
  exact units_acc rest (charUnits first)

private theorem separators_preserve_units (characters : List Char) :
    listUnits (characters.map (fun character => if character == '/' then '\\' else character)) = listUnits characters := by
  induction characters with
  | nil => simp [listUnits]
  | cons first rest ih =>
      simp only [List.map_cons, list_units_cons, ih]
      by_cases slash : first = '/'
      · simp [slash, charUnits]
      · simp [slash]

private theorem root_separator_units (root : String) :
    listUnits (rootSeparator root) = (rootSeparator root).length := by
  unfold rootSeparator
  split
  · rfl
  · decide +kernel

private theorem complete_name_units (root : String) (path : PluginSdk.PackagePath) :
    utf16Units (nativeName root path) = rootOverhead root + utf16Units path.value := by
  simp only [nativeName, rootOverhead, utf16Units, String.toList_ofList]
  change listUnits (root.toList ++ rootSeparator root ++
    path.value.toList.map (fun character => if character == '/' then '\\' else character) ++ ['\x00']) =
    listUnits root.toList + (rootSeparator root).length + 1 + listUnits path.value.toList
  simp only [list_units_append, separators_preserve_units, root_separator_units]
  have nul : listUnits ['\x00'] = 1 := by decide
  rw [nul]
  omega

theorem WP11_complete_names_fit : WP11_complete_names_fit model := by
  intro input capacity path available accepted view member
  have facts := WP10_root_capacity_exact input
  rw [available] at facts
  have rootBound := facts.2.1 view member
  have pathBound := (WP8_accepted_limits ⟨path, capacity⟩ accepted).2
  change utf16Units path.value ≤ capacity.remainingPathUnits at pathBound
  rw [complete_name_units]
  omega

theorem WP12_root_budget_greatest : WP12_root_budget_greatest model := by
  intro input capacity candidate available candidateFits
  have facts := WP10_root_capacity_exact input
  rw [available] at facts
  rcases facts.2.2 with ⟨view, member, tight⟩
  have bound := candidateFits view member
  omega

private theorem fit_available (input : RootInput) (candidate : Nat)
    (fits : ∀ view, view ∈ input.views → rootOverhead view.root + candidate ≤ view.maxPathBufferUnits) :
    ∃ capacity, model.rootCapacity input = .available capacity := by
  cases result : model.rootCapacity input with
  | available capacity => exact ⟨capacity, rfl⟩
  | refused =>
      have facts := WP10_root_capacity_exact input
      rw [result] at facts
      rcases facts with ⟨view, member, outside⟩
      have bound := fits view member
      omega

theorem WP13_root_capacity_monotone : WP13_root_capacity_monotone model := by
  intro oldInput newInput oldCapacity componentBound views available
  have oldFacts := WP10_root_capacity_exact oldInput
  rw [available] at oldFacts
  have newFits : ∀ view, view ∈ newInput.views →
      rootOverhead view.root + oldCapacity.remainingPathUnits ≤ view.maxPathBufferUnits := by
    intro view member
    rcases views view member with ⟨oldView, oldMember, sameRoot, limitBound⟩
    have bound := oldFacts.2.1 oldView oldMember
    rw [sameRoot] at bound
    omega
  rcases fit_available newInput oldCapacity.remainingPathUnits newFits with ⟨newCapacity, newAvailable⟩
  have newFacts := WP10_root_capacity_exact newInput
  rw [newAvailable] at newFacts
  refine ⟨newCapacity, newAvailable, ?_, WP12_root_budget_greatest newInput newCapacity _ newAvailable newFits⟩
  have oldComponent := oldFacts.1
  have newComponent := newFacts.1
  omega

theorem WP14_root_view_order_independent : WP14_root_view_order_independent model := by
  intro oldInput newInput sameComponent permutation
  cases oldResult : model.rootCapacity oldInput with
  | refused =>
      cases newResult : model.rootCapacity newInput with
      | refused => rfl
      | available newCapacity =>
          have oldFacts := WP10_root_capacity_exact oldInput
          rw [oldResult] at oldFacts
          rcases oldFacts with ⟨view, member, outside⟩
          have newFacts := WP10_root_capacity_exact newInput
          rw [newResult] at newFacts
          have bound := newFacts.2.1 view (permutation.mem_iff.mp member)
          omega
  | available oldCapacity =>
      have oldFacts := WP10_root_capacity_exact oldInput
      rw [oldResult] at oldFacts
      have newFits : ∀ view, view ∈ newInput.views →
          rootOverhead view.root + oldCapacity.remainingPathUnits ≤ view.maxPathBufferUnits := by
        intro view member
        exact oldFacts.2.1 view (permutation.mem_iff.mpr member)
      rcases fit_available newInput oldCapacity.remainingPathUnits newFits with ⟨newCapacity, newResult⟩
      have newFacts := WP10_root_capacity_exact newInput
      rw [newResult] at newFacts
      have lower := WP12_root_budget_greatest newInput newCapacity _ newResult newFits
      have reverseFits : ∀ view, view ∈ oldInput.views →
          rootOverhead view.root + newCapacity.remainingPathUnits ≤ view.maxPathBufferUnits := by
        intro view member
        exact newFacts.2.1 view (permutation.mem_iff.mp member)
      have upper := WP12_root_budget_greatest oldInput oldCapacity _ oldResult reverseFits
      have sameRemaining : oldCapacity.remainingPathUnits = newCapacity.remainingPathUnits := by omega
      have sameMaximum : oldCapacity.maxComponentUnits = newCapacity.maxComponentUnits := by
        rw [oldFacts.1, newFacts.1, sameComponent]
      have equalCapacity : oldCapacity = newCapacity := by
        cases oldCapacity
        cases newCapacity
        simp_all
      simp [newResult, equalCapacity]

end PluginSdk.WindowsPath.Proofs
