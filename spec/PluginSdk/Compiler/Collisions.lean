import PluginSdk.Compiler.Format

namespace PluginSdk.Compiler

instance (left right key : String) : Decidable (CollisionAt left right key) := by
  unfold CollisionAt
  infer_instance

def collisionKeys (left right : String) : List String :=
  (if asciiFold left = asciiFold right ∨
      (asciiFold right).startsWith (asciiFold left ++ "/") = true then [asciiFold left] else []) ++
  (if (asciiFold left).startsWith (asciiFold right ++ "/") = true then [asciiFold right] else [])

@[simp] theorem mem_collisionKeys (left right key : String) :
    key ∈ collisionKeys left right ↔ CollisionAt left right key := by
  simp only [collisionKeys, CollisionAt, List.mem_append]
  split <;> split <;> simp_all only [List.mem_singleton, List.not_mem_nil,
    and_true, and_false, or_false, false_or, Bool.false_eq_true]

theorem collision_symmetric (left right key : String) :
    CollisionAt left right key ↔ CollisionAt right left key := by
  unfold CollisionAt
  constructor
  · rintro (⟨rfl, equal | descendant⟩ | ⟨rfl, descendant⟩)
    · exact Or.inl ⟨equal, Or.inl equal.symm⟩
    · exact Or.inr ⟨rfl, descendant⟩
    · exact Or.inl ⟨rfl, Or.inr descendant⟩
  · rintro (⟨rfl, equal | descendant⟩ | ⟨rfl, descendant⟩)
    · exact Or.inl ⟨equal, Or.inl equal.symm⟩
    · exact Or.inr ⟨rfl, descendant⟩
    · exact Or.inl ⟨rfl, Or.inr descendant⟩

theorem collision_conflict {left right key : String} (collision : CollisionAt left right key) :
    PathsConflict left right := by
  rcases collision with ⟨rfl, equal | descendant⟩ | ⟨rfl, descendant⟩
  · exact Or.inl equal
  · exact Or.inr (Or.inr descendant)
  · exact Or.inr (Or.inl descendant)

theorem conflict_collision {left right : String} (conflict : PathsConflict left right) :
    ∃ key, CollisionAt left right key := by
  rcases conflict with equal | descendant | descendant
  · exact ⟨asciiFold left, Or.inl ⟨rfl, Or.inl equal⟩⟩
  · exact ⟨asciiFold right, Or.inr ⟨rfl, descendant⟩⟩
  · exact ⟨asciiFold left, Or.inl ⟨rfl, Or.inr descendant⟩⟩

def pathCollisions : List String → List String
  | [] => []
  | path :: rest => rest.flatMap (collisionKeys path) ++ pathCollisions rest

@[simp] theorem mem_pathCollisions (paths : List String) (key : String) :
    key ∈ pathCollisions paths ↔ ∃ left right, [left, right].Sublist paths ∧ CollisionAt left right key := by
  induction paths with
  | nil => simp [pathCollisions]
  | cons path rest ih =>
    simp only [pathCollisions, List.mem_append, List.mem_flatMap, mem_collisionKeys, ih]
    constructor
    · rintro (⟨right, member, collision⟩ | ⟨left, right, sublist, collision⟩)
      · exact ⟨path, right, (List.singleton_sublist.mpr member).cons_cons path, collision⟩
      · exact ⟨left, right, sublist.cons path, collision⟩
    · rintro ⟨left, right, sublist, collision⟩
      cases sublist with
      | cons _ sublist => exact Or.inr ⟨left, right, sublist, collision⟩
      | cons_cons _ sublist => exact Or.inl ⟨right, List.singleton_sublist.mp sublist, collision⟩

theorem no_pathCollisions (paths : List String) :
    pathCollisions paths = [] ↔ paths.Pairwise (fun left right => ¬ PathsConflict left right) := by
  rw [List.eq_nil_iff_forall_not_mem, List.pairwise_iff_forall_sublist]
  constructor
  · intro absent left right sublist conflict
    obtain ⟨key, collision⟩ := conflict_collision conflict
    exact absent key ((mem_pathCollisions ..).mpr ⟨left, right, sublist, collision⟩)
  · intro unique key member
    obtain ⟨left, right, sublist, collision⟩ := (mem_pathCollisions ..).mp member
    exact unique sublist (collision_conflict collision)

theorem pathCollisions_permutation {left right : List String} (permutation : left.Perm right) (key : String) :
    key ∈ pathCollisions left ↔ key ∈ pathCollisions right := by
  have membership (paths : List String) : key ∈ pathCollisions paths ↔
      ¬ paths.Pairwise (fun a b => ¬ CollisionAt a b key) := by
    rw [mem_pathCollisions, List.pairwise_iff_forall_sublist]
    constructor
    · rintro ⟨a, b, sublist, collision⟩ none
      exact none sublist collision
    · intro notPairwise
      apply Classical.byContradiction
      intro none
      apply notPairwise
      intro a b sublist collision
      exact none ⟨a, b, sublist, collision⟩
  rw [membership, membership]
  apply not_congr
  exact permutation.pairwise_iff (fun none collision => none ((collision_symmetric ..).mpr collision))

end PluginSdk.Compiler
