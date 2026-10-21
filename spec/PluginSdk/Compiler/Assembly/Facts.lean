import PluginSdk.Compiler.Assembly.Model

namespace PluginSdk.Compiler.Assembly

@[simp] theorem mem_reservedIssuesFor (assets : List Asset) (path : String) :
    .reservedAsset path ∈ reservedIssuesFor assets ↔
      ∃ asset, asset ∈ assets ∧ ReservedPath asset.path.value ∧ asset.path.value = path := by
  simp only [reservedIssuesFor, List.mem_filterMap]
  constructor
  · rintro ⟨asset, member, result⟩
    by_cases check : decide (ReservedPath asset.path.value) = true
    · simp [check] at result
      have pathEqual : asset.path.value = path := by cases result; rfl
      have reservedAsset : ReservedPath asset.path.value := of_decide_eq_true check
      have reservedPath : ReservedPath path := by rw [← pathEqual]; exact reservedAsset
      exact ⟨asset, member, reservedAsset, pathEqual⟩
    · simp [check] at result
  · rintro ⟨asset, member, reserved, pathEqual⟩
    have check : decide (ReservedPath asset.path.value) = true := by
      simpa only [pathEqual] using (decide_eq_true_eq.mpr reserved)
    refine ⟨asset, member, ?_⟩
    rw [ite_eq_left check, pathEqual]

@[simp] theorem mem_reservedIssues (input : Input) (path : String) :
    .reservedAsset path ∈ reservedIssues input ↔
      ∃ asset, asset ∈ input.assets ∧ asset.path.value = path ∧ ReservedPath path := by
  change .reservedAsset path ∈ reservedIssuesFor input.assets ↔ _
  rw [mem_reservedIssuesFor]
  constructor
  · rintro ⟨asset, member, reserved, pathEqual⟩
    refine ⟨asset, member, pathEqual, ?_⟩
    rw [← pathEqual]
    exact reserved
  · rintro ⟨asset, member, pathEqual, reserved⟩
    refine ⟨asset, member, ?_, pathEqual⟩
    rw [pathEqual]
    exact reserved

@[simp] theorem mem_issues (input : Input) (issue : Issue) :
    issue ∈ issues input ↔ RequiredIssue input issue := by
  change issue ∈ ordered IssueKey (unique (rawIssues input)) ↔ _
  simp only [mem_ordered, mem_unique]
  cases issue with
  | pathCollision path =>
    simp [rawIssues, paths, requestedAssets, RequiredIssue, reservedIssues,
      reservedIssuesFor, List.mem_filterMap, mem_pathCollisions]
  | reservedAsset path =>
    simp [rawIssues, paths, RequiredIssue, mem_reservedIssues]

theorem assembled_facts {input : Input} {output : NonemptyList Asset}
    (success : model.assemble input = .assembled output) :
    issues input = [] ∧ output.toList = files input := by
  change assemble input = .assembled output at success
  unfold assemble at success
  split at success
  · rename_i absent
    cases success
    exact ⟨absent, nonempty_toList ..⟩
  · cases success

theorem rejected_facts {input : Input} {output : NonemptyList Issue}
    (failure : model.assemble input = .rejected output) : output.toList = issues input := by
  change assemble input = .rejected output at failure
  unfold assemble at failure
  split at failure
  · cases failure
  · rename_i head tail present
    cases failure
    exact present.symm

theorem issues_reject {input : Input} {issue : Issue} (member : issue ∈ issues input) :
    ∃ output, model.assemble input = .rejected output ∧ issue ∈ output.toList := by
  cases present : issues input with
  | nil => simp [present] at member
  | cons head tail =>
    exact ⟨⟨head, tail⟩, by simp only [model, assemble, present],
      by simpa [present, NonemptyList.toList] using member⟩

theorem issues_empty_paths {input : Input} (absent : issues input = []) :
    (paths input).Pairwise (fun left right => ¬ PathsConflict left right) := by
  apply (no_pathCollisions _).mp
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro key member
  have issue := (mem_issues input (.pathCollision key)).mpr
    ((mem_pathCollisions ..).mp member)
  simp [absent] at issue

theorem issues_empty_reserved {input : Input} (absent : issues input = []) :
    NoReservedAssets input := by
  intro asset member reserved
  have issue := (mem_issues input (.reservedAsset asset.path.value)).mpr
    ⟨asset, member, rfl, reserved⟩
  simp [absent] at issue

theorem issueKey_injective {left right : Issue} (equal : IssueKey left = IssueKey right) :
    left = right := by
  cases left <;> cases right <;> simp_all [IssueKey]

