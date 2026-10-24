import PluginSdk.Compiler.Mcp.Model
import PluginSdk.Compiler.Native
import PluginSdk.Compiler.Process.LauncherProofs

namespace PluginSdk.Compiler.Mcp.Proofs

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process
open PluginSdk.Compiler.Process.Launcher
open PluginSdk.Compiler.Mcp

private theorem rendered_output_components (input : Input) (output : Output)
    (rendered : model.render input = .rendered output) :
    failedIssues input = [] ∧
      output.document = expectedDocument input ∧
      output.files = expectedGeneratedFiles input := by
  change render input = .rendered output at rendered
  unfold render at rendered
  cases failure : failedIssues input with
  | nil =>
    simp only [failure] at rendered
    cases rendered
    exact ⟨rfl, rfl, rfl⟩
  | cons issue rest =>
    simp only [failure] at rendered
    cases rendered

private theorem failedNames_nil_iff (entries : List IndexedLocal) :
    (entries.filterMap fun entry =>
      if entry.native.isNone then some entry.name else none) = [] ↔
      ∀ entry, entry ∈ entries → entry.native ≠ none := by
  induction entries with
  | nil => simp
  | cons head tail inductionHypothesis =>
    by_cases unavailable : head.native = none
    · simp [unavailable]
    · simp [unavailable]

private theorem option_ne_none_iff_exists {α : Type} (value : Option α) :
    value ≠ none ↔ ∃ someValue, value = some someValue := by
  cases value <;> simp

private theorem failedIssues_nil_iff_available (input : Input) :
    failedIssues input = [] ↔
      ∀ entry, entry ∈ indexedEntries input → ∃ native, entry.native = some native := by
  rw [show failedIssues input = (failedNames input).map Issue.unsupportedLauncher from rfl]
  rw [List.map_eq_nil_iff]
  constructor
  · intro noFailures entry member
    exact (option_ne_none_iff_exists entry.native).mp
      ((failedNames_nil_iff (indexedEntries input)).mp noFailures entry member)
  · intro available
    apply (failedNames_nil_iff (indexedEntries input)).mpr
    intro entry member
    exact (option_ne_none_iff_exists entry.native).mpr (available entry member)

private theorem local_names_nodup (input : Input) (normalized : Normalized input) :
    (input.locals.map Prod.fst).Nodup := by
  exact (List.nodup_append.mp normalized.1).2.1

private theorem key_before_singleton {left right : String}
    (ordered : KeyBefore [left] [right]) : Utf8Before left right := by
  cases ordered with
  | rel value => exact value
  | cons tail => cases tail

private theorem canonicalLocals_name_ordered (input : Input) (normalized : Normalized input) :
    (canonicalLocals input.locals).Pairwise (fun left right => Utf8Before left.1 right.1) := by
  have namesPairwise : (input.locals.map Prod.fst).Pairwise (fun left right => left ≠ right) :=
    local_names_nodup input normalized
  have sourceDistinct : input.locals.Pairwise (fun left right => left.1 ≠ right.1) :=
    (List.pairwise_map.mp namesPairwise)
  have keysDistinct : input.locals.Pairwise (fun left right => [left.1] ≠ [right.1]) :=
    sourceDistinct.imp (fun different same => different (List.singleton_inj.mp same))
  have sorted := ordered_strict (fun server : String × Plan => [server.1]) input.locals keysDistinct
  exact sorted.imp (fun {left right} ordered => key_before_singleton ordered)

private theorem enumerateFrom_snd_mem {α : Type} (start : Nat) (values : List α)
    {entry : Nat × α} (member : entry ∈ Generated.enumerateFrom start values) : entry.2 ∈ values := by
  induction values generalizing start with
  | nil => simp [Generated.enumerateFrom] at member
  | cons head tail inductionHypothesis =>
    simp only [Generated.enumerateFrom, List.mem_cons] at member
    rcases member with equal | member
    · cases equal
      simp
    · exact List.mem_cons_of_mem _ (inductionHypothesis (start := start + 1) member)

