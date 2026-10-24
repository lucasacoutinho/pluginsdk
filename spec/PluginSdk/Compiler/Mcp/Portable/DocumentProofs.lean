import PluginSdk.Compiler.Mcp.Portable.Facts

namespace PluginSdk.Compiler.Mcp.Portable.Proofs

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Mcp

private theorem document_present_iff (input : Input) :
    (document input).isSome = true ↔ input.remote ≠ [] ∨ input.locals ≠ [] := by
  unfold document
  by_cases remoteEmpty : input.remote = [] <;>
    by_cases localEmpty : input.locals = [] <;>
    simp [remoteEmpty, localEmpty]

private theorem server_rows_names_perm (input : Input) :
    (serverRows input).map Prod.fst |>.Perm
      (input.remote.map Prod.fst ++ input.locals.map Prod.fst) := by
  have localNames := Facts.entries_names_perm input
  unfold serverRows
  rw [List.map_append]
  rw [show (Mcp.remoteEntries input).map Prod.fst = input.remote.map Prod.fst by
    simp [Mcp.remoteEntries]]
  rw [show (localRows input).map Prod.fst = (entries input).map Entry.name by
    simp [localRows]]
  simpa using (List.Perm.append (List.Perm.refl (input.remote.map Prod.fst)) localNames)

private theorem server_rows_keys_nodup (input : Input) (normalized : Mcp.Normalized input) :
    (serverRows input).map Prod.fst |>.Nodup :=
  (server_rows_names_perm input).nodup_iff.mpr normalized.1

private theorem document_schema_field (input : Input) :
    SchemaField input.format (object (documentRows input)).value "mcp" := by
  cases formatEq : input.format with
  | agentPluginsV1 =>
    apply object_field
    · simp [documentRows, schemaRows, formatEq]
    · simp [documentRows, schemaRows, formatEq]
  | claudeCodeV1 => trivial
  | codexPluginV1 => trivial

private theorem document_mcp_servers_field (input : Input) :
    Field (object (documentRows input)).value "mcpServers" (object (serverRows input)).value := by
  apply object_field
  · cases formatEq : input.format <;> simp [documentRows, schemaRows, formatEq]
  · simp [documentRows, schemaRows]

private theorem document_object_keys (input : Input) :
    ObjectKeys (object (documentRows input)).value (match input.format with
      | .agentPluginsV1 => ["$schema", "mcpServers"]
      | .claudeCodeV1 => ["mcpServers"]
      | .codexPluginV1 => ["mcpServers"]) := by
  cases formatEq : input.format with
  | agentPluginsV1 =>
    simpa [documentRows, schemaRows, formatEq] using object_keys (documentRows input)
  | claudeCodeV1 =>
    simpa [documentRows, schemaRows, formatEq] using object_keys (documentRows input)
  | codexPluginV1 =>
    simpa [documentRows, schemaRows, formatEq] using object_keys (documentRows input)

theorem PM2_document_exact : PM2_document_exact model := by
  intro input output normalized rendered
  have components := Facts.rendered_components input output rendered
  rw [components.2]
  constructor
  · exact document_present_iff input
  · cases documentEq : document input with
    | none => simp
    | some value =>
      have valueEq : value = object (documentRows input) := by
        unfold document at documentEq
        split at documentEq
        · contradiction
        · injection documentEq with equal
          exact equal.symm
      subst value
      refine ⟨document_object_keys input, document_schema_field input, ?_⟩
      let servers := (object (serverRows input)).value
      have keysNodup : (serverRows input).map Prod.fst |>.Nodup :=
        server_rows_keys_nodup input normalized
      refine ⟨servers, document_mcp_servers_field input, ?_, ?_, ?_⟩
      · refine ⟨(object_keys (serverRows input)).1, ?_⟩
        intro key
        rw [(object_keys (serverRows input)).2 key]
        exact (server_rows_names_perm input).mem_iff
      · intro name source member
        have rowMember :
            (name, (object (Compiler.serverRows input.format source)).value) ∈ serverRows input := by
          unfold serverRows
          apply List.mem_append_left
          unfold Mcp.remoteEntries
          exact List.mem_map.mpr ⟨(name, source), member, rfl⟩
        exact object_field keysNodup rowMember
      · intro entry entryMember
        have rowMember :
            (entry.name, (Mcp.nativeObject input.format
              (Process.Portable.native (launcherInput input entry)
                (Process.Portable.Captures.compile entry.plan))).value) ∈ serverRows input := by
          unfold serverRows
          apply List.mem_append_right
          unfold localRows
          exact List.mem_map.mpr ⟨entry, entryMember, rfl⟩
        exact object_field keysNodup rowMember

