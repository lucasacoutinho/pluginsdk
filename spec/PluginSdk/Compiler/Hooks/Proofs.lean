import PluginSdk.Compiler.Hooks.Model
import PluginSdk.Compiler.Hooks.Properties
import PluginSdk.Compiler.Process.LauncherProofs

namespace PluginSdk.Compiler.Hooks.Proofs

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process

private theorem rendered_output_components (input : Input) (output : Output)
    (rendered : Hooks.model.render input = .rendered output) :
    failedIssues input = [] ∧ output.document = expectedDocument input ∧
      output.files = expectedFiles input := by
  change Hooks.render input = .rendered output at rendered
  unfold Hooks.render at rendered
  cases failure : failedIssues input with
  | nil =>
      simp only [failure] at rendered
      cases rendered
      exact ⟨rfl, rfl, rfl⟩
  | cons issue rest =>
      simp only [failure] at rendered
      cases rendered

private theorem expectedDocument_present_iff (input : Input) :
    (expectedDocument input).isSome = true ↔ input.hooks ≠ [] := by
  unfold expectedDocument
  by_cases empty : input.hooks = [] <;> simp [empty]

private theorem eventRows_key_iff (input : Input) (event : Event) :
    event.name ∈ (eventRows input).map Prod.fst ↔ forEvent input event ≠ [] := by
  cases event <;> simp [eventRows, events, Event.name, forEvent]

private theorem eventRows_keys_nodup (input : Input) :
    ((eventRows input).map Prod.fst).Nodup := by
  by_cases sessionStartEmpty : forEvent input .sessionStart = [] <;>
    by_cases userPromptSubmitEmpty : forEvent input .userPromptSubmit = [] <;>
    simp [eventRows, events, Event.name, sessionStartEmpty, userPromptSubmitEmpty]

private theorem eventRows_value (input : Input) (event : Event)
    (nonempty : forEvent input event ≠ []) :
    (event.name, .arr ((forEvent input event).toArray.map
      fun entry => (group input.host entry).value)) ∈ eventRows input := by
  unfold eventRows
  have eventMember : event ∈ events := by cases event <;> simp [events]
  apply List.mem_filterMap.mpr
  refine ⟨event, eventMember, ?_⟩
  simp [nonempty, Event.name]

private theorem expectedDocument_fields (input : Input) (document : JsonObject)
    (documentEq : expectedDocument input = some document) :
    ObjectKeys document.value ["hooks"] ∧
      ∃ groups, Field document.value "hooks" groups ∧
        ObjectKeys groups ((eventRows input).map Prod.fst) ∧
        ∀ event,
          (forEvent input event ≠ [] ↔ ∃ value, Field groups event.name value) ∧
          (forEvent input event ≠ [] →
            Field groups event.name
              (.arr ((forEvent input event).toArray.map
                fun entry => (group input.host entry).value))) := by
  by_cases empty : input.hooks = []
  · simp [expectedDocument, empty] at documentEq
  · have documentShape : document = object
        [("hooks", (object (eventRows input)).value)] := by
      simpa [expectedDocument, empty] using documentEq.symm
    subst document
    refine ⟨?_, ?_⟩
    · simpa using object_keys [("hooks", (object (eventRows input)).value)]
    · refine ⟨(object (eventRows input)).value, ?_, ?_, ?_⟩
      · apply object_field (by simp)
        simp
      · exact object_keys (eventRows input)
      · intro event
        have keys := object_keys (eventRows input)
        refine ⟨?_, ?_⟩
        · constructor
          · intro nonempty
            have member := eventRows_value input event nonempty
            exact ⟨_, object_field (eventRows_keys_nodup input) member⟩
          · rintro ⟨value, field⟩
            exact (eventRows_key_iff input event).mp
              ((keys.2 event.name).mp ⟨value, field⟩)
        · intro nonempty
          have member := eventRows_value input event nonempty
          exact object_field (eventRows_keys_nodup input) member

private theorem enumerateFrom_snd_eq {α : Type} (start : Nat) (values : List α) :
    (Generated.enumerateFrom start values).map Prod.snd = values := by
  induction values generalizing start with
  | nil => rfl
  | cons head tail inductionHypothesis =>
      simp [Generated.enumerateFrom, inductionHypothesis]