private theorem enumerateFrom_pairwise_snd {α : Type} (relation : α → α → Prop)
    (start : Nat) (values : List α) (ordered : values.Pairwise relation) :
    (Generated.enumerateFrom start values).Pairwise (fun left right => relation left.2 right.2) := by
  induction values generalizing start with
  | nil => simp [Generated.enumerateFrom]
  | cons head tail inductionHypothesis =>
    have ⟨headOrdered, tailOrdered⟩ := List.pairwise_cons.mp ordered
    simp only [Generated.enumerateFrom, List.pairwise_cons]
    constructor
    · intro entry member
      have entryMem : entry.2 ∈ tail := enumerateFrom_snd_mem (start + 1) tail member
      exact headOrdered entry.2 entryMem
    · exact inductionHypothesis (start := start + 1) tailOrdered

private theorem indexedEntries_name_ordered (input : Input) (normalized : Normalized input) :
    (indexedEntries input).Pairwise (fun left right => Utf8Before left.name right.name) := by
  have ordered := enumerateFrom_pairwise_snd (fun left right => Utf8Before left.1 right.1)
    0 (canonicalLocals input.locals) (canonicalLocals_name_ordered input normalized)
  change (Generated.enumerateFrom 0 (canonicalLocals input.locals)).map
    (fun (item : Nat × (String × Plan)) => IndexedLocal.mk item.1 item.2.1 item.2.2
      (nativeFor input item.1 item.2.2)) |>.Pairwise
        (fun left right => Utf8Before left.name right.name)
  exact List.Pairwise.map
    (fun (item : Nat × (String × Plan)) => IndexedLocal.mk item.1 item.2.1 item.2.2
      (nativeFor input item.1 item.2.2))
    (fun _ _ sorted => sorted) ordered

private theorem failedNames_pairwise (input : Input) (normalized : Normalized input) :
    (failedNames input).Pairwise Utf8Before := by
  apply List.Pairwise.filterMap
    (fun entry => if entry.native.isNone then some entry.name else none)
    (fun left right sorted leftName leftMap rightName rightMap => by
      cases left.native <;> cases right.native <;> simp_all)
    (indexedEntries_name_ordered input normalized)

private theorem cwd_native_available_iff (path : PackagePath) (script : Launcher.Script) :
    (∃ native, CwdLauncher.native path script = some native) ↔ script.captures = [] := by
  unfold CwdLauncher.native
  by_cases empty : script.captures = [] <;> simp [empty]

private theorem codex_indexed_entry_native (input : Input) (entry : IndexedLocal)
    (formatEq : input.format = .codexPluginV1) (member : entry ∈ indexedEntries input)
    (noFailures : failedIssues input = []) :
    entry.native = some ⟨"/bin/sh", [(launcherPath entry.ordinal).value], [], some "."⟩ ∧
      (Launcher.model.compile entry.plan).captures = [] := by
  unfold indexedEntries at member
  obtain ⟨item, itemMember, entryEq⟩ := List.mem_map.mp member
  rcases item with ⟨ordinal, ⟨name, plan⟩⟩
  cases entryEq
  have available : ∃ native, nativeFor input ordinal plan = some native := by
    have generatedMember :
        (⟨ordinal, name, plan, nativeFor input ordinal plan⟩ : IndexedLocal) ∈
          indexedEntries input := by
      unfold indexedEntries
      exact List.mem_map.mpr ⟨(ordinal, (name, plan)), itemMember, rfl⟩
    have availableGenerated :=
      (failedIssues_nil_iff_available input).mp noFailures _ generatedMember
    simpa using availableGenerated
  have cwdAvailable :
      ∃ native, CwdLauncher.native (launcherPath ordinal) (Launcher.model.compile plan) = some native := by
    simpa [nativeFor, formatEq] using available
  have capturesEmpty := (cwd_native_available_iff (launcherPath ordinal)
    (Launcher.model.compile plan)).mp cwdAvailable
  have nativeExact : CwdLauncher.native (launcherPath ordinal)
      (Launcher.model.compile plan) =
        some ⟨"/bin/sh", [(launcherPath ordinal).value], [], some "."⟩ := by
    simp [CwdLauncher.native, capturesEmpty]
  refine ⟨?_, capturesEmpty⟩
  simpa [nativeFor, formatEq] using nativeExact

