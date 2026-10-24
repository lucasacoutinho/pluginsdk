import PluginSdk.Compiler.Hooks.Portable.Layout
import PluginSdk.Compiler.Process.Portable.Properties

namespace PluginSdk.Compiler.Hooks.Portable

open Lean

def Representable (input : Input) : Prop :=
  ∀ name hook, (name, hook) ∈ input.hooks →
    Process.Portable.Representable (validationInput input.host hook) ∧
    Process.Launcher.sourceNames hook.plan = []

def RequiredReason (host : Process.Host) (hook : Hooks.Hook) (reason : Process.Portable.Issue) : Prop :=
  Process.Portable.RequiredIssue (validationInput host hook) reason ∨
    ∃ source, reason = .environmentReferenceUnsupported source ∧ source ∈ Process.Launcher.sourceNames hook.plan

def RequiredIssue (input : Input) (issue : Issue) : Prop :=
  ∃ hook, (issue.hook, hook) ∈ input.hooks ∧ RequiredReason input.host hook issue.reason

def PH1_exact_admission (model : Interface) : Prop :=
  ∀ input, (∃ output, model.render input = .rendered output) ↔ Representable input

def PH2_document_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.document = document input ∧
    (output.document.isSome = true ↔ input.hooks ≠ []) ∧
    (∀ value, output.document = some value →
      ObjectKeys value.value ["hooks"] ∧
      ∃ groups, Field value.value "hooks" groups ∧
        ObjectKeys groups ((eventRows input).map Prod.fst) ∧
        ∀ event,
          (Hooks.forEvent input event ≠ [] ↔ ∃ value, Field groups event.name value) ∧
          (Hooks.forEvent input event ≠ [] →
            Field groups event.name (.arr ((Hooks.forEvent input event).toArray.map
              fun entry => (group input.host entry).value)))) ∧
    ∀ entry ∈ entries input,
      ObjectKeys (group input.host entry).value ["hooks"] ∧
      Field (group input.host entry).value "hooks" (.arr #[(handler input.host entry).value]) ∧
      ObjectKeys (handler input.host entry).value
        (["type", "command"] ++ (match input.host with | .claudeCode => ["args"] | .codex => []) ++
          ["timeout", "async"] ++ (match input.host with | .claudeCode => [] | .codex => ["additionalContextLimit"])) ∧
      Field (handler input.host entry).value "type" (.str "command") ∧
      Field (handler input.host entry).value "timeout" (toJson entry.hook.timeout.value) ∧
      Field (handler input.host entry).value "async" (.bool false) ∧
      (match input.host with
      | .claudeCode =>
        Field (handler input.host entry).value "command" (.str "node") ∧
        Field (handler input.host entry).value "args" (.arr #[
          .str "${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs", .str "${CLAUDE_PLUGIN_ROOT}",
          .str (dataPath entry.ordinal).value])
      | .codex =>
        Field (handler input.host entry).value "command" (.str (Binding.codexBootstrap ++ (dataPath entry.ordinal).value)) ∧
        Field (handler input.host entry).value "additionalContextLimit" (toJson (0 : Nat)))

def PH3_files_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.files = files input ∧
    output.files.length = if input.hooks = [] then 0 else 1 + 2 * input.hooks.length

def PH4_paths_safe (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    ((output.files.map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right)) ∧
    ∀ file ∈ output.files, Contained file.path.value ∧ '$' ∉ file.path.value.toList

def PH5_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, Hooks.Normalized left → Hooks.Normalized right → Hooks.EnumerationEquivalent left right →
    model.render left = model.render right

def PH6_diagnostics (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList) ∧
  ∀ input issues, model.render input = .rejected issues →
    issues.toList = requiredIssues input ∧
    issues.toList.Pairwise (fun left right => KeyBefore (IssueKey left) (IssueKey right))

def PH7_empty_preserved (model : Interface) : Prop :=
  ∀ host, model.render ⟨host, []⟩ = .rendered ⟨none, []⟩

def PH8_process_preserved (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    ∀ name hook, (name, hook) ∈ input.hooks →
      (Process.Portable.Captures.compile hook.plan).captures = [] ∧
      ∀ root ambient,
        Process.Launcher.execute (Process.Portable.execution Process.Portable.model)
          (Process.Portable.Captures.compile hook.plan) root (fun source => some (ambient source)) =
            some (Process.Launcher.expected hook.plan root ambient)

end PluginSdk.Compiler.Hooks.Portable