private theorem indexedHooks_pairs_eq (input : Input) :
    (indexedHooks input).map (fun entry => (entry.name, entry.hook)) =
      canonicalHooks input.hooks := by
  simp only [indexedHooks, List.map_map]
  change (Generated.enumerateFrom 0 (canonicalHooks input.hooks)).map Prod.snd = _
  exact enumerateFrom_snd_eq 0 (canonicalHooks input.hooks)

private theorem indexedHooks_mem_iff (input : Input) (name : String) (hook : Hook) :
    (name, hook) ∈ input.hooks ↔
      ∃ entry, entry ∈ indexedHooks input ∧ entry.name = name ∧ entry.hook = hook := by
  have pairs := indexedHooks_pairs_eq input
  have canonicalPerm := ordered_perm (fun entry : String × Hook => [entry.1]) input.hooks
  constructor
  · intro member
    have canonicalMember : (name, hook) ∈ canonicalHooks input.hooks :=
      canonicalPerm.mem_iff.mpr member
    rw [← pairs] at canonicalMember
    obtain ⟨entry, entryMember, pairEq⟩ := List.mem_map.mp canonicalMember
    refine ⟨entry, entryMember, ?_, ?_⟩
    · have := congrArg Prod.fst pairEq
      simpa using this
    · have := congrArg Prod.snd pairEq
      simpa using this
  · rintro ⟨entry, entryMember, nameEq, hookEq⟩
    have pairMember : (entry.name, entry.hook) ∈
        (indexedHooks input).map (fun value => (value.name, value.hook)) :=
      List.mem_map.mpr ⟨entry, entryMember, rfl⟩
    rw [pairs] at pairMember
    have inputMember := canonicalPerm.mem_iff.mp pairMember
    simpa [nameEq, hookEq] using inputMember

private theorem indexedHooks_names_nodup (input : Input) (normalized : Normalized input) :
    ((indexedHooks input).map IndexedHook.name).Nodup := by
  have canonicalKeysNodup : (canonicalHooks input.hooks).map Prod.fst |>.Nodup := by
    have canonicalPerm := (ordered_perm
      (fun entry : String × Hook => [entry.1]) input.hooks).map Prod.fst
    exact canonicalPerm.nodup_iff.mpr normalized.1
  have keysEq : (indexedHooks input).map IndexedHook.name =
      (canonicalHooks input.hooks).map Prod.fst := by
    calc
      _ = ((indexedHooks input).map (fun entry => (entry.name, entry.hook))).map Prod.fst := by simp
      _ = _ := congrArg (List.map Prod.fst) (indexedHooks_pairs_eq input)
  rw [keysEq]
  exact canonicalKeysNodup

private theorem compiled_capture_sources_nodup (plan : Plan) :
    ((Launcher.model.compile plan).captures.map Launcher.Capture.source).Nodup := by
  have sourceNamesNodup : (Launcher.sourceNames plan).Nodup :=
    (ordered_perm (fun name : EnvironmentName => [name.value])
      (unique ((Launcher.words plan).flatMap Launcher.references))).nodup_iff.mpr
        (unique_nodup _)
  have captureSources :
      ((Launcher.model.compile plan).captures.map Launcher.Capture.source) =
        Launcher.sourceNames plan := by
    simp only [Launcher.model, Launcher.compile, List.map_map]
    have sourceEq : Launcher.Capture.source ∘
        Launcher.captureFor (Launcher.requestedNames plan) = id := by
      funext name
      rfl
    rw [sourceEq]
    simp
  rw [captureSources]
  exact sourceNamesNodup