private theorem native_available_iff (input : Input) (entry : IndexedLocal)
    (member : entry ∈ indexedEntries input) :
    (∃ native, entry.native = some native) ↔
      hostFor input.format = .claudeCode ∨ (Launcher.model.compile entry.plan).captures = [] := by
  unfold indexedEntries at member
  obtain ⟨indexed, indexedMember, rfl⟩ := List.mem_map.mp member
  rcases indexed with ⟨ordinal, ⟨name, plan⟩⟩
  change (∃ native, nativeFor input ordinal plan = some native) ↔
    hostFor input.format = .claudeCode ∨ (Launcher.model.compile plan).captures = []
  cases formatEq : input.format with
  | agentPluginsV1 =>
    obtain ⟨nativeShape, _⟩ := Launcher.Proofs.L6_native_shape_exact
    simpa [nativeFor, hostFor, formatEq] using nativeShape .codex (launcherPath ordinal)
      (Launcher.model.compile plan)
  | claudeCodeV1 =>
    obtain ⟨nativeShape, _⟩ := Launcher.Proofs.L6_native_shape_exact
    simpa [nativeFor, hostFor, formatEq] using nativeShape .claudeCode (launcherPath ordinal)
      (Launcher.model.compile plan)
  | codexPluginV1 =>
    simpa [nativeFor, hostFor, formatEq] using cwd_native_available_iff (launcherPath ordinal)
      (Launcher.model.compile plan)

private theorem rejected_issues_eq (input : Input) (issues : NonemptyList Issue)
    (rejected : model.render input = .rejected issues) : issues.toList = failedIssues input := by
  change render input = .rejected issues at rejected
  unfold render at rejected
  cases failure : failedIssues input with
  | nil => simp [failure] at rejected
  | cons head tail =>
    simp only [failure] at rejected
    cases issues with
    | mk issue rest =>
      simp only [Result.rejected.injEq] at rejected
      cases rejected
      rfl

theorem K4_accepts_exactly_native : K4_accepts_exactly_native model := by
  intro input normalized
  refine ⟨?_, ?_, ?_, ?_, ?_⟩
  · constructor
    · rintro ⟨output, rendered⟩
      exact (failedIssues_nil_iff_available input).mp
        (rendered_output_components input output rendered).1
    · intro available
      have noFailures := (failedIssues_nil_iff_available input).mpr available
      refine ⟨⟨expectedDocument input, expectedGeneratedFiles input⟩, ?_⟩
      change render input = .rendered ⟨expectedDocument input, expectedGeneratedFiles input⟩
      simp [render, noFailures]
  · intro entry member
    exact native_available_iff input entry member
  · intro issues rejected
    exact rejected_issues_eq input issues rejected
  · have sorted := failedNames_pairwise input normalized
    exact sorted.imp (fun {left right} before => by
      intro same
      subst right
      exact utf8_irrefl left before)
  · exact failedNames_pairwise input normalized

theorem K2_generated_files_exact : K2_generated_files_exact model := by
  intro input output rendered
  exact (rendered_output_components input output rendered).2.2

private theorem indexedEntries_ordinal_pairwise (input : Input) :
    (indexedEntries input).Pairwise (fun left right => left.ordinal < right.ordinal) := by
  unfold indexedEntries indexedLocals
  apply List.pairwise_map.mpr
  simpa using Generated.enumerateFrom_pairwise 0 (canonicalLocals input.locals)

private theorem expectedGeneratedFiles_paths_pairwise (input : Input) :
    expectedGeneratedFiles input |>.map (fun file => file.path.value) |>.Pairwise
      (fun left right => left ≠ right) := by
  unfold expectedGeneratedFiles
  rw [List.pairwise_map]
  apply List.Pairwise.map (expectedGeneratedFile input.format)
    (fun left right ordered => by
      intro samePath
      have sameOrdinal : left.ordinal = right.ordinal :=
        launcherPath_value_injective (by simpa [expectedGeneratedFile] using samePath)
      omega)
    (indexedEntries_ordinal_pairwise input)

theorem K3_launcher_paths_safe : K3_launcher_paths_safe model := by
  refine ⟨?_, ?_, ?_⟩
  · intro ordinal
    exact ⟨(launcherPath ordinal).contained, launcherPath_no_dollar ordinal⟩
  · intro left right same
    exact launcherPath_value_injective same
  · intro input output rendered
    have filesEq := (rendered_output_components input output rendered).2.2
    rw [filesEq]
    exact expectedGeneratedFiles_paths_pairwise input

private theorem enumerateFrom_snd_eq {α : Type} (start : Nat) (values : List α) :
    (Generated.enumerateFrom start values).map Prod.snd = values := by
  induction values generalizing start with
  | nil => rfl
  | cons head tail inductionHypothesis =>
    simp [Generated.enumerateFrom, inductionHypothesis]

