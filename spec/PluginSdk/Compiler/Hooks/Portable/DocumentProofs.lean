import PluginSdk.Compiler.Hooks.Portable.Facts

namespace PluginSdk.Compiler.Hooks.Portable.Proofs

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Hooks
open PluginSdk.Compiler.Process

private theorem document_present_iff (input : Input) :
    (document input).isSome = true ↔ input.hooks ≠ [] := by
  unfold document
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

private theorem document_fields (input : Input) (value : JsonObject)
    (documentEq : document input = some value) :
    ObjectKeys value.value ["hooks"] ∧
      ∃ groups, Field value.value "hooks" groups ∧
        ObjectKeys groups ((eventRows input).map Prod.fst) ∧
        ∀ event,
          (forEvent input event ≠ [] ↔ ∃ fieldValue, Field groups event.name fieldValue) ∧
          (forEvent input event ≠ [] →
            Field groups event.name (.arr ((forEvent input event).toArray.map
              fun entry => (group input.host entry).value))) := by
  by_cases empty : input.hooks = []
  · simp [document, empty] at documentEq
  · have valueEq : value = object [("hooks", (object (eventRows input)).value)] := by
      simpa [document, empty] using documentEq.symm
    subst value
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
          · rintro ⟨fieldValue, field⟩
            exact (eventRows_key_iff input event).mp
              ((keys.2 event.name).mp ⟨fieldValue, field⟩)
        · intro nonempty
          have member := eventRows_value input event nonempty
          exact object_field (eventRows_keys_nodup input) member

private theorem handler_rows_nodup (host : Host) (entry : IndexedHook) :
    (handlerRows host entry).map Prod.fst |>.Nodup := by
  cases host <;>
    simp [handlerRows, nativeRows, Binding.model, Binding.bind] <;>
    decide

private theorem handler_field (host : Host) (entry : IndexedHook)
    (key : String) (value : Json) (member : (key, value) ∈ handlerRows host entry) :
    Field (handler host entry).value key value := by
  exact object_field (handler_rows_nodup host entry) member

private theorem handler_keys (host : Host) (entry : IndexedHook) :
    ObjectKeys (handler host entry).value
      (["type", "command"] ++
        (match host with | .claudeCode => ["args"] | .codex => []) ++
        ["timeout", "async"] ++
        (match host with | .claudeCode => [] | .codex => ["additionalContextLimit"])) := by
  cases host with
  | claudeCode =>
      simpa [handler, handlerRows, nativeRows, Binding.model, Binding.bind] using
        object_keys (handlerRows .claudeCode entry)
  | codex =>
      simpa [handler, handlerRows, nativeRows, Binding.model, Binding.bind] using
        object_keys (handlerRows .codex entry)

private theorem group_fields (input : Input) (entry : IndexedHook) :
    ObjectKeys (group input.host entry).value ["hooks"] ∧
      Field (group input.host entry).value "hooks"
        (.arr #[(handler input.host entry).value]) := by
  refine ⟨?_, ?_⟩
  · simpa [group] using object_keys [("hooks", .arr #[(handler input.host entry).value])]
  · apply object_field (by simp)
    simp

private theorem entry_fields (input : Input) (entry : IndexedHook) :
    ObjectKeys (group input.host entry).value ["hooks"] ∧
    Field (group input.host entry).value "hooks"
      (.arr #[(handler input.host entry).value]) ∧
    ObjectKeys (handler input.host entry).value
      (["type", "command"] ++
        (match input.host with | .claudeCode => ["args"] | .codex => []) ++
        ["timeout", "async"] ++
        (match input.host with | .claudeCode => [] | .codex => ["additionalContextLimit"])) ∧
    Field (handler input.host entry).value "type" (.str "command") ∧
    Field (handler input.host entry).value "timeout" (toJson entry.hook.timeout.value) ∧
    Field (handler input.host entry).value "async" (.bool false) ∧
    (match input.host with
    | .claudeCode =>
      Field (handler input.host entry).value "command" (.str "node") ∧
      Field (handler input.host entry).value "args" (.arr #[
        .str "${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs",
        .str "${CLAUDE_PLUGIN_ROOT}",
        .str (dataPath entry.ordinal).value])
    | .codex =>
      Field (handler input.host entry).value "command"
        (.str (Binding.codexBootstrap ++ (dataPath entry.ordinal).value)) ∧
      Field (handler input.host entry).value "additionalContextLimit" (toJson (0 : Nat))) := by
  have groups := group_fields input entry
  have typeField : Field (handler input.host entry).value "type" (.str "command") :=
    handler_field input.host entry "type" (.str "command") (by simp [handlerRows])
  have timeoutField : Field (handler input.host entry).value "timeout"
      (toJson entry.hook.timeout.value) :=
    handler_field input.host entry "timeout" (toJson entry.hook.timeout.value)
      (by cases input.host <;> simp [handlerRows, nativeRows, Binding.model, Binding.bind])
  have asyncField : Field (handler input.host entry).value "async" (.bool false) :=
    handler_field input.host entry "async" (.bool false)
      (by cases input.host <;> simp [handlerRows, nativeRows, Binding.model, Binding.bind])
  refine ⟨groups.1, groups.2, handler_keys input.host entry,
    typeField, timeoutField, asyncField, ?_⟩
  cases hostEq : input.host with
  | claudeCode =>
      constructor
      · exact handler_field .claudeCode entry "command" (.str "node")
          (by simp [handlerRows, nativeRows, Binding.model, Binding.bind])
      · exact handler_field .claudeCode entry "args" (.arr #[
            .str "${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs",
            .str "${CLAUDE_PLUGIN_ROOT}",
            .str (dataPath entry.ordinal).value])
          (by simp [handlerRows, nativeRows, Binding.model, Binding.bind])
  | codex =>
      constructor
      · exact handler_field .codex entry "command"
          (.str (Binding.codexBootstrap ++ (dataPath entry.ordinal).value))
          (by simp [handlerRows, nativeRows, Binding.model, Binding.bind])
      · exact handler_field .codex entry "additionalContextLimit" (toJson (0 : Nat))
          (by simp [handlerRows, nativeRows, Binding.model, Binding.bind])

theorem PH2_document_exact : PH2_document_exact model := by
  intro input output rendered
  have components := Facts.rendered_components input output rendered
  rw [components.2]
  refine ⟨rfl, document_present_iff input, ?_, ?_⟩
  · intro value documentEq
    exact document_fields input value documentEq
  · intro entry entryMember
    exact entry_fields input entry

end PluginSdk.Compiler.Hooks.Portable.Proofs
