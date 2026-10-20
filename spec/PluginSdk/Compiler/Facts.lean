import PluginSdk.Compiler.Model
import PluginSdk.Compiler.Properties

namespace PluginSdk.Compiler

theorem entry_destination (name : SkillName) :
    (withinSkill name skillEntry).value = "skills/" ++ name.value ++ "/SKILL.md" := by
  change "skills/" ++ name.value ++ "/" ++ "SKILL.md" = _
  rw [show "/SKILL.md" = "/" ++ "SKILL.md" from by decide]
  simp only [String.append_assoc]

theorem skillCopies_paths (skill : Skill) :
    (skillCopies skill).map (fun file => file.path.value) =
      ("skills/" ++ skill.name.value ++ "/SKILL.md") ::
        skill.assets.map (fun asset => "skills/" ++ skill.name.value ++ "/" ++ asset.path.value) := by
  simp only [skillCopies, List.map_cons, List.map_map, RenderedFile.path, entry_destination]
  rfl

theorem rawFiles_paths (input : RenderInput) :
    (rawFiles input).map (fun file => file.path.value) = requestedPaths input := by
  simp only [rawFiles, requestedPaths, List.map_cons, List.map_append, List.map_flatMap, skillCopies_paths]
  by_cases empty : input.mcp = [] <;> cases format : input.format <;>
    simp [empty, format, manifest, manifestFile, manifestPath, mcp, mcpFile, mcpPath, packageFile, RenderedFile.path]

theorem source_copy_member (input : RenderInput) (path : String) (captured : CapturedFile) :
    SourceCopy input path captured ↔
      ∃ destination, .copy destination captured ∈ rawFiles input ∧ destination.value = path := by
  constructor
  · rintro ⟨skill, skillMember, ⟨rfl, rfl⟩ | ⟨asset, assetMember, rfl, rfl⟩⟩
    · refine ⟨withinSkill skill.name skillEntry, ?_, entry_destination _⟩
      simp only [rawFiles, List.mem_cons, List.mem_append]
      exact Or.inr (Or.inr (List.mem_flatMap.mpr ⟨skill, skillMember, List.mem_cons_self⟩))
    · refine ⟨withinSkill skill.name asset.path, ?_, rfl⟩
      simp only [rawFiles, List.mem_cons, List.mem_append]
      exact Or.inr (Or.inr (List.mem_flatMap.mpr ⟨skill, skillMember,
        List.mem_cons.mpr (Or.inr (List.mem_map.mpr ⟨asset, assetMember, rfl⟩))⟩))
  · rintro ⟨destination, member, rfl⟩
    simp only [rawFiles, List.mem_cons, List.mem_append] at member
    rcases member with impossible | native | copies
    · cases impossible
    · split at native <;> simp_all [mcp]
    · obtain ⟨skill, skillMember, member⟩ := List.mem_flatMap.mp copies
      simp only [skillCopies, List.mem_cons, List.mem_map, RenderedFile.copy.injEq] at member
      rcases member with ⟨rfl, rfl⟩ | ⟨asset, assetMember, rfl, rfl⟩
      · exact ⟨skill, skillMember, Or.inl ⟨entry_destination _, rfl⟩⟩
      · exact ⟨skill, skillMember, Or.inr ⟨asset, assetMember, rfl, rfl⟩⟩

@[simp] theorem issues_path (input : RenderInput) (path : String) :
    .pathCollision path ∈ issues input ↔ RequestedCollision input path := by
  simp [issues, RequestedCollision, mcpIssues]

@[simp] theorem issues_mcp (input : RenderInput) (server : String) (reason : McpProblem) :
    .unsupportedMcp server reason ∈ issues input ↔ UnsupportedRequest input server reason := by
  simp [issues, mem_mcpIssues]

theorem rendered_facts {input : RenderInput} {output : NonemptyList RenderedFile}
    (success : model.render input = .rendered output) :
    issues input = [] ∧ output.toList = files input := by
  change render input = .rendered output at success
  unfold render at success
  split at success
  · rename_i absent
    cases success
    exact ⟨absent, nonempty_toList ..⟩
  · cases success