private theorem filterMap_keys_of_some {α β : Type} (entries : List α)
    (key : α → String) (get : α → Option β)
    (available : ∀ entry, entry ∈ entries → ∃ value, get entry = some value) :
    (entries.filterMap fun entry => (get entry).map fun _ => key entry) = entries.map key := by
  induction entries with
  | nil => rfl
  | cons entry rest inductionHypothesis =>
    obtain ⟨value, valueEq⟩ := available entry (by simp)
    have headEq : (get entry).map (fun _ => key entry) = some (key entry) := by
      simp [valueEq]
    have restAvailable : ∀ item, item ∈ rest → ∃ value, get item = some value := by
      intro item member
      exact available item (by simp [member])
    change List.filterMap (fun item => (get item).map (fun _ => key item))
      (entry :: rest) = _
    rw [List.filterMap_cons_some (f := fun item =>
      (get item).map (fun _ => key item)) (a := entry) (l := rest) headEq]
    simp [inductionHypothesis restAvailable]

private theorem localEntries_keys_eq (input : Input)
    (available : ∀ entry, entry ∈ indexedEntries input → ∃ native, entry.native = some native) :
    (localEntries input).map Prod.fst = (indexedEntries input).map IndexedLocal.name := by
  unfold localEntries
  rw [List.map_filterMap]
  simpa [Function.comp_def] using
    filterMap_keys_of_some (indexedEntries input) IndexedLocal.name
      (fun entry => entry.native) available

private theorem indexedEntries_names_eq (input : Input) :
    (indexedEntries input).map IndexedLocal.name = (canonicalLocals input.locals).map Prod.fst := by
  have nameFunction :
      (IndexedLocal.name ∘ fun item : Nat × (String × Plan) =>
        IndexedLocal.mk item.1 item.2.1 item.2.2
          (nativeFor input item.1 item.2.2)) = fun item => item.2.1 := by
    funext item
    rfl
  simp only [indexedEntries, indexedLocals, List.map_map]
  rw [nameFunction]
  change (Generated.enumerateFrom 0 (canonicalLocals input.locals)).map
    (Prod.fst ∘ Prod.snd) = _
  rw [← List.map_map]
  rw [enumerateFrom_snd_eq]

private theorem serverEntries_keys_perm (input : Input)
    (available : ∀ entry, entry ∈ indexedEntries input → ∃ native, entry.native = some native) :
    (serverEntries input).map Prod.fst |>.Perm
      (input.remote.map Prod.fst ++ input.locals.map Prod.fst) := by
  rw [show (serverEntries input).map Prod.fst =
    (remoteEntries input).map Prod.fst ++ (localEntries input).map Prod.fst by
      simp [serverEntries, List.map_append]]
  rw [show (remoteEntries input).map Prod.fst = input.remote.map Prod.fst by
    simp [remoteEntries]]
  rw [localEntries_keys_eq input available, indexedEntries_names_eq]
  exact List.Perm.append (List.Perm.refl _) ((ordered_perm
    (fun server : String × Plan => [server.1]) input.locals).map Prod.fst)

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
    Field (object (documentRows input)).value "mcpServers" (object (serverEntries input)).value := by
  apply object_field
  · cases formatEq : input.format <;> simp [documentRows, schemaRows, formatEq]
  · simp [documentRows, schemaRows]

private theorem native_rows_keys (format : Format) (native : Native) :
    (nativeRows format native).map Prod.fst = nativeKeys format native := by
  cases format <;> cases native.cwd <;> simp [nativeRows, nativeKeys]

private theorem native_object_keys (format : Format) (native : Native) :
    ObjectKeys (nativeObject format native).value (nativeKeys format native) := by
  simpa [nativeObject, native_rows_keys] using object_keys (nativeRows format native)

private theorem expectedDocument_present_iff (input : Input) :
    (expectedDocument input).isSome = true ↔ input.remote ≠ [] ∨ input.locals ≠ [] := by
  unfold expectedDocument
  by_cases remoteEmpty : input.remote = [] <;> by_cases localEmpty : input.locals = [] <;>
    simp [remoteEmpty, localEmpty]

