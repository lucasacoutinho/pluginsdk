import PluginSdk.Compiler.Portable.Facts
import PluginSdk.Compiler.Mcp.Portable.Proofs
import PluginSdk.Compiler.Hooks.Portable.Proofs
import PluginSdk.Compiler.Hooks.Enumeration

namespace PluginSdk.Compiler.Portable.Proofs

private theorem mcp_flat_payload (entries : List Mcp.Portable.Entry) :
    (entries.flatMap Mcp.Portable.processFiles).filter payload =
      entries.flatMap Mcp.Portable.processFiles := by
  rw [List.filter_flatMap]
  apply congrArg (fun f => entries.flatMap f)
  funext entry
  simp [Mcp.Portable.processFiles, payload]

private theorem hooks_flat_payload (entries : List Hooks.IndexedHook) :
    (entries.flatMap Hooks.Portable.processFiles).filter payload =
      entries.flatMap Hooks.Portable.processFiles := by
  rw [List.filter_flatMap]
  apply congrArg (fun f => entries.flatMap f)
  funext entry
  simp [Hooks.Portable.processFiles, payload]

private theorem mcp_payload_files (input : Mcp.Input) :
    (Mcp.Portable.files input).filter payload =
      if input.locals = [] then [] else
        (Mcp.Portable.entries input).flatMap Mcp.Portable.processFiles := by
  by_cases empty : input.locals = []
  · simp [Mcp.Portable.files, empty]
  · simp [Mcp.Portable.files, empty, payload, mcp_flat_payload]

private theorem hooks_payload_files (input : Hooks.Input) :
    (Hooks.Portable.files input).filter payload =
      if input.hooks = [] then [] else
        (Hooks.Portable.entries input).flatMap Hooks.Portable.processFiles := by
  by_cases empty : input.hooks = []
  · simp [Hooks.Portable.files, empty]
  · simp [Hooks.Portable.files, empty, payload, hooks_flat_payload]

private theorem mcp_process_files_length (entries : List Mcp.Portable.Entry) :
    (entries.flatMap Mcp.Portable.processFiles).length = 2 * entries.length := by
  induction entries with
  | nil => rfl
  | cons entry rest ih =>
    simp only [List.flatMap_cons, List.length_append, Mcp.Portable.processFiles,
      List.length_cons, List.length_nil, ih, Nat.mul_add, Nat.mul_one]
    omega

private theorem hooks_process_files_length (entries : List Hooks.IndexedHook) :
    (entries.flatMap Hooks.Portable.processFiles).length = 2 * entries.length := by
  induction entries with
  | nil => rfl
  | cons entry rest ih =>
    simp only [List.flatMap_cons, List.length_append, Hooks.Portable.processFiles,
      List.length_cons, List.length_nil, ih, Nat.mul_add, Nat.mul_one]
    omega

private theorem mcp_entries_length (input : Mcp.Input) :
    (Mcp.Portable.entries input).length = input.locals.length := by
  have pairsLength := congrArg List.length (Mcp.Portable.Facts.entries_pairs input)
  simp only [List.length_map] at pairsLength
  exact pairsLength.trans (ordered_perm (fun server : String × Process.Plan => [server.1]) input.locals).length_eq

private theorem hooks_entries_length (input : Hooks.Input) :
    (Hooks.Portable.entries input).length = input.hooks.length := by
  change (Hooks.indexedHooks input).length = input.hooks.length
  exact Hooks.indexedHooks_length input

private theorem mcp_payload_length (input : Mcp.Input) :
    ((Mcp.Portable.files input).filter payload).length = 2 * input.locals.length := by
  rw [mcp_payload_files]
  by_cases empty : input.locals = []
  · simp [empty]
  · simp only [ite_eq_right empty]
    rw [mcp_process_files_length, mcp_entries_length]

private theorem hooks_payload_length (input : Hooks.Input) :
    ((Hooks.Portable.files input).filter payload).length = 2 * input.hooks.length := by
  rw [hooks_payload_files]
  by_cases empty : input.hooks = []
  · simp [empty]
  · simp only [ite_eq_right empty]
    rw [hooks_process_files_length, hooks_entries_length]

private theorem mcp_files_empty (input : Mcp.Input) :
    Mcp.Portable.files input = [] ↔ input.locals = [] := by
  by_cases empty : input.locals = [] <;> simp [Mcp.Portable.files, empty]

private theorem hooks_files_empty (input : Hooks.Input) :
    Hooks.Portable.files input = [] ↔ input.hooks = [] := by
  by_cases empty : input.hooks = [] <;> simp [Hooks.Portable.files, empty]