private theorem flatMap_map_pair_nodup {α β : Type} (entries : List α)
    (key : α → String) (values : α → List β)
    (keysNodup : (entries.map key).Nodup)
    (valuesNodup : ∀ entry, entry ∈ entries → (values entry).Nodup) :
    (entries.flatMap fun entry => (values entry).map fun value => (key entry, value)).Nodup := by
  induction entries with
  | nil => simp
  | cons head tail inductionHypothesis =>
      have ⟨headNotTail, tailKeysNodup⟩ := List.nodup_cons.mp keysNodup
      have headValuesNodup := valuesNodup head (by simp)
      have tailValuesNodup : ∀ entry, entry ∈ tail → (values entry).Nodup := by
        intro entry member
        exact valuesNodup entry (by simp [member])
      have headPairsNodup :
          ((values head).map fun value => (key head, value)).Nodup := by
        apply List.nodup_iff_pairwise_ne.mpr
        apply List.Pairwise.map
          (R := fun left right : β => left ≠ right)
          (S := fun left right : String × β => left ≠ right)
          (fun value => (key head, value))
          (fun left right distinct => by
            intro same
            exact distinct (congrArg Prod.snd same))
        exact List.nodup_iff_pairwise_ne.mp headValuesNodup
      have tailPairsNodup := inductionHypothesis tailKeysNodup tailValuesNodup
      rw [List.flatMap_cons]
      apply List.nodup_append.mpr
      refine ⟨headPairsNodup, tailPairsNodup, ?_⟩
      intro left leftMember right rightMember same
      obtain ⟨leftValue, leftValueMember, rfl⟩ := List.mem_map.mp leftMember
      obtain ⟨entry, entryMember, rightMappedMember⟩ := List.mem_flatMap.mp rightMember
      obtain ⟨rightValue, _rightValueMember, rightEq⟩ := List.mem_map.mp rightMappedMember
      have keyEq : key head = key entry := by
        calc
          key head = right.1 := congrArg Prod.fst same
          _ = key entry := congrArg Prod.fst rightEq.symm
      exact headNotTail (List.mem_map.mpr ⟨entry, entryMember, keyEq.symm⟩)

private def failedIssuePairs (input : Input) : List (String × EnvironmentName) :=
  (indexedHooks input).flatMap fun entry =>
    ((Launcher.model.compile entry.hook.plan).captures.map
      fun capture => (entry.name, capture.source))

private theorem failedIssuePairs_eq (input : Input) :
    failedIssues input = List.map
      (fun pair => Hooks.Issue.environmentReferenceUnsupported pair.1 pair.2)
        (failedIssuePairs input) := by
  unfold failedIssues failedIssuePairs
  rw [List.map_flatMap]
  simp only [List.map_map, Function.comp_def]

private theorem failedIssuePairs_nodup (input : Input) (normalized : Normalized input) :
    (failedIssuePairs input).Nodup := by
  unfold failedIssuePairs
  simpa only [List.map_map, Function.comp_def] using
    flatMap_map_pair_nodup (indexedHooks input) IndexedHook.name
    (fun entry => (Launcher.model.compile entry.hook.plan).captures.map Launcher.Capture.source)
      (indexedHooks_names_nodup input normalized)
      (by
        intro entry member
        exact compiled_capture_sources_nodup entry.hook.plan)

private theorem environment_word_of_reference_member (words : List Word)
    (source : EnvironmentName) (member : source ∈ words.flatMap Launcher.references) :
    Word.environment source ∈ words := by
  obtain ⟨word, wordMember, referenceMember⟩ := List.mem_flatMap.mp member
  cases word with
  | literal text => simp [Launcher.references] at referenceMember
  | root => simp [Launcher.references] at referenceMember
  | file path => simp [Launcher.references] at referenceMember
  | environment name =>
      simp [Launcher.references] at referenceMember
      subst name
      exact wordMember

private theorem failedIssues_nodup (input : Input) (normalized : Normalized input) :
    (failedIssues input).Nodup := by
  rw [failedIssuePairs_eq]
  apply List.nodup_iff_pairwise_ne.mpr
  apply List.Pairwise.map
    (R := fun left right : String × EnvironmentName => left ≠ right)
    (S := fun left right : Hooks.Issue => left ≠ right)
    (fun pair => Hooks.Issue.environmentReferenceUnsupported pair.1 pair.2)
    (fun left right distinct => by
      intro same
      apply distinct
      cases left with
      | mk leftName leftSource =>
          cases right with
          | mk rightName rightSource =>
              simp at same
              exact Prod.ext same.1 same.2)
  exact List.nodup_iff_pairwise_ne.mp (failedIssuePairs_nodup input normalized)