theorem K1_servers_exact : K1_servers_exact model := by
  intro input output normalized rendered
  have components := rendered_output_components input output rendered
  constructor
  · rw [components.2.1]
    exact expectedDocument_present_iff input
  · rw [components.2.1]
    cases documentEq : expectedDocument input with
    | none => simp
    | some document =>
      unfold expectedDocument at documentEq
      split at documentEq
      · contradiction
      · injection documentEq with documentEq
        subst document
        have available := (failedIssues_nil_iff_available input).mp components.1
        have keyPermutation := serverEntries_keys_perm input available
        have serverKeysNodup : (serverEntries input).map Prod.fst |>.Nodup :=
          keyPermutation.nodup_iff.mpr normalized.1
        refine ⟨?_, document_schema_field input, ?_⟩
        · cases formatEq : input.format <;>
            simpa [documentRows, schemaRows, formatEq] using object_keys (documentRows input)
        · refine ⟨(object (serverEntries input)).value, document_mcp_servers_field input,
            ?_, ?_, ?_⟩
          ·
            refine ⟨(object_keys (serverEntries input)).1, ?_⟩
            intro key
            rw [(object_keys (serverEntries input)).2 key]
            exact keyPermutation.mem_iff
          · intro name source member
            have memberEntries :
                (name, (object (serverRows input.format source)).value) ∈ remoteEntries input := by
              unfold remoteEntries
              exact List.mem_map.mpr ⟨(name, source), member, rfl⟩
            have memberAll := List.mem_append_left (localEntries input) memberEntries
            exact object_field serverKeysNodup memberAll
          · intro entry entryMember native nativeEq
            have memberEntries :
                (entry.name, (nativeObject input.format native).value) ∈ localEntries input := by
              unfold localEntries
              apply List.mem_filterMap.mpr
              refine ⟨entry, entryMember, ?_⟩
              simp [nativeEq]
            have memberAll := List.mem_append_right (remoteEntries input) memberEntries
            exact ⟨object_field serverKeysNodup memberAll, native_object_keys input.format native⟩

private def remoteEntryRow (format : Format) (server : String × RemoteMcp) : String × Json :=
  (server.1, (object (serverRows format server.2)).value)

private theorem remote_server_object_eq (format : Format) (left right : RemoteMcp)
    (headersNodup : (left.headers.map Prod.fst).Nodup)
    (urlEq : left.url = right.url) (headersPerm : left.headers.Perm right.headers) :
    object (serverRows format left) = object (serverRows format right) := by
  have headerRowsPerm : (headerRows left).Perm (headerRows right) := by
    simpa [headerRows] using headersPerm.map
      (fun binding => (binding.1, Json.str (headerText binding.2)))
  have headerKeysNodup : (headerRows left).map Prod.fst |>.Nodup := by
    have keysEq : (headerRows left).map Prod.fst = left.headers.map Prod.fst := by
      simp [headerRows]
    rw [keysEq]
    exact headersNodup
  have headersObjectEq := object_eq_of_perm headerRowsPerm headerKeysNodup
  have headersValueEq : (object (headerRows left)).value = (object (headerRows right)).value :=
    congrArg JsonObject.value headersObjectEq
  apply congrArg object
  simp [serverRows, urlEq, headersValueEq]

private theorem remote_entry_row_eq (format : Format) (left right : String × RemoteMcp)
    (headerKeysNodup : (left.2.headers.map Prod.fst).Nodup)
    (equivalent : RemoteEquivalent left right) :
    remoteEntryRow format left = remoteEntryRow format right := by
  rcases equivalent with ⟨nameEq, urlEq, headersPerm⟩
  have serverEq := remote_server_object_eq format left.2 right.2 headerKeysNodup urlEq headersPerm
  have valueEq := congrArg JsonObject.value serverEq
  simp [remoteEntryRow, nameEq, valueEq]

private theorem inOrder_remoteRows_eq (format : Format)
    (left right : List (String × RemoteMcp)) (ordered : InOrder RemoteEquivalent left right)
    (headerKeysNodup : ∀ entry, entry ∈ left → (entry.2.headers.map Prod.fst).Nodup) :
    left.map (remoteEntryRow format) = right.map (remoteEntryRow format) := by
  induction left generalizing right with
  | nil =>
    cases right with
    | nil => rfl
    | cons head tail => simp [InOrder] at ordered
  | cons head tail inductionHypothesis =>
    cases right with
    | nil => cases ordered
    | cons rightHead rightTail =>
      rcases ordered with ⟨related, tailOrdered⟩
      have headEq := remote_entry_row_eq format head rightHead
        (headerKeysNodup head (by simp)) related
      have tailEq := inductionHypothesis rightTail tailOrdered (by
        intro entry member
        exact headerKeysNodup entry (List.mem_cons_of_mem _ member))
      simp [headEq, tailEq]