private theorem component_files_empty_iff (input : Input) :
    (Mcp.Portable.files input.mcp = [] ∧ Hooks.Portable.files (hookInput input) = []) ↔
      (input.mcp.locals = [] ∧ input.hooks = []) := by
  simp [mcp_files_empty, hooks_files_empty, hookInput]

theorem mcp_only_files (input : Input) :
    sharedFiles (Mcp.Portable.files input.mcp) [] = Mcp.Portable.files input.mcp := by
  by_cases empty : input.mcp.locals = []
  · simp [sharedFiles, Mcp.Portable.files, empty]
  · simp [sharedFiles, Mcp.Portable.files, empty, payload, mcp_flat_payload]

theorem PC3_files_exact : PC3_files_exact model := by
  intro input output accepted
  have filesExact := Facts.rendered_files input output accepted
  refine ⟨filesExact, ?_⟩
  rw [filesExact]
  unfold expectedFiles sharedFiles
  by_cases noFiles : Mcp.Portable.files input.mcp = [] ∧
      Hooks.Portable.files (hookInput input) = []
  · have inputEmpty := component_files_empty_iff input |>.mp noFiles
    simp [noFiles, inputEmpty]
  · have inputNonempty : ¬ (input.mcp.locals = [] ∧ input.hooks = []) := by
      intro empty
      exact noFiles ((component_files_empty_iff input).mpr empty)
    simp only [ite_eq_right noFiles, List.length_cons]
    rw [List.filter_append, List.length_append, mcp_payload_length, hooks_payload_length]
    simp [hookInput, inputNonempty]
    omega

theorem PC4_runtime_exact : PC4_runtime_exact model := by
  intro input output accepted
  have filesExact := Facts.rendered_files input output accepted
  rw [filesExact]
  unfold expectedFiles sharedFiles
  by_cases noFiles : Mcp.Portable.files input.mcp = [] ∧
      Hooks.Portable.files (hookInput input) = []
  · have inputEmpty := component_files_empty_iff input |>.mp noFiles
    simp [noFiles, inputEmpty, payload]
  · have inputNonempty : ¬ (input.mcp.locals = [] ∧ input.hooks = []) := by
      intro empty
      exact noFiles ((component_files_empty_iff input).mpr empty)
    simp [noFiles, inputNonempty, payload]

private theorem payload_paths_pairwise (files : List FilePlan)
    (safe : (files.map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right)) :
    ((files.filter payload).map (fun file => file.path.value)).Pairwise
      (fun left right => left ≠ right) := by
  exact List.pairwise_map.mpr ((List.pairwise_map.mp safe).filter payload)

private theorem mcp_payload_path (input : Mcp.Input) (file : FilePlan)
    (member : file ∈ Mcp.Portable.files input) (kept : payload file = true) :
    ∃ ordinal, file.path.value = (Mcp.Portable.dataPath ordinal).value ∨
      file.path.value = (Mcp.Portable.shellPath ordinal).value := by
  by_cases empty : input.locals = []
  · simp [Mcp.Portable.files, empty] at member
  · simp only [Mcp.Portable.files, empty, ↓reduceIte, List.mem_cons] at member
    rcases member with runtime | generated
    · subst file
      simp [payload] at kept
    · obtain ⟨entry, _, within⟩ := List.mem_flatMap.mp generated
      simp only [Mcp.Portable.processFiles, List.mem_cons, List.not_mem_nil, or_false] at within
      rcases within with data | shell
      · subst file
        exact ⟨entry.ordinal, Or.inl rfl⟩
      · subst file
        exact ⟨entry.ordinal, Or.inr rfl⟩

private theorem hooks_payload_path (input : Hooks.Input) (file : FilePlan)
    (member : file ∈ Hooks.Portable.files input) (kept : payload file = true) :
    ∃ ordinal, file.path.value = (Hooks.Portable.dataPath ordinal).value ∨
      file.path.value = (Hooks.Portable.shellPath ordinal).value := by
  by_cases empty : input.hooks = []
  · simp [Hooks.Portable.files, empty] at member
  · simp only [Hooks.Portable.files, empty, ↓reduceIte, List.mem_cons] at member
    rcases member with runtime | generated
    · subst file
      simp [payload] at kept
    · obtain ⟨entry, _, within⟩ := List.mem_flatMap.mp generated
      simp only [Hooks.Portable.processFiles, List.mem_cons, List.not_mem_nil, or_false] at within
      rcases within with data | shell
      · subst file
        exact ⟨entry.ordinal, Or.inl rfl⟩
      · subst file
        exact ⟨entry.ordinal, Or.inr rfl⟩