theorem rejected_facts {input : RenderInput} {output : NonemptyList RenderIssue}
    (failure : model.render input = .rejected output) : output.toList = issues input := by
  change render input = .rejected output at failure
  unfold render at failure
  split at failure
  · cases failure
  · rename_i head tail present
    cases failure
    exact present.symm

theorem issues_reject {input : RenderInput} {issue : RenderIssue} (member : issue ∈ issues input) :
    ∃ output, model.render input = .rejected output ∧ issue ∈ output.toList := by
  cases present : issues input with
  | nil => simp [present] at member
  | cons head tail =>
    exact ⟨⟨head, tail⟩, by simp only [model, render, present], by simpa [present, NonemptyList.toList] using member⟩

theorem issues_empty_paths {input : RenderInput} (absent : issues input = []) :
    (requestedPaths input).Pairwise (fun left right => ¬ PathsConflict left right) := by
  apply (no_pathCollisions _).mp
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro key member
  have issue := (issues_path input key).mpr ((mem_pathCollisions ..).mp member)
  simp [absent] at issue

theorem issues_empty_supported {input : RenderInput} (absent : issues input = []) :
    ∀ server reason, ¬ UnsupportedRequest input server reason := by
  intro server reason unsupported
  have member := (issues_mcp input server reason).mpr unsupported
  simp [absent] at member

theorem conflict_symmetric {left right : String} : PathsConflict left right → PathsConflict right left := by
  rintro (equal | descendant | descendant)
  · exact Or.inl equal.symm
  · exact Or.inr (Or.inr descendant)
  · exact Or.inr (Or.inl descendant)

theorem rawFiles_unique {input : RenderInput} (absent : issues input = []) :
    (rawFiles input).Pairwise (fun left right => ¬ PathsConflict left.path.value right.path.value) := by
  apply (List.pairwise_map (f := fun file : RenderedFile => file.path.value)
    (R := fun left right => ¬ PathsConflict left right)).mp
  rw [rawFiles_paths]
  exact issues_empty_paths absent

theorem files_unique {input : RenderInput} (absent : issues input = []) :
    (files input).Pairwise (fun left right => ¬ PathsConflict left.path.value right.path.value) :=
  (rawFiles_unique absent).perm (ordered_perm fileKey _).symm
    (fun noConflict conflict => noConflict (conflict_symmetric conflict))

theorem issueKey_injective {left right : RenderIssue} (equal : IssueKey left = IssueKey right) : left = right := by
  cases left with
  | pathCollision path => cases right <;> simp_all [IssueKey]
  | unsupportedMcp server reason =>
    cases right with
    | pathCollision path => simp [IssueKey] at equal
    | unsupportedMcp other problem => cases reason <;> cases problem <;> simp_all [IssueKey]

theorem countP_one {α : Type} (predicate : α → Bool) (values : List α)
    (distinct : values.Pairwise (fun a b => ¬ (predicate a = true ∧ predicate b = true)))
    (present : ∃ value ∈ values, predicate value = true) : values.countP predicate = 1 := by
  induction values with
  | nil => simp at present
  | cons head tail ih =>
    obtain ⟨headDistinct, tailDistinct⟩ := List.pairwise_cons.mp distinct
    by_cases headSelected : predicate head = true
    · have tailEmpty : tail.countP predicate = 0 := List.countP_eq_zero.mpr (fun value member hit =>
        headDistinct value member ⟨headSelected, hit⟩)
      simp [headSelected, tailEmpty]
    · have inTail : ∃ value ∈ tail, predicate value = true := by
        obtain ⟨value, member, hit⟩ := present
        rcases List.mem_cons.mp member with rfl | member
        · exact False.elim (headSelected hit)
        · exact ⟨value, member, hit⟩
      simpa [List.countP_cons, headSelected] using ih tailDistinct inTail

end PluginSdk.Compiler