private theorem inOrder_nil_iff {α : Type} {relation : α → α → Prop}
    {left right : List α} (ordered : InOrder relation left right) :
    left = [] ↔ right = [] := by
  cases left <;> cases right <;> simp [InOrder] at ordered ⊢

private theorem remoteEntries_perm_of_equivalent (left right : Input)
    (formatEq : left.format = right.format)
    (reordered : List (String × RemoteMcp))
    (permutation : left.remote.Perm reordered)
    (ordered : InOrder RemoteEquivalent reordered right.remote)
    (headerKeysNodup : ∀ entry, entry ∈ left.remote →
      (entry.2.headers.map Prod.fst).Nodup) :
    (remoteEntries left).Perm (remoteEntries right) := by
  have reorderedHeaderKeysNodup : ∀ entry, entry ∈ reordered →
      (entry.2.headers.map Prod.fst).Nodup := by
    intro entry member
    exact headerKeysNodup entry (permutation.symm.subset member)
  have rowsEq := inOrder_remoteRows_eq left.format reordered right.remote ordered
    reorderedHeaderKeysNodup
  change (left.remote.map (remoteEntryRow left.format)).Perm
    (right.remote.map (remoteEntryRow right.format))
  rw [← formatEq]
  exact (permutation.map (remoteEntryRow left.format)).trans (by
    rw [rowsEq]
  )

private theorem canonicalLocals_eq_of_perm (left right : Input)
    (leftNormalized : Normalized left) (permutation : left.locals.Perm right.locals) :
    canonicalLocals left.locals = canonicalLocals right.locals := by
  apply ordered_eq_of_perm (fun server : String × Plan => [server.1]) permutation
  intro a aMember b bMember keyEq
  have leftNamesNodup := local_names_nodup left leftNormalized
  have leftDistinct : left.locals.Pairwise (fun first second => first.1 ≠ second.1) :=
    List.pairwise_map.mp leftNamesNodup
  have bLeft : b ∈ left.locals := permutation.symm.subset bMember
  have pairEq := key_injective_on Prod.fst leftDistinct a aMember b bLeft
    (List.singleton_inj.mp keyEq)
  exact pairEq

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

private theorem expectedDocument_eq_of_composition (left right : Input)
    (formatEq : left.format = right.format)
    (remoteEmptyIff : left.remote = [] ↔ right.remote = [])
    (localsPerm : left.locals.Perm right.locals)
    (serversEq : object (serverEntries left) = object (serverEntries right)) :
    expectedDocument left = expectedDocument right := by
  have localsEmpty := perm_nil_iff localsPerm
  have rowsEq : documentRows left = documentRows right := by
    have serversValueEq : (object (serverEntries left)).value =
        (object (serverEntries right)).value := congrArg JsonObject.value serversEq
    simp [documentRows, formatEq, serversValueEq]
  by_cases emptyLeft : left.remote = [] ∧ left.locals = []
  · have emptyRight : right.remote = [] ∧ right.locals = [] :=
      ⟨remoteEmptyIff.mp emptyLeft.1, localsEmpty.mp emptyLeft.2⟩
    simp [expectedDocument, emptyLeft, emptyRight]
  · have notEmptyRight : ¬ (right.remote = [] ∧ right.locals = []) := by
      intro emptyRight
      exact emptyLeft ⟨remoteEmptyIff.mpr emptyRight.1, localsEmpty.mpr emptyRight.2⟩
    simp [expectedDocument, emptyLeft, notEmptyRight, rowsEq]