private theorem mcp_path_ne_runtime (path : String)
    (kind : ∃ ordinal, path = (Mcp.Portable.dataPath ordinal).value ∨
      path = (Mcp.Portable.shellPath ordinal).value) :
    Process.Portable.runtimeFile.value ≠ path := by
  obtain ⟨ordinal, data | shell⟩ := kind
  · rw [data]
    exact (Mcp.Portable.dataPath_ne_runtimeFile ordinal).symm
  · rw [shell]
    exact (Mcp.Portable.shellPath_ne_runtimeFile ordinal).symm

private theorem hooks_path_ne_runtime (path : String)
    (kind : ∃ ordinal, path = (Hooks.Portable.dataPath ordinal).value ∨
      path = (Hooks.Portable.shellPath ordinal).value) :
    Process.Portable.runtimeFile.value ≠ path := by
  obtain ⟨ordinal, data | shell⟩ := kind
  · rw [data]
    exact (Hooks.Portable.dataPath_ne_runtimeFile ordinal).symm
  · rw [shell]
    exact (Hooks.Portable.shellPath_ne_runtimeFile ordinal).symm

private theorem cross_role_paths_ne (mcpPath hooksPath : String)
    (mcpKind : ∃ ordinal, mcpPath = (Mcp.Portable.dataPath ordinal).value ∨
      mcpPath = (Mcp.Portable.shellPath ordinal).value)
    (hooksKind : ∃ ordinal, hooksPath = (Hooks.Portable.dataPath ordinal).value ∨
      hooksPath = (Hooks.Portable.shellPath ordinal).value) :
    mcpPath ≠ hooksPath := by
  intro equal
  obtain ⟨mcpOrdinal, mcpData | mcpShell⟩ := mcpKind
  · rw [mcpData] at equal
    obtain ⟨hookOrdinal, hookData | hookShell⟩ := hooksKind
    · rw [hookData] at equal
      have chars := congrArg String.toList equal
      have directory := congrArg (fun value : List Char => value[6]!) chars
      simp [Mcp.Portable.dataPath_value, Hooks.Portable.dataPath_value] at directory
    · rw [hookShell] at equal
      have chars := congrArg String.toList equal
      have directory := congrArg (fun value : List Char => value[6]!) chars
      simp [Mcp.Portable.dataPath_value, Hooks.Portable.shellPath_value] at directory
  · rw [mcpShell] at equal
    obtain ⟨hookOrdinal, hookData | hookShell⟩ := hooksKind
    · rw [hookData] at equal
      have chars := congrArg String.toList equal
      have directory := congrArg (fun value : List Char => value[6]!) chars
      simp [Mcp.Portable.shellPath_value, Hooks.Portable.dataPath_value] at directory
    · rw [hookShell] at equal
      have chars := congrArg String.toList equal
      have directory := congrArg (fun value : List Char => value[6]!) chars
      simp [Mcp.Portable.shellPath_value, Hooks.Portable.shellPath_value] at directory

private theorem component_payload_cross_role (input : Input) (mcpFiles hooksFiles : List FilePlan)
    (mcpFilesEq : mcpFiles = Mcp.Portable.files input.mcp)
    (hooksFilesEq : hooksFiles = Hooks.Portable.files (hookInput input))
    (left : String) (leftMember : left ∈ (mcpFiles.filter payload).map (fun file => file.path.value))
    (right : String) (rightMember : right ∈ (hooksFiles.filter payload).map (fun file => file.path.value)) :
    left ≠ right := by
  obtain ⟨mcpFile, mcpMember, rfl⟩ := List.mem_map.mp leftMember
  obtain ⟨hooksFile, hooksMember, rfl⟩ := List.mem_map.mp rightMember
  have mcpOriginal : mcpFile ∈ Mcp.Portable.files input.mcp := by
    rw [← mcpFilesEq]
    exact (List.mem_filter.mp mcpMember).1
  have hooksOriginal : hooksFile ∈ Hooks.Portable.files (hookInput input) := by
    rw [← hooksFilesEq]
    exact (List.mem_filter.mp hooksMember).1
  have mcpKind := mcp_payload_path input.mcp mcpFile mcpOriginal
    (List.mem_filter.mp mcpMember).2
  have hooksKind := hooks_payload_path (hookInput input) hooksFile
    hooksOriginal (List.mem_filter.mp hooksMember).2
  exact cross_role_paths_ne _ _ mcpKind hooksKind

