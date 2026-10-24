import PluginSdk.Compiler.Mcp.Portable.Model

namespace PluginSdk.Compiler.Mcp.Portable.Facts

private theorem enumerate_snd {α : Type} (start : Nat) (values : List α) :
    (Generated.enumerateFrom start values).map Prod.snd = values := by
  induction values generalizing start with
  | nil => rfl
  | cons head tail ih => simp [Generated.enumerateFrom, ih]

theorem entries_pairs (input : Input) :
    (entries input).map (fun entry => (entry.name, entry.plan)) = Mcp.canonicalLocals input.locals := by
  simp only [entries, Mcp.indexedLocals, List.map_map]
  change (Generated.enumerateFrom 0 (Mcp.canonicalLocals input.locals)).map Prod.snd = _
  exact enumerate_snd _ _

theorem entries_source (input : Input) (entry : Entry) (member : entry ∈ entries input) :
    (entry.name, entry.plan) ∈ input.locals := by
  have mapped : (entry.name, entry.plan) ∈
      (entries input).map (fun item => (item.name, item.plan)) :=
    List.mem_map.mpr ⟨entry, member, rfl⟩
  rw [entries_pairs] at mapped
  exact (mem_ordered ..).mp mapped

theorem source_entry (input : Input) (name : String) (plan : Process.Plan)
    (member : (name, plan) ∈ input.locals) :
    ∃ entry ∈ entries input, entry.name = name ∧ entry.plan = plan := by
  have mapped : (name, plan) ∈ (entries input).map (fun entry => (entry.name, entry.plan)) := by
    rw [entries_pairs]
    exact (mem_ordered ..).mpr member
  obtain ⟨entry, found, equal⟩ := List.mem_map.mp mapped
  exact ⟨entry, found, Prod.mk.inj equal⟩

theorem entries_names_perm (input : Input) :
    ((entries input).map Entry.name).Perm (input.locals.map Prod.fst) := by
  have mapped := congrArg (List.map Prod.fst) (entries_pairs input)
  simp only [List.map_map, Function.comp_def] at mapped
  rw [mapped]
  exact (ordered_perm (fun server : String × Process.Plan => [server.1]) input.locals).map Prod.fst

theorem entries_ordinals (input : Input) :
    (entries input).Pairwise (fun left right => left.ordinal < right.ordinal) := by
  unfold entries Mcp.indexedLocals
  apply List.pairwise_map.mpr
  simpa using Generated.enumerateFrom_pairwise 0 (Mcp.canonicalLocals input.locals)

theorem local_names_distinct (input : Input) (normalized : Mcp.Normalized input) :
    (input.locals.map Prod.fst).Nodup := (List.nodup_append.mp normalized.1).2.1

private theorem key_before_singleton {left right : String}
    (before : KeyBefore [left] [right]) : Utf8Before left right := by
  cases before with
  | rel value => exact value
  | cons tail => cases tail

theorem entries_names_ordered (input : Input) (normalized : Mcp.Normalized input) :
    (entries input).Pairwise (fun left right => Utf8Before left.name right.name) := by
  have distinct : input.locals.Pairwise (fun left right => [left.1] ≠ [right.1]) :=
    (List.pairwise_map.mp (local_names_distinct input normalized)).imp
      (fun different equal => different (List.singleton_inj.mp equal))
  have sorted := ordered_strict (fun server : String × Process.Plan => [server.1]) input.locals distinct
  have namesSorted : (Mcp.canonicalLocals input.locals).Pairwise
      (fun left right => Utf8Before left.1 right.1) := by
    exact sorted.imp (fun {left right} before => key_before_singleton before)
  rw [← entries_pairs input] at namesSorted
  exact (List.pairwise_map (f := fun entry : Entry => (entry.name, entry.plan))
    (R := fun left right => Utf8Before left.1 right.1)).mp namesSorted

theorem entries_eq (left right : Input) (normalized : Mcp.Normalized left)
    (permutation : left.locals.Perm right.locals) : entries left = entries right := by
  have canonical : Mcp.canonicalLocals left.locals = Mcp.canonicalLocals right.locals := by
    apply ordered_eq_of_perm (fun server : String × Process.Plan => [server.1]) permutation
    intro a aMember b bMember equal
    exact key_injective_on Prod.fst
      (List.pairwise_map.mp (local_names_distinct left normalized)) a aMember b
      (permutation.symm.subset bMember) (List.singleton_inj.mp equal)
  simp only [entries, Mcp.indexedLocals, canonical]

theorem rendered_components (input : Input) (output : Output)
    (accepted : model.render input = .rendered output) :
    requiredIssues input = [] ∧ output = ⟨document input, files input⟩ := by
  change render input = .rendered output at accepted
  cases problems : requiredIssues input with
  | nil =>
    simp [render, problems] at accepted
    exact ⟨rfl, accepted.symm⟩
  | cons head tail => simp [render, problems] at accepted

theorem rejected_issues (input : Input) (issues : NonemptyList Issue)
    (rejected : model.render input = .rejected issues) : issues.toList = requiredIssues input := by
  change render input = .rejected issues at rejected
  cases problems : requiredIssues input with
  | nil => simp [render, problems] at rejected
  | cons head tail =>
    simp [render, problems] at rejected
    subst issues
    rfl

end PluginSdk.Compiler.Mcp.Portable.Facts
