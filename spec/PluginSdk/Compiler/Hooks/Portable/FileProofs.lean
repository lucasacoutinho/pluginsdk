import PluginSdk.Compiler.Hooks.Portable.Facts
import PluginSdk.Compiler.Hooks.Enumeration

namespace PluginSdk.Compiler.Hooks.Portable.Proofs

private theorem paired_length (items : List Hooks.IndexedHook) :
    (items.flatMap processFiles).length = 2 * items.length := by
  induction items with
  | nil => rfl
  | cons entry rest ih =>
    simp only [List.flatMap_cons, List.length_append, processFiles, List.length_cons,
      List.length_nil, ih, Nat.mul_add, Nat.mul_one]
    omega

theorem PH3_files_exact : PH3_files_exact model := by
  intro input output accepted
  obtain ⟨_, rfl⟩ := Facts.rendered_components input output accepted
  refine ⟨rfl, ?_⟩
  by_cases empty : input.hooks = []
  · simp [files, empty]
  · simp only [files, empty, ↓reduceIte, List.length_cons, paired_length, entries,
      Hooks.indexedHooks_length]
    omega

private def entryPaths (entry : Hooks.IndexedHook) : List String :=
  [(dataPath entry.ordinal).value, (shellPath entry.ordinal).value]

private theorem entry_paths_distinct (entry : Hooks.IndexedHook) : (entryPaths entry).Nodup := by
  simp [entryPaths, dataPath_ne_shellPath]

private theorem different_entries_paths (left right : Hooks.IndexedHook)
    (before : left.ordinal < right.ordinal)
    (leftPath : String) (leftMember : leftPath ∈ entryPaths left)
    (rightPath : String) (rightMember : rightPath ∈ entryPaths right) : leftPath ≠ rightPath := by
  simp only [entryPaths, List.mem_cons, List.not_mem_nil, or_false] at leftMember rightMember
  rcases leftMember with rfl | rfl <;> rcases rightMember with rfl | rfl
  · intro equal
    have same := dataPath_value_injective equal
    omega
  · exact dataPath_ne_shellPath _ _
  · exact Ne.symm (dataPath_ne_shellPath _ _)
  · intro equal
    have same := shellPath_value_injective equal
    omega

private theorem paired_paths_distinct (items : List Hooks.IndexedHook)
    (ordinals : items.Pairwise (fun left right => left.ordinal < right.ordinal)) :
    (items.flatMap entryPaths).Nodup := by
  induction items with
  | nil => simp
  | cons entry rest ih =>
    obtain ⟨beforeRest, restOrdered⟩ := List.pairwise_cons.mp ordinals
    rw [List.flatMap_cons]
    apply List.nodup_append.mpr
    refine ⟨entry_paths_distinct entry, ih restOrdered, ?_⟩
    intro left leftMember right rightMember equal
    obtain ⟨other, otherMember, rightWithin⟩ := List.mem_flatMap.mp rightMember
    exact different_entries_paths entry other (beforeRest other otherMember)
      left leftMember right rightWithin equal

private theorem runtime_separate (entry : Hooks.IndexedHook) (path : String)
    (member : path ∈ entryPaths entry) : runtimeFile.value ≠ path := by
  simp only [entryPaths, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl
  · exact Ne.symm (dataPath_ne_runtimeFile _)
  · exact Ne.symm (shellPath_ne_runtimeFile _)

private theorem files_paths_distinct (input : Input) :
    ((files input).map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right) := by
  by_cases empty : input.hooks = []
  · simp [files, empty]
  · have paths : (files input).map (fun file => file.path.value) =
        runtimeFile.value :: (entries input).flatMap entryPaths := by
      simp only [files, ite_eq_right empty, List.map_cons, List.map_flatMap,
        processFiles, Process.Portable.FilePlan.path, List.map_nil]
      rfl
    rw [paths, List.pairwise_cons]
    constructor
    · intro path member
      obtain ⟨entry, _, within⟩ := List.mem_flatMap.mp member
      exact runtime_separate entry path within
    · exact paired_paths_distinct (entries input) (Hooks.indexedHooks_ordinal_pairwise input)

private theorem files_no_dollar (input : Input) (file : FilePlan) (member : file ∈ files input) :
    '$' ∉ file.path.value.toList := by
  by_cases empty : input.hooks = []
  · simp [files, empty] at member
  · simp only [files, empty, ↓reduceIte, List.mem_cons] at member
    rcases member with rfl | generated
    · exact runtimeFile_no_dollar
    · obtain ⟨entry, _, within⟩ := List.mem_flatMap.mp generated
      simp only [processFiles, List.mem_cons, List.not_mem_nil, or_false] at within
      rcases within with rfl | rfl
      · exact dataPath_no_dollar _
      · exact shellPath_no_dollar _

theorem PH4_paths_safe : PH4_paths_safe model := by
  intro input output accepted
  obtain ⟨_, rfl⟩ := Facts.rendered_components input output accepted
  exact ⟨files_paths_distinct input,
    fun file member => ⟨file.path.contained, files_no_dollar input file member⟩⟩

end PluginSdk.Compiler.Hooks.Portable.Proofs