private theorem perm_nil_iff {α : Type} {left right : List α}
    (permutation : left.Perm right) : left = [] ↔ right = [] := by
  constructor
  · intro leftEmpty
    cases right with
    | nil => rfl
    | cons head tail =>
      have member : head ∈ left := permutation.symm.subset (by simp)
      simp [leftEmpty] at member
  · intro rightEmpty
    cases left with
    | nil => rfl
    | cons head tail =>
      have member : head ∈ right := permutation.subset (by simp)
      simp [rightEmpty] at member

private theorem inorder_nil_iff {α : Type} {relation : α → α → Prop}
    {left right : List α} (ordered : Mcp.InOrder relation left right) :
    left = [] ↔ right = [] := by
  cases left <;> cases right <;> simp [Mcp.InOrder] at ordered ⊢

private def remoteEntryRow (format : Format) (server : String × RemoteMcp) :
    String × Json :=
  (server.1, (object (Compiler.serverRows format server.2)).value)

private theorem remote_server_object_eq (format : Format) (left right : RemoteMcp)
    (headersNodup : (left.headers.map Prod.fst).Nodup)
    (urlEq : left.url = right.url) (headersPerm : left.headers.Perm right.headers) :
    object (Compiler.serverRows format left) = object (Compiler.serverRows format right) := by
  have headerRowsPerm : (Compiler.headerRows left).Perm (Compiler.headerRows right) := by
    simpa [Compiler.headerRows] using headersPerm.map
      (fun binding => (binding.1, Json.str (Compiler.headerText binding.2)))
  have headerKeysNodup : (Compiler.headerRows left).map Prod.fst |>.Nodup := by
    simpa [Compiler.headerRows, List.map_map, Function.comp_def] using headersNodup
  have headerObjectEq := object_eq_of_perm headerRowsPerm headerKeysNodup
  have headerValueEq : (object (Compiler.headerRows left)).value =
      (object (Compiler.headerRows right)).value := congrArg JsonObject.value headerObjectEq
  have rowsEq : Compiler.serverRows format left = Compiler.serverRows format right := by
    simp [Compiler.serverRows, urlEq, headerValueEq]
  exact congrArg object rowsEq

private theorem remote_entry_row_eq (format : Format) {left right : String × RemoteMcp}
    (headersNodup : (left.2.headers.map Prod.fst).Nodup)
    (equivalent : Mcp.RemoteEquivalent left right) :
    remoteEntryRow format left = remoteEntryRow format right := by
  rcases equivalent with ⟨nameEq, urlEq, headersPerm⟩
  have serverEq := remote_server_object_eq format left.2 right.2 headersNodup urlEq headersPerm
  have valueEq := congrArg JsonObject.value serverEq
  simp [remoteEntryRow, nameEq, valueEq]

private theorem inorder_remote_rows_eq (format : Format)
    (left right : List (String × RemoteMcp))
    (ordered : Mcp.InOrder Mcp.RemoteEquivalent left right)
    (headerKeysNodup : ∀ entry, entry ∈ left → (entry.2.headers.map Prod.fst).Nodup) :
    left.map (remoteEntryRow format) = right.map (remoteEntryRow format) := by
  induction left generalizing right with
  | nil =>
    cases right with
    | nil => rfl
    | cons head tail => cases ordered
  | cons head tail inductionHypothesis =>
    cases right with
    | nil => cases ordered
    | cons rightHead rightTail =>
      rcases ordered with ⟨related, tailOrdered⟩
      have headEq := remote_entry_row_eq format
        (headerKeysNodup head (by simp)) related
      have tailEq := inductionHypothesis rightTail tailOrdered (by
        intro entry member
        exact headerKeysNodup entry (List.mem_cons_of_mem _ member))
      simp [headEq, tailEq]