theorem K5_enumeration_invariant : K5_enumeration_invariant model := by
  intro left right leftNormalized rightNormalized equivalent
  rcases equivalent with ⟨formatEq, ⟨reordered, remotePermutation, remoteOrder⟩, localPermutation⟩
  have localsCanonicalEq := canonicalLocals_eq_of_perm left right leftNormalized localPermutation
  have indexedEq : indexedEntries left = indexedEntries right := by
    simp [indexedEntries, indexedLocals, localsCanonicalEq, nativeFor, formatEq]
  have failuresEq : failedIssues left = failedIssues right := by
    simp [failedIssues, failedNames, indexedEq]
  have generatedEq : expectedGeneratedFiles left = expectedGeneratedFiles right := by
    simp [expectedGeneratedFiles, indexedEq, formatEq]
  have remoteEmptyIff : left.remote = [] ↔ right.remote = [] :=
    (perm_nil_iff remotePermutation).trans (inOrder_nil_iff remoteOrder)
  change render left = render right
  unfold render
  rw [failuresEq]
  cases failure : failedIssues right with
  | nil =>
    have available : ∀ entry, entry ∈ indexedEntries left →
        ∃ native, entry.native = some native := by
      have failureLeft : failedIssues left = [] := by rw [failuresEq]; exact failure
      exact (failedIssues_nil_iff_available left).mp failureLeft
    have serverEntriesPerm : (serverEntries left).Perm (serverEntries right) := by
      have leftHeadersNodup : ∀ entry, entry ∈ left.remote →
          (entry.2.headers.map Prod.fst).Nodup := by
        intro entry member
        obtain ⟨_, headersNodup⟩ := leftNormalized.2.1 entry.1 entry.2 member
        exact headersNodup
      have remoteRowsPerm := remoteEntries_perm_of_equivalent left right formatEq reordered
        remotePermutation remoteOrder leftHeadersNodup
      have localsEq : localEntries left = localEntries right := by
        simp [localEntries, indexedEq, formatEq]
      rw [serverEntries, serverEntries]
      rw [localsEq]
      exact List.Perm.append remoteRowsPerm (List.Perm.refl _)
    have keysNodup : (serverEntries left).map Prod.fst |>.Nodup := by
      have keysPerm := serverEntries_keys_perm left available
      exact keysPerm.nodup_iff.mpr leftNormalized.1
    have serversObjectEq := object_eq_of_perm serverEntriesPerm keysNodup
    have documentEq := expectedDocument_eq_of_composition left right formatEq
      remoteEmptyIff localPermutation serversObjectEq
    simp [documentEq, generatedEq]
  | cons issue rest =>
    rfl

private theorem expectedDocument_eq_legacy (input : Input)
    (localsEmpty : input.locals = []) (remoteNonempty : input.remote ≠ []) :
    expectedDocument input = legacyDocument input := by
  simp [expectedDocument, legacyDocument, legacyInput, mcp, mcpRows, documentRows,
    serverEntries, remoteEntries, localEntries, indexedEntries, indexedLocals,
    canonicalLocals, ordered, Generated.enumerateFrom, localsEmpty, remoteNonempty]

theorem K6_remote_document_preserved : K6_remote_document_preserved model := by
  intro input output normalized localsEmpty rendered
  have components := rendered_output_components input output rendered
  refine ⟨?_, ?_, ?_⟩
  · rw [components.2.2]
    simp [expectedGeneratedFiles, indexedEntries, indexedLocals, localsEmpty,
      canonicalLocals, ordered, Generated.enumerateFrom]
  · rw [components.2.1]
    simpa [localsEmpty] using expectedDocument_present_iff input
  · intro remoteNonempty
    rw [components.2.1]
    exact expectedDocument_eq_legacy input localsEmpty remoteNonempty

theorem K7_cwd_root_preserved : K7_cwd_root_preserved model := by
  refine ⟨?_, ?_⟩
  · intro root
    simp [CwdLauncher.readRoot, String.toList_append]
  · intro input output formatEq rendered entry entryMember
    have components := rendered_output_components input output rendered
    have noFailures := components.1
    have nativeAndCaptures := codex_indexed_entry_native input entry formatEq entryMember noFailures
    refine ⟨nativeAndCaptures.1, ?_, ?_⟩
    · have fileMember : expectedGeneratedFile input.format entry ∈ expectedGeneratedFiles input :=
        List.mem_map.mpr ⟨entry, entryMember, rfl⟩
      rw [components.2.2]
      simpa [expectedGeneratedFile, formatEq, Launcher.model] using fileMember
    · intro root ambient
      rw [show CwdLauncher.readRoot (root ++ "\n.") = some root by
        simp [CwdLauncher.readRoot, String.toList_append]]
      exact Launcher.Proofs.L4_complete_process_preserved entry.plan root ambient

end PluginSdk.Compiler.Mcp.Proofs
