import PluginSdk.Compiler.Native

namespace PluginSdk.Compiler

theorem inorder_length {α : Type} {related : α → α → Prop} {left right : List α}
    (order : InOrder related left right) : left.length = right.length := by
  induction left generalizing right with
  | nil => cases right <;> simp_all [InOrder]
  | cons head tail ih =>
    cases right with
    | nil => cases order
    | cons _ _ => exact congrArg Nat.succ (ih order.2)

theorem inorder_flatMap {α β : Type} {related : α → α → Prop} (f : α → List β)
    {left right : List α} (order : InOrder related left right)
    (each : ∀ a b, related a b → (f a).Perm (f b)) : (left.flatMap f).Perm (right.flatMap f) := by
  induction left generalizing right with
  | nil => cases right <;> simp_all [InOrder]
  | cons head tail ih =>
    cases right with
    | nil => cases order
    | cons other rest => exact (each head other order.1).append (ih order.2)

theorem inorder_map {α β : Type} {related : α → α → Prop} (f g : α → β)
    {left right : List α} (order : InOrder related left right)
    (each : ∀ a ∈ left, ∀ b, related a b → f a = g b) : left.map f = right.map g := by
  induction left generalizing right with
  | nil => cases right <;> simp_all [InOrder]
  | cons head tail ih =>
    cases right with
    | nil => cases order
    | cons other rest =>
      simp only [List.map_cons]
      rw [each head List.mem_cons_self other order.1,
        ih order.2 (fun a member b relation => each a (List.mem_cons_of_mem head member) b relation)]

theorem inorder_exists {α : Type} {related : α → α → Prop} (p q : α → Prop)
    {left right : List α} (order : InOrder related left right)
    (each : ∀ a b, related a b → (p a ↔ q b)) :
    (∃ a ∈ left, p a) ↔ ∃ b ∈ right, q b := by
  induction left generalizing right with
  | nil => cases right <;> simp_all [InOrder]
  | cons head tail ih =>
    cases right with
    | nil => cases order
    | cons other rest =>
      simp only [List.mem_cons, exists_eq_or_imp]
      exact or_congr (each head other order.1) (ih order.2)

theorem skillCopies_equivalent {left right : Skill} (related : SkillEquivalent left right) :
    (skillCopies left).Perm (skillCopies right) := by
  have names : ∀ {a b : SkillName}, a.value = b.value → a = b := by
    intro a b equal
    cases a
    cases b
    cases equal
    rfl
  have nameEqual : left.name = right.name := by
    exact names related.1
  simp only [skillCopies]
  rw [nameEqual, related.2.1]
  exact (related.2.2.map (fun asset => RenderedFile.copy (withinSkill right.name asset.path) asset.file)).cons _

theorem sourceUnsupported_permutation {left right : RemoteMcp} (headers : left.headers.Perm right.headers)
    (format : Format) (reason : McpProblem) : SourceUnsupported format left reason ↔ SourceUnsupported format right reason := by
  cases reason <;> simp only [SourceUnsupported, headers.mem_iff]

theorem unsupported_exists (input : RenderInput) (server : String) (reason : McpProblem) :
    UnsupportedRequest input server reason ↔
      ∃ entry ∈ input.mcp, entry.1 = server ∧ SourceUnsupported input.format entry.2 reason := by
  constructor
  · rintro ⟨source, member, problem⟩
    exact ⟨(server, source), member, rfl, problem⟩
  · rintro ⟨⟨name, source⟩, member, rfl, problem⟩
    exact ⟨source, member, problem⟩

theorem unsupported_equivalent {left right : RenderInput} (equivalent : EnumerationEquivalent left right)
    (server : String) (reason : McpProblem) : UnsupportedRequest left server reason ↔ UnsupportedRequest right server reason := by
  obtain ⟨format, _, _, reordered, permutation, order⟩ := equivalent
  rw [unsupported_exists, unsupported_exists]
  have reorder : (∃ entry ∈ left.mcp, entry.1 = server ∧ SourceUnsupported left.format entry.2 reason) ↔
      ∃ entry ∈ reordered, entry.1 = server ∧ SourceUnsupported left.format entry.2 reason := by
    simp only [permutation.mem_iff]
  apply reorder.trans
  apply inorder_exists _ _ order
  intro a b related
  change (a.1 = server ∧ SourceUnsupported left.format a.2 reason) ↔
    (b.1 = server ∧ SourceUnsupported right.format b.2 reason)
  rw [related.1, format, sourceUnsupported_permutation related.2.2]