private theorem failedIssuePairs_mem_iff (input : Input) (issue : Hooks.Issue) :
    issue ∈ failedIssues input ↔
      ∃ name hook source, (name, hook) ∈ input.hooks ∧
        .environment source ∈ Launcher.words hook.plan ∧
        issue = Hooks.Issue.environmentReferenceUnsupported name source := by
  rw [failedIssuePairs_eq]
  constructor
  · intro member
    obtain ⟨pair, pairMember, issueEq⟩ := List.mem_map.mp member
    obtain ⟨entry, entryMember, captureListMember⟩ := by
      have pairMember' : pair ∈ (indexedHooks input).flatMap (fun entry =>
          (Launcher.model.compile entry.hook.plan).captures.map
            fun capture => (entry.name, capture.source)) := by
        simpa [failedIssuePairs] using pairMember
      exact List.mem_flatMap.mp pairMember'
    obtain ⟨capture, captureMember, pairEq⟩ := List.mem_map.mp captureListMember
    have pairFields : pair.1 = entry.name ∧ pair.2 = capture.source := by
      exact ⟨(congrArg Prod.fst pairEq).symm, (congrArg Prod.snd pairEq).symm⟩
    have hookMember : (entry.name, entry.hook) ∈ input.hooks :=
      (indexedHooks_mem_iff input entry.name entry.hook).mpr
        ⟨entry, entryMember, rfl, rfl⟩
    have refMember :=
      (Launcher.Proofs.L3_capture_coverage_distinct entry.hook.plan).1 capture.source |>.mpr
        ⟨capture, captureMember, rfl⟩
    have wordMember := environment_word_of_reference_member
      (Launcher.words entry.hook.plan) capture.source refMember
    refine ⟨entry.name, entry.hook, capture.source, hookMember, wordMember, ?_⟩
    simpa [pairFields.1, pairFields.2] using issueEq.symm
  · rintro ⟨name, hook, source, hookMember, sourceMember, issueEq⟩
    obtain ⟨entry, entryMember, nameEq, hookEq⟩ :=
      (indexedHooks_mem_iff input name hook).mp hookMember
    have refsMember : source ∈ (Launcher.words hook.plan).flatMap Launcher.references :=
      List.mem_flatMap.mpr ⟨.environment source, sourceMember, by simp [Launcher.references]⟩
    obtain ⟨capture, captureMember, sourceEq⟩ :=
      (Launcher.Proofs.L3_capture_coverage_distinct hook.plan).1 source |>.mp refsMember
    apply List.mem_map.mpr
    refine ⟨(name, source), ?_, issueEq.symm⟩
    apply List.mem_flatMap.mpr
    refine ⟨entry, entryMember, ?_⟩
    apply List.mem_map.mpr
    refine ⟨capture, ?_, ?_⟩
    · simpa [hookEq] using captureMember
    · simp [nameEq, sourceEq]

private theorem failedIssues_nil_iff_no_references (input : Input) :
    failedIssues input = [] ↔
      ∀ name hook, (name, hook) ∈ input.hooks → NoReferences hook := by
  constructor
  · intro noIssues name hook hookMember
    intro source referenceMember
    have issueMember : Hooks.Issue.environmentReferenceUnsupported name source ∈ failedIssues input :=
      (failedIssuePairs_mem_iff input _).mpr ⟨name, hook, source, hookMember,
        referenceMember, rfl⟩
    simp [noIssues] at issueMember
  · intro noReferences
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro issue issueMember
    obtain ⟨name, hook, source, hookMember, referenceMember, issueEq⟩ :=
      (failedIssuePairs_mem_iff input issue).mp issueMember
    subst issue
    exact (noReferences name hook hookMember) source referenceMember

private theorem rejected_issues_eq (input : Input) (issues : NonemptyList Hooks.Issue)
    (rejected : Hooks.model.render input = .rejected issues) : issues.toList = failedIssues input := by
  change Hooks.render input = .rejected issues at rejected
  unfold Hooks.render at rejected
  cases failure : failedIssues input with
  | nil => simp [failure] at rejected
  | cons issue rest =>
      simp only [failure] at rejected
      cases issues with
      | mk head tail =>
          simp only [Result.rejected.injEq] at rejected
          cases rejected
          rfl

theorem H1_document_exact : H1_document_exact Hooks.model := by
  intro input output normalized rendered
  have components := rendered_output_components input output rendered
  refine ⟨components.2.1, ?_, ?_⟩
  · rw [components.2.1]
    exact expectedDocument_present_iff input
  · intro document documentEq
    exact expectedDocument_fields input document (components.2.1.symm.trans documentEq)

theorem indexedHooks_length (input : Input) :
    (indexedHooks input).length = input.hooks.length := by
  have enumerateLength {α : Type} (start : Nat) (values : List α) :
      (Generated.enumerateFrom start values).length = values.length := by
    induction values generalizing start with
    | nil => rfl
    | cons head tail inductionHypothesis => simp [Generated.enumerateFrom, inductionHypothesis]
  have canonicalLength : (canonicalHooks input.hooks).length = input.hooks.length :=
    (ordered_perm (fun entry : String × Hook => [entry.1]) input.hooks).length_eq
  simp [indexedHooks, enumerateLength, canonicalLength]