theorem PC5_paths_safe : PC5_paths_safe model := by
  intro input output accepted
  obtain ⟨mcp, hooks, mcpAccepted, hooksAccepted, rfl⟩ :=
    (Facts.rendered_iff input output).mp accepted
  have mcpSafe := Mcp.Portable.Proofs.PM4_paths_safe input.mcp mcp mcpAccepted
  have hooksSafe := Hooks.Portable.Proofs.PH4_paths_safe (hookInput input) hooks hooksAccepted
  obtain ⟨_, rfl⟩ := Mcp.Portable.Facts.rendered_components input.mcp mcp mcpAccepted
  obtain ⟨_, rfl⟩ := Hooks.Portable.Facts.rendered_components (hookInput input) hooks hooksAccepted
  let mcpFiles := Mcp.Portable.files input.mcp
  let hooksFiles := Hooks.Portable.files (hookInput input)
  have mcpFilesSafe : (mcpFiles.map (fun file => file.path.value)).Pairwise (fun a b => a ≠ b) := by
    simpa [mcpFiles] using mcpSafe.1
  have hooksFilesSafe : (hooksFiles.map (fun file => file.path.value)).Pairwise (fun a b => a ≠ b) := by
    simpa [hooksFiles] using hooksSafe.1
  have mcpPayloadSafe := payload_paths_pairwise mcpFiles mcpFilesSafe
  have hooksPayloadSafe := payload_paths_pairwise hooksFiles hooksFilesSafe
  have disjoint : ∀ left, left ∈ (mcpFiles.filter payload).map (fun file => file.path.value) →
      ∀ right, right ∈ (hooksFiles.filter payload).map (fun file => file.path.value) →
        left ≠ right := by
    intro left leftMember right rightMember
    exact component_payload_cross_role input mcpFiles hooksFiles rfl rfl
      left leftMember right rightMember
  have payloadSafe := List.pairwise_append.mpr ⟨mcpPayloadSafe, hooksPayloadSafe, disjoint⟩
  have runtimeSeparate : ∀ path, path ∈
      ((mcpFiles.filter payload).map (fun file => file.path.value) ++
        (hooksFiles.filter payload).map (fun file => file.path.value)) →
        Process.Portable.runtimeFile.value ≠ path := by
    intro path member
    rcases List.mem_append.mp member with inMcp | inHooks
    · obtain ⟨file, fileMember, rfl⟩ := List.mem_map.mp inMcp
      have original : file ∈ Mcp.Portable.files input.mcp := by
        simpa [mcpFiles] using (List.mem_filter.mp fileMember).1
      exact mcp_path_ne_runtime _ (mcp_payload_path input.mcp file
        original (List.mem_filter.mp fileMember).2)
    · obtain ⟨file, fileMember, rfl⟩ := List.mem_map.mp inHooks
      have original : file ∈ Hooks.Portable.files (hookInput input) := by
        simpa [hooksFiles] using (List.mem_filter.mp fileMember).1
      exact hooks_path_ne_runtime _ (hooks_payload_path (hookInput input) file
        original (List.mem_filter.mp fileMember).2)
  have pathsEq :
      ((mcpFiles ++ hooksFiles).filter payload).map (fun file => file.path.value) =
        (mcpFiles.filter payload).map (fun file => file.path.value) ++
          (hooksFiles.filter payload).map (fun file => file.path.value) := by
    simp only [List.filter_append, List.map_append]
  have sharedSafe : ((sharedFiles mcpFiles hooksFiles).map
      (fun file => file.path.value)).Pairwise (fun left right => left ≠ right) := by
    by_cases empty : mcpFiles = [] ∧ hooksFiles = []
    · simp [sharedFiles, empty]
    · simp only [sharedFiles, empty, ↓reduceIte, List.map_cons]
      rw [pathsEq, List.pairwise_cons]
      exact ⟨runtimeSeparate, payloadSafe⟩
  refine ⟨?_, ?_⟩
  · simpa [mcpFiles, hooksFiles] using sharedSafe
  intro file member
  refine ⟨file.path.contained, ?_⟩
  by_cases empty : mcpFiles = [] ∧ hooksFiles = []
  · simp [sharedFiles, mcpFiles, hooksFiles, empty] at member
  · simp only [sharedFiles, mcpFiles, hooksFiles, empty, ↓reduceIte, List.mem_cons] at member
    rcases member with runtime | generated
    · subst file
      exact Process.Portable.runtimeFile_no_dollar
    · have generated' : file ∈ (mcpFiles ++ hooksFiles).filter payload := generated
      have originalMember : file ∈ mcpFiles ++ hooksFiles :=
        (List.mem_filter.mp generated').1
      rcases List.mem_append.mp originalMember with inMcp | inHooks
      · exact (mcpSafe.2 file inMcp).2
      · exact (hooksSafe.2 file inHooks).2

end PluginSdk.Compiler.Portable.Proofs
