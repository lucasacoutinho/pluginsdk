import PluginSdk.Compiler.Hooks.Types

namespace PluginSdk.Compiler.Hooks

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process

def H1_document_exact (model : Interface) : Prop :=
  ∀ input output, Normalized input → model.render input = .rendered output →
    output.document = expectedDocument input ∧
    (output.document.isSome = true ↔ input.hooks ≠ []) ∧
    ∀ document, output.document = some document →
      ObjectKeys document.value ["hooks"] ∧
      ∃ groups, Field document.value "hooks" groups ∧
        ObjectKeys groups ((eventRows input).map Prod.fst) ∧
        ∀ event, (forEvent input event ≠ [] ↔ ∃ value, Field groups event.name value) ∧
          (forEvent input event ≠ [] →
            Field groups event.name
              (.arr ((forEvent input event).toArray.map fun entry => (group input.host entry).value)))

def H2_files_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.files = expectedFiles input ∧ output.files.length = input.hooks.length

def H3_handlers_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    ∀ entry, entry ∈ indexedHooks input →
      ObjectKeys (group input.host entry).value ["hooks"] ∧
      Field (group input.host entry).value "hooks" (.arr #[(handler input.host entry).value]) ∧
      ObjectKeys (handler input.host entry).value
        (["type", "command", "timeout", "async"] ++
          match input.host with | .claudeCode => [] | .codex => ["additionalContextLimit"]) ∧
      Field (handler input.host entry).value "type" (.str "command") ∧
      Field (handler input.host entry).value "command" (.str (nativeCommand input.host entry.ordinal)) ∧
      Field (handler input.host entry).value "timeout" (toJson entry.hook.timeout.value) ∧
      Field (handler input.host entry).value "async" (.bool false) ∧
      (input.host = .codex → Field (handler input.host entry).value "additionalContextLimit" (toJson (0 : Nat))) ∧
      '{' ∉ (nativeCommand input.host entry.ordinal).toList

def H4_paths_safe (model : Interface) : Prop :=
  (∀ ordinal, Contained (launcherPath ordinal).value ∧
    '$' ∉ (launcherPath ordinal).value.toList) ∧
  (∀ left right, (launcherPath left).value = (launcherPath right).value → left = right) ∧
  ∀ input output, model.render input = .rendered output →
    (output.files.map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right)

def H5_acceptance_exact (model : Interface) : Prop :=
  ∀ input, Normalized input →
    ((∃ output, model.render input = .rendered output) ↔
      ∀ name hook, (name, hook) ∈ input.hooks → NoReferences hook) ∧
    ∀ issues, model.render input = .rejected issues →
      issues.toList = failedIssues input ∧ issues.toList.Nodup ∧
      ∀ issue, issue ∈ issues.toList ↔
        ∃ name hook source, (name, hook) ∈ input.hooks ∧
          .environment source ∈ Launcher.words hook.plan ∧
          issue = .environmentReferenceUnsupported name source

def H6_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, Normalized left → Normalized right → EnumerationEquivalent left right →
    model.render left = model.render right

def H7_empty_preserved (model : Interface) : Prop :=
  ∀ host, model.render ⟨host, []⟩ = .rendered ⟨none, []⟩

def H8_process_preserved (model : Interface) : Prop :=
  ∀ input output, Normalized input → model.render input = .rendered output →
    ∀ name hook, (name, hook) ∈ input.hooks →
      (Launcher.model.compile hook.plan).captures = [] ∧
      ∀ root ambient,
        Launcher.execute Launcher.model (Launcher.model.compile hook.plan) root ambient =
          some (Launcher.expected hook.plan root (fun source => (ambient source).getD ""))

end PluginSdk.Compiler.Hooks