theorem H2_files_exact : H2_files_exact Hooks.model := by
  intro input output rendered
  have components := rendered_output_components input output rendered
  refine ⟨components.2.2, ?_⟩
  rw [components.2.2]
  simpa [expectedFiles] using indexedHooks_length input

private theorem handler_rows_nodup (host : Host) (entry : IndexedHook) :
    (handlerRows host entry).map Prod.fst |>.Nodup := by
  cases host <;> simp [handlerRows] <;> decide

private theorem handler_field (host : Host) (entry : IndexedHook)
    (key : String) (value : Json) (member : (key, value) ∈ handlerRows host entry) :
    Field (handler host entry).value key value := by
  exact object_field (handler_rows_nodup host entry) member

private theorem handler_keys (host : Host) (entry : IndexedHook) :
    ObjectKeys (handler host entry).value
      ( ["type", "command", "timeout", "async"] ++
        match host with | .claudeCode => [] | .codex => ["additionalContextLimit"]) := by
  cases host with
  | claudeCode => simpa [handler, handlerRows] using object_keys (handlerRows .claudeCode entry)
  | codex => simpa [handler, handlerRows] using object_keys (handlerRows .codex entry)

private theorem nativeCommand_no_brace (host : Host) (ordinal : Nat) :
    '{' ∉ (nativeCommand host ordinal).toList := by
  cases host <;> simp [nativeCommand, rootVariable, Generated.launcherPath_no_brace]

