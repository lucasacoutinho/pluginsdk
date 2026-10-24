import PluginSdk.Compiler.Facts

namespace PluginSdk.Compiler

open Lean

theorem manifest_native (input : RenderInput) : NativeManifest input (manifest input) := by
  have keys : ((manifestRows input).map Prod.fst).Nodup := by
    cases format : input.format <;> simp [manifestRows, schemaRows, format]
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩
  · exact manifestFile_value input.format
  · have shape := object_keys (manifestRows input)
    cases format : input.format <;> simpa [manifestRows, schemaRows, format] using shape
  · cases format : input.format
    · apply object_field keys
      simp [manifestRows, schemaRows, format]
    · trivial
    · trivial
  all_goals apply object_field keys; simp [manifestRows]

theorem headerRows_keys (source : RemoteMcp) :
    (headerRows source).map Prod.fst = source.headers.map Prod.fst := by
  simp [headerRows, List.map_map, Function.comp_def]

theorem serverRows_keys (format : Format) (source : RemoteMcp) :
    ((serverRows format source).map Prod.fst).Nodup := by
  cases format <;> simp [serverRows, headerKey]

theorem server_native (format : Format) (source : RemoteMcp) :
    NativeServer format source (object (serverRows format source)).value := by
  refine ⟨?_, ?_, ?_, (object (headerRows source)).value, ?_, ?_⟩
  · have shape := object_keys (serverRows format source)
    cases format <;> simpa [serverRows, serverKeys, headerKey] using shape
  · intro notCodex
    cases format with
    | agentPluginsV1 =>
        apply object_field (serverRows_keys ..)
        simp [serverRows]
    | claudeCodeV1 =>
        apply object_field (serverRows_keys ..)
        simp [serverRows]
    | codexPluginV1 => exact absurd rfl notCodex
  · apply object_field (serverRows_keys ..)
    cases format <;> simp [serverRows, headerKey]
  · apply object_field (serverRows_keys ..)
    cases format <;> simp [serverRows, headerKey]
  · rw [← headerRows_keys]
    exact object_keys _

theorem mcpRows_keys (input : RenderInput) : ((mcpRows input).map Prod.fst).Nodup := by
  cases format : input.format <;> simp [mcpRows, schemaRows, format]

theorem server_object_keys (input : RenderInput) :
    ((input.mcp.map fun (name, source) => (name, (object (serverRows input.format source)).value)).map Prod.fst) =
      input.mcp.map Prod.fst := by simp [List.map_map, Function.comp_def]

theorem mcp_native (input : RenderInput) (normalized : Normalized input) (present : input.mcp ≠ []) :
    NativeMcp input (mcp input) := by
  refine ⟨present, ?_, ?_, ?_, ?_⟩
  · exact mcpFile_value input.format
  · have shape := object_keys (mcpRows input)
    cases format : input.format <;> simpa [mcpRows, schemaRows, format] using shape
  · cases format : input.format
    · apply object_field (mcpRows_keys _)
      simp [mcpRows, schemaRows, format]
    · trivial
    · trivial
  · refine ⟨(object (input.mcp.map fun (name, source) =>
      (name, (object (serverRows input.format source)).value))).value, ?_, ?_, ?_⟩
    · apply object_field (mcpRows_keys _); simp [mcpRows]
    · rw [← server_object_keys]
      exact object_keys _
    · intro name source member
      refine ⟨(object (serverRows input.format source)).value, ?_, server_native ..⟩
      apply object_field (by rw [server_object_keys]; exact normalized.1)
      exact List.mem_map.mpr ⟨(name, source), member, rfl⟩

theorem mcp_header (input : RenderInput) (normalized : Normalized input)
    {server : String} {source : RemoteMcp} (sourceMember : (server, source) ∈ input.mcp)
    {header : String} {value : HeaderValue} (headerMember : (header, value) ∈ source.headers) :
    HeaderAt input.format (mcp input) server header (headerText value) := by
  refine ⟨(object (input.mcp.map fun (name, source) =>
      (name, (object (serverRows input.format source)).value))).value,
    (object (serverRows input.format source)).value, (object (headerRows source)).value, ?_, ?_, ?_, ?_⟩
  · apply object_field (mcpRows_keys _); simp [mcpRows]
  · apply object_field (by rw [server_object_keys]; exact normalized.1)
    exact List.mem_map.mpr ⟨(server, source), sourceMember, rfl⟩
  · apply object_field (serverRows_keys ..); simp [serverRows]
  · apply object_field (by rw [headerRows_keys]; exact (normalized.2 server source sourceMember).2)
    exact List.mem_map.mpr ⟨(header, value), headerMember, rfl⟩

theorem header_meaning {input : RenderInput} (absent : issues input = [])
    {server : String} {source : RemoteMcp} (sourceMember : (server, source) ∈ input.mcp)
    {header : String} {value : HeaderValue} (headerMember : (header, value) ∈ source.headers) :
    HeaderMeaning input.format value (headerText value) := by
  have noProblems : valueProblems input.format header value = [] := by
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro problem member
    apply issues_empty_supported absent server problem
    apply (mem_mcpIssues ..).mp
    apply List.mem_flatMap.mpr
    refine ⟨(server, source), sourceMember, List.mem_map.mpr ⟨problem, ?_, rfl⟩⟩
    apply List.mem_append_left
    exact List.mem_flatMap.mpr ⟨(header, value), headerMember, member⟩
  have meaning := valueProblems_meaning input.format header value noProblems
  cases value <;> exact meaning

theorem mcp_member (input : RenderInput) (present : input.mcp ≠ []) : mcp input ∈ rawFiles input := by
  simp [rawFiles, present]

theorem raw_json_native (input : RenderInput) (normalized : Normalized input)
    {path : PackagePath} {value : JsonObject} (member : .json path value ∈ rawFiles input) :
    NativeManifest input (.json path value) ∨ NativeMcp input (.json path value) := by
  simp only [rawFiles, List.mem_cons, List.mem_append] at member
  rcases member with equal | native | copy
  · rw [equal]
    exact Or.inl (manifest_native _)
  · split at native
    · exact False.elim (List.not_mem_nil native)
    · rename_i present
      rw [List.mem_singleton.mp native]
      exact Or.inr (mcp_native input normalized present)
  · simp [skillCopies] at copy

end PluginSdk.Compiler