theorem serverField_equivalent (format : Format) {left right : String × RemoteMcp}
    (related : ServerEquivalent left right) (keys : (left.2.headers.map Prod.fst).Nodup) :
    (left.1, (object (serverRows format left.2)).value) =
      (right.1, (object (serverRows format right.2)).value) := by
  have headersPerm : (headerRows left.2).Perm (headerRows right.2) := by
    simpa only [headerRows] using related.2.2.map
      (fun pair : String × HeaderValue => (pair.1, Lean.Json.str (headerText pair.2)))
  have headersEqual := object_eq_of_perm headersPerm (by rw [headerRows_keys]; exact keys)
  have rowsEqual : serverRows format left.2 = serverRows format right.2 := by
    unfold serverRows
    rw [related.2.1, headersEqual]
  rw [related.1, rowsEqual]

theorem mcp_equivalent {left right : RenderInput} (normalized : Normalized left)
    (equivalent : EnumerationEquivalent left right) : mcp left = mcp right := by
  obtain ⟨format, _, _, reordered, permutation, order⟩ := equivalent
  have mapped := inorder_map
    (fun (name, source) => (name, (object (serverRows left.format source)).value))
    (fun (name, source) => (name, (object (serverRows right.format source)).value)) order (by
      intro a member b related
      rw [← format]
      exact serverField_equivalent left.format related
        ((normalized.2 a.1 a.2 (permutation.symm.subset member)).2))
  have rowsPerm : (left.mcp.map fun (name, source) => (name, (object (serverRows left.format source)).value)).Perm
      (right.mcp.map fun (name, source) => (name, (object (serverRows right.format source)).value)) := by
    rw [← mapped]
    exact permutation.map _
  have serversEqual := object_eq_of_perm rowsPerm (by rw [server_object_keys]; exact normalized.1)
  have rowsEqual : mcpRows left = mcpRows right := by
    unfold mcpRows
    rw [serversEqual]
  simp only [mcp]
  rw [format, rowsEqual]

theorem mcp_empty_equivalent {left right : RenderInput} (equivalent : EnumerationEquivalent left right) :
    left.mcp = [] ↔ right.mcp = [] := by
  obtain ⟨reordered, permutation, order⟩ := equivalent.2.2.2
  have lengths := permutation.length_eq.trans (inorder_length order)
  constructor
  · intro empty
    apply List.eq_nil_of_length_eq_zero
    rw [← lengths, empty]
    rfl
  · intro empty
    apply List.eq_nil_of_length_eq_zero
    rw [lengths, empty]
    rfl

theorem rawFiles_equivalent {left right : RenderInput} (normalized : Normalized left)
    (equivalent : EnumerationEquivalent left right) : (rawFiles left).Perm (rawFiles right) := by
  have manifestEqual : manifest left = manifest right := by
    simp only [manifest, manifestRows]
    rw [equivalent.1, equivalent.2.1]
  obtain ⟨reordered, permutation, order⟩ := equivalent.2.2.1
  have copies := (permutation.flatMap_right skillCopies).trans
    (inorder_flatMap skillCopies order (fun _ _ => skillCopies_equivalent))
  simp only [rawFiles]
  rw [manifestEqual]
  apply List.Perm.cons
  apply List.Perm.append _ copies
  by_cases empty : left.mcp = []
  · simp [empty, (mcp_empty_equivalent equivalent).mp empty]
  · have rightPresent : right.mcp ≠ [] := fun absent => empty ((mcp_empty_equivalent equivalent).mpr absent)
    simp [empty, rightPresent, mcp_equivalent normalized equivalent]

theorem issues_equivalent {left right : RenderInput} (normalized : Normalized left)
    (equivalent : EnumerationEquivalent left right) : issues left = issues right := by
  have pathPermutation : (requestedPaths left).Perm (requestedPaths right) := by
    rw [← rawFiles_paths, ← rawFiles_paths]
    exact (rawFiles_equivalent normalized equivalent).map _
  have members : ∀ issue, issue ∈ issues left ↔ issue ∈ issues right := by
    intro issue
    cases issue with
    | pathCollision key =>
      rw [issues_path, issues_path]
      simpa only [mem_pathCollisions, RequestedCollision] using pathCollisions_permutation pathPermutation key
    | unsupportedMcp server reason =>
      rw [issues_mcp, issues_mcp]
      exact unsupported_equivalent equivalent server reason
  apply ordered_unique_eq
  · intro issue
    simpa only [issues, mem_ordered, mem_unique] using members issue
  · intro _ _ equal
    exact issueKey_injective equal

theorem files_equivalent {left right : RenderInput} (normalized : Normalized left)
    (equivalent : EnumerationEquivalent left right) (absent : issues left = []) : files left = files right := by
  have permutation := rawFiles_equivalent normalized equivalent
  have distinct : (rawFiles left).Pairwise (fun a b => fileKey a ≠ fileKey b) :=
    (rawFiles_unique absent).imp (fun noConflict sameKey => noConflict
      (Or.inl (congrArg asciiFold (List.singleton_inj.mp sameKey))))
  apply ordered_eq_of_perm _ permutation
  intro a aMember b bMember equal
  exact key_injective_on fileKey distinct a aMember b (permutation.symm.subset bMember) equal

end PluginSdk.Compiler