theorem requested_unique {input : Input} (absent : issues input = []) :
    (requestedAssets input).Pairwise (fun left right => ¬ PathsConflict left.path.value right.path.value) := by
  apply (List.pairwise_map (f := fun asset : Asset => asset.path.value)
    (R := fun left right => ¬ PathsConflict left right)).mp
  simpa only [paths] using issues_empty_paths absent

theorem requested_keys_distinct {input : Input} (absent : issues input = []) :
    (requestedAssets input).Pairwise (fun left right => assetKey left ≠ assetKey right) := by
  exact (requested_unique absent).imp (fun noConflict keyEqual =>
    noConflict (Or.inl (congrArg asciiFold (List.singleton_inj.mp keyEqual))))

theorem files_unique {input : Input} (absent : issues input = []) :
    files input |>.Pairwise (fun left right => ¬ PathsConflict left.path.value right.path.value) := by
  have requested := requested_unique absent
  exact requested.perm (ordered_perm assetKey (requestedAssets input)).symm
    (fun noConflict conflict => noConflict (conflict_symmetric conflict))
where
  conflict_symmetric {left right : String} : PathsConflict left right → PathsConflict right left := by
    rintro (equal | descendant | descendant)
    · exact Or.inl equal.symm
    · exact Or.inr (Or.inr descendant)
    · exact Or.inr (Or.inl descendant)

theorem collision_issues_empty {input : Input} (absent : issues input = []) :
    pathCollisions (paths input) = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro key member
  have issue := (mem_issues input (.pathCollision key)).mpr
    ((mem_pathCollisions ..).mp member)
  simp [absent] at issue

theorem reserved_issues_empty {input : Input} (absent : issues input = []) :
    reservedIssues input = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro issue member
  cases issue with
  | pathCollision path =>
    simp [reservedIssues, reservedIssuesFor] at member
  | reservedAsset path =>
    have diagnostic := (mem_issues input (.reservedAsset path)).mpr
      ((mem_reservedIssues input path).mp member)
    simp [absent] at diagnostic

theorem pathCollision_issues_permutation {left right : List String}
    (permutation : left.Perm right) :
    pathCollisions left = [] ↔ pathCollisions right = [] := by
  rw [List.eq_nil_iff_forall_not_mem, List.eq_nil_iff_forall_not_mem]
  constructor
  · intro absent key member
    exact absent key ((pathCollisions_permutation permutation key).mpr member)
  · intro absent key member
    exact absent key ((pathCollisions_permutation permutation key).mp member)

theorem reservedIssues_permutation {left right : List Asset}
    (permutation : left.Perm right) (issue : Issue) :
    issue ∈ reservedIssuesFor left ↔ issue ∈ reservedIssuesFor right := by
  cases issue with
  | pathCollision path => simp [reservedIssuesFor]
  | reservedAsset path =>
    rw [mem_reservedIssuesFor, mem_reservedIssuesFor]
    constructor
    · rintro ⟨asset, member, pathEqual, reserved⟩
      exact ⟨asset, permutation.mem_iff.mp member, pathEqual, reserved⟩
    · rintro ⟨asset, member, pathEqual, reserved⟩
      exact ⟨asset, permutation.mem_iff.mpr member, pathEqual, reserved⟩

theorem request_paths_permutation {left right : Input}
    (basePermutation : left.base.toList.Perm right.base.toList)
    (assetPermutation : left.assets.Perm right.assets) :
    requestedAssets left |>.map (fun asset => asset.path.value) |>.Perm
      (requestedAssets right |>.map (fun asset => asset.path.value)) := by
  unfold requestedAssets
  exact (basePermutation.append assetPermutation).map (fun asset => asset.path.value)

theorem issues_permutation {left right : Input}
    (basePermutation : left.base.toList.Perm right.base.toList)
    (assetPermutation : left.assets.Perm right.assets) : issues left = issues right := by
  unfold issues
  apply ordered_unique_eq IssueKey
  · intro issue
    cases issue with
    | pathCollision path =>
      simpa [rawIssues, paths, reservedIssues, reservedIssuesFor] using
        (pathCollisions_permutation (request_paths_permutation basePermutation assetPermutation) path)
    | reservedAsset path =>
      simpa [rawIssues, paths, reservedIssues, reservedIssuesFor] using
        reservedIssues_permutation assetPermutation (.reservedAsset path)
  · intro a b equal
    exact issueKey_injective equal

end PluginSdk.Compiler.Assembly