private theorem remote_entries_perm_of_equivalent (left right : Input)
    (formatEq : left.format = right.format)
    (reordered : List (String × RemoteMcp))
    (permutation : left.remote.Perm reordered)
    (ordered : Mcp.InOrder Mcp.RemoteEquivalent reordered right.remote)
    (headerKeysNodup : ∀ entry, entry ∈ left.remote →
      (entry.2.headers.map Prod.fst).Nodup) :
    (Mcp.remoteEntries left).Perm (Mcp.remoteEntries right) := by
  have reorderedHeaderKeysNodup : ∀ entry, entry ∈ reordered →
      (entry.2.headers.map Prod.fst).Nodup := by
    intro entry member
    exact headerKeysNodup entry (permutation.symm.subset member)
  have rowsEq : reordered.map (remoteEntryRow left.format) =
      right.remote.map (remoteEntryRow right.format) := by
    rw [← formatEq]
    exact inorder_remote_rows_eq left.format reordered right.remote ordered reorderedHeaderKeysNodup
  change (left.remote.map (remoteEntryRow left.format)).Perm
    (right.remote.map (remoteEntryRow right.format))
  rw [← rowsEq]
  exact permutation.map (remoteEntryRow left.format)

theorem PM5_enumeration_invariant : PM5_enumeration_invariant model := by
  intro left right leftNormalized rightNormalized equivalent
  rcases equivalent with ⟨formatEq, ⟨reordered, remotePermutation, remoteOrder⟩, localPermutation⟩
  have entriesEq := Facts.entries_eq left right leftNormalized localPermutation
  have localEmptyIff := perm_nil_iff localPermutation
  have remoteEmptyIff :=
    (perm_nil_iff remotePermutation).trans (inorder_nil_iff remoteOrder)
  have issuesEq : requiredIssues left = requiredIssues right := by
    simp [requiredIssues, launcherInput, entriesEq, formatEq]
  have filesEq : files left = files right := by
    by_cases emptyLeft : left.locals = []
    · have emptyRight := localEmptyIff.mp emptyLeft
      simp [files, emptyLeft, emptyRight]
    · have nonemptyRight : right.locals ≠ [] := fun emptyRight =>
        emptyLeft (localEmptyIff.mpr emptyRight)
      simp [files, emptyLeft, nonemptyRight, entriesEq]
  have serverRowsPerm : (serverRows left).Perm (serverRows right) := by
    have remoteHeadersNodup : ∀ entry, entry ∈ left.remote →
        (entry.2.headers.map Prod.fst).Nodup := by
      intro entry member
      obtain ⟨_, headersNodup⟩ := leftNormalized.2.1 entry.1 entry.2 member
      exact headersNodup
    have remoteRowsPerm := remote_entries_perm_of_equivalent left right formatEq reordered
      remotePermutation remoteOrder remoteHeadersNodup
    have localRowsEq : localRows left = localRows right := by
      simp [localRows, launcherInput, entriesEq, formatEq]
    rw [serverRows, serverRows, localRowsEq]
    exact remoteRowsPerm.append (List.Perm.refl _)
  have serverKeysNodup := server_rows_keys_nodup left leftNormalized
  have serverObjectsEq : object (serverRows left) = object (serverRows right) :=
    object_eq_of_perm serverRowsPerm serverKeysNodup
  have serverValuesEq : (object (serverRows left)).value =
      (object (serverRows right)).value := congrArg JsonObject.value serverObjectsEq
  have documentRowsEq : documentRows left = documentRows right := by
    simp [documentRows, formatEq, serverValuesEq]
  have documentEq : document left = document right := by
    by_cases emptyLeft : left.remote = [] ∧ left.locals = []
    · have emptyRight : right.remote = [] ∧ right.locals = [] :=
        ⟨remoteEmptyIff.mp emptyLeft.1, localEmptyIff.mp emptyLeft.2⟩
      simp [document, emptyLeft, emptyRight]
    · have nonemptyRight : ¬ (right.remote = [] ∧ right.locals = []) := by
        intro emptyRight
        exact emptyLeft ⟨remoteEmptyIff.mpr emptyRight.1, localEmptyIff.mpr emptyRight.2⟩
      simp [document, emptyLeft, nonemptyRight, documentRowsEq]
  change render left = render right
  unfold render
  rw [issuesEq]
  cases issues : requiredIssues right with
  | nil => simp [documentEq, filesEq]
  | cons head tail => simp

end PluginSdk.Compiler.Mcp.Portable.Proofs