theorem H3_handlers_exact : H3_handlers_exact Hooks.model := by
  intro input output rendered entry entryMember
  have groupKeys : ObjectKeys (group input.host entry).value ["hooks"] := by
    simpa [group] using object_keys [("hooks", .arr #[(handler input.host entry).value])]
  have groupField : Field (group input.host entry).value "hooks"
      (.arr #[(handler input.host entry).value]) := by
    apply object_field (by simp)
    simp
  have keys := handler_keys input.host entry
  have typeField : Field (handler input.host entry).value "type" (.str "command") :=
    handler_field input.host entry "type" (.str "command") (by simp [handlerRows])
  have commandField : Field (handler input.host entry).value "command"
      (.str (nativeCommand input.host entry.ordinal)) :=
    handler_field input.host entry "command" (.str (nativeCommand input.host entry.ordinal))
      (by simp [handlerRows])
  have timeoutField : Field (handler input.host entry).value "timeout"
      (toJson entry.hook.timeout.value) :=
    handler_field input.host entry "timeout" (toJson entry.hook.timeout.value) (by simp [handlerRows])
  have asyncField : Field (handler input.host entry).value "async" (.bool false) :=
    handler_field input.host entry "async" (.bool false) (by simp [handlerRows])
  refine ⟨groupKeys, groupField, keys, typeField, commandField, timeoutField, asyncField, ?_, ?_⟩
  · intro hostEq
    rw [hostEq]
    exact handler_field .codex entry "additionalContextLimit" (toJson (0 : Nat)) (by simp [handlerRows])
  · exact nativeCommand_no_brace input.host entry.ordinal

theorem indexedHooks_ordinal_pairwise (input : Input) :
    (indexedHooks input).Pairwise (fun left right => left.ordinal < right.ordinal) := by
  unfold indexedHooks
  apply List.Pairwise.map
    (fun item : Nat × (String × Hook) => IndexedHook.mk item.1 item.2.1 item.2.2)
    (fun left right ordered => ordered)
  exact Generated.enumerateFrom_pairwise 0 (canonicalHooks input.hooks)

private theorem expectedFiles_paths_pairwise (input : Input) :
    (expectedFiles input).map (fun file => file.path.value) |>.Pairwise (fun left right => left ≠ right) := by
  unfold expectedFiles
  rw [List.pairwise_map]
  apply List.Pairwise.map expectedFile
    (fun left right ordered => by
      intro samePath
      have ordinals := Generated.launcherPath_value_injective .hooks
        (by simpa [expectedFile] using samePath)
      omega)
    (indexedHooks_ordinal_pairwise input)

theorem H4_paths_safe : H4_paths_safe Hooks.model := by
  refine ⟨?_, ?_, ?_⟩
  · intro ordinal
    exact ⟨(launcherPath ordinal).contained, Generated.launcherPath_no_dollar .hooks ordinal⟩
  · intro left right equal
    exact Generated.launcherPath_value_injective .hooks equal
  · intro input output rendered
    rw [(rendered_output_components input output rendered).2.2]
    exact expectedFiles_paths_pairwise input

theorem H5_acceptance_exact : H5_acceptance_exact Hooks.model := by
  intro input normalized
  refine ⟨?_, ?_⟩
  · constructor
    · rintro ⟨output, rendered⟩
      exact (failedIssues_nil_iff_no_references input).mp
        (rendered_output_components input output rendered).1
    · intro noReferences
      have noIssues := (failedIssues_nil_iff_no_references input).mpr noReferences
      refine ⟨⟨expectedDocument input, expectedFiles input⟩, ?_⟩
      change Hooks.render input = .rendered ⟨expectedDocument input, expectedFiles input⟩
      simp [Hooks.render, noIssues]
  · intro issues rejected
    have issuesEq := rejected_issues_eq input issues rejected
    refine ⟨issuesEq, ?_, ?_⟩
    · rw [issuesEq]
      exact failedIssues_nodup input normalized
    · intro issue
      rw [issuesEq]
      exact failedIssuePairs_mem_iff input issue

theorem H6_enumeration_invariant : H6_enumeration_invariant Hooks.model := by
  intro left right leftNormalized _rightNormalized equivalent
  rcases equivalent with ⟨hostEq, hooksPerm⟩
  have canonicalEq : canonicalHooks left.hooks = canonicalHooks right.hooks := by
    apply ordered_eq_of_perm (fun entry : String × Hook => [entry.1]) hooksPerm
    intro a aMember b bMember keyEq
    have leftNamesNodup := leftNormalized.1
    have leftDistinct : left.hooks.Pairwise (fun first second => first.1 ≠ second.1) :=
      List.pairwise_map.mp leftNamesNodup
    have bLeft : b ∈ left.hooks := hooksPerm.symm.subset bMember
    exact key_injective_on Prod.fst leftDistinct a aMember b bLeft
      (List.singleton_inj.mp keyEq)
  have indexedEq : indexedHooks left = indexedHooks right := by
    simp [indexedHooks, canonicalEq]
  have failuresEq : failedIssues left = failedIssues right := by
    simp [failedIssues, indexedEq]
  have eventRowsEq : eventRows left = eventRows right := by
    simp [eventRows, forEvent, indexedEq, hostEq]
  have emptyIff : left.hooks = [] ↔ right.hooks = [] := by
    constructor
    · intro leftEmpty
      have rightPermNil : right.hooks.Perm [] := by
        simpa [leftEmpty] using hooksPerm.symm
      exact List.perm_nil.mp rightPermNil
    · intro rightEmpty
      have leftPermNil : left.hooks.Perm [] := by
        simpa [rightEmpty] using hooksPerm
      exact List.perm_nil.mp leftPermNil
  have documentEq : expectedDocument left = expectedDocument right := by
    by_cases leftEmpty : left.hooks = []
    · have rightEmpty := emptyIff.mp leftEmpty
      simp [expectedDocument, leftEmpty, rightEmpty]
    · have rightNonempty : right.hooks ≠ [] := by
        intro rightEmpty
        exact leftEmpty (emptyIff.mpr rightEmpty)
      simp [expectedDocument, eventRowsEq, leftEmpty, rightNonempty]
  have filesEq : expectedFiles left = expectedFiles right := by
    simp [expectedFiles, indexedEq]
  change Hooks.render left = Hooks.render right
  unfold Hooks.render
  rw [failuresEq]
  cases failure : failedIssues right with
  | nil => simp [documentEq, filesEq]
  | cons issue rest => rfl

theorem H7_empty_preserved : H7_empty_preserved Hooks.model := by
  intro host
  change Hooks.render ⟨host, []⟩ = .rendered ⟨none, []⟩
  simp [Hooks.render, failedIssues, expectedDocument, expectedFiles, indexedHooks,
    canonicalHooks, ordered, Generated.enumerateFrom]

private theorem no_environment_words_of_no_captures (plan : Plan)
    (capturesEmpty : (Launcher.model.compile plan).captures = []) :
    ∀ source, Word.environment source ∉ Launcher.words plan := by
  intro source wordMember
  have referenceMember : source ∈ (Launcher.words plan).flatMap Launcher.references :=
    List.mem_flatMap.mpr ⟨.environment source, wordMember, by simp [Launcher.references]⟩
  obtain ⟨capture, captureMember, _⟩ :=
    (Launcher.Proofs.L3_capture_coverage_distinct plan).1 source |>.mp referenceMember
  simp [capturesEmpty] at captureMember

private theorem snapshot_mapM_ambient_independent (names : List EnvironmentName)
    (words : List Word) (root : String)
    (left right : EnvironmentName → Option String)
    (noEnvironment : ∀ source, Word.environment source ∉ words) :
    (words.map (Launcher.snapshotWord names)).mapM
        (Launcher.SnapshotWord.resolve Launcher.model root left) =
      (words.map (Launcher.snapshotWord names)).mapM
        (Launcher.SnapshotWord.resolve Launcher.model root right) := by
  induction words with
  | nil => rfl
  | cons word tail inductionHypothesis =>
      have tailNoEnvironment : ∀ source, Word.environment source ∉ tail := by
        intro source member
        exact noEnvironment source (List.mem_cons_of_mem _ member)
      cases word with
      | literal value =>
          simp [Launcher.snapshotWord, Launcher.SnapshotWord.resolve,
            inductionHypothesis tailNoEnvironment]
      | root =>
          simp [Launcher.snapshotWord, Launcher.SnapshotWord.resolve,
            inductionHypothesis tailNoEnvironment]
      | file path =>
          simp [Launcher.snapshotWord, Launcher.SnapshotWord.resolve,
            inductionHypothesis tailNoEnvironment]
      | environment source =>
          exact False.elim (noEnvironment source (by simp))

private theorem execute_ambient_independent_when_capture_free (plan : Plan) (root : String)
    (ambient : EnvironmentName → Option String)
    (capturesEmpty : (Launcher.model.compile plan).captures = []) :
    Launcher.execute Launcher.model (Launcher.model.compile plan) root ambient =
      Launcher.execute Launcher.model (Launcher.model.compile plan) root
        (fun source => some ((ambient source).getD "") ) := by
  have noEnvironment := no_environment_words_of_no_captures plan capturesEmpty
  have snapshotEq :
      (Launcher.model.compile plan).snapshot.mapM
          (Launcher.SnapshotWord.resolve Launcher.model root ambient) =
        (Launcher.model.compile plan).snapshot.mapM
          (Launcher.SnapshotWord.resolve Launcher.model root
            (fun source => some ((ambient source).getD ""))) := by
    change ((Launcher.words plan).map
        (Launcher.snapshotWord (Launcher.requestedNames plan))).mapM
          (Launcher.SnapshotWord.resolve Launcher.model root ambient) =
      ((Launcher.words plan).map
        (Launcher.snapshotWord (Launcher.requestedNames plan))).mapM
          (Launcher.SnapshotWord.resolve Launcher.model root
            (fun source => some ((ambient source).getD "")))
    exact snapshot_mapM_ambient_independent (Launcher.requestedNames plan)
      (Launcher.words plan) root ambient (fun source => some ((ambient source).getD ""))
      noEnvironment
  simp [Launcher.execute, capturesEmpty, snapshotEq]

theorem H8_process_preserved : H8_process_preserved Hooks.model := by
  intro input output _normalized rendered name hook hookMember
  have components := rendered_output_components input output rendered
  have noReferences := (failedIssues_nil_iff_no_references input).mp components.1
  have capturesEmpty : (Launcher.model.compile hook.plan).captures = [] := by
    cases capturesEmpty : (Launcher.model.compile hook.plan).captures with
    | nil => rfl
    | cons capture rest =>
        have captureMember : capture ∈ (Launcher.model.compile hook.plan).captures := by
          simp [capturesEmpty]
        have referencesMember :=
          (Launcher.Proofs.L3_capture_coverage_distinct hook.plan).1 capture.source |>.mpr
            ⟨capture, captureMember, rfl⟩
        have wordMember := environment_word_of_reference_member
          (Launcher.words hook.plan) capture.source referencesMember
        exact False.elim (noReferences name hook hookMember capture.source wordMember)
  refine ⟨capturesEmpty, ?_⟩
  intro root ambient
  rw [execute_ambient_independent_when_capture_free hook.plan root ambient capturesEmpty]
  exact Launcher.Proofs.L4_complete_process_preserved hook.plan root
    (fun source => (ambient source).getD "")

end PluginSdk.Compiler.Hooks.Proofs
