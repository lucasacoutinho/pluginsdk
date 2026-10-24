import PluginSdk.Compiler.Json
import PluginSdk.Compiler.Hooks.Portable.Types
import PluginSdk.Compiler.Hooks.Portable.Paths
import PluginSdk.Compiler.Hooks.Binding.Model
import PluginSdk.Compiler.Process.Portable.Model

namespace PluginSdk.Compiler.Hooks.Portable

open Lean

abbrev entries := Hooks.indexedHooks

def validationInput (host : Process.Host) (hook : Hooks.Hook) : Process.Portable.Input :=
  ⟨host, dataPath 0, hook.plan⟩

def reasons (host : Process.Host) (hook : Hooks.Hook) : List Process.Portable.Issue :=
  Process.Portable.issues (validationInput host hook) ++
    (Process.Launcher.sourceNames hook.plan).map Process.Portable.Issue.environmentReferenceUnsupported

def rawIssues (input : Input) : List Issue :=
  input.hooks.flatMap fun (name, hook) => (reasons input.host hook).map fun reason => ⟨name, reason⟩

def IssueKey (issue : Issue) : Key := [issue.hook] ++ Process.Portable.IssueKey issue.reason

def requiredIssues (input : Input) : List Issue := ordered IssueKey (unique (rawIssues input))

def nativeRows : Binding.Native → List (String × Json)
  | .direct command args => [("command", .str command), ("args", .arr (args.map Json.str).toArray)]
  | .shell command => [("command", .str command)]

def handlerRows (host : Process.Host) (entry : Hooks.IndexedHook) : List (String × Json) :=
  [("type", .str "command")] ++
    nativeRows (Binding.model.bind ⟨host, entry.ordinal⟩).native ++
    [("timeout", toJson entry.hook.timeout.value), ("async", .bool false)] ++
    match host with
    | .claudeCode => []
    | .codex => [("additionalContextLimit", toJson (0 : Nat))]

def handler (host : Process.Host) (entry : Hooks.IndexedHook) : JsonObject := object (handlerRows host entry)

def group (host : Process.Host) (entry : Hooks.IndexedHook) : JsonObject :=
  object [("hooks", .arr #[(handler host entry).value])]

def eventRows (input : Input) : List (String × Json) :=
  Hooks.events.filterMap fun event =>
    let items := Hooks.forEvent input event
    if items = [] then none
    else some (event.name, .arr (items.toArray.map fun entry => (group input.host entry).value))

def document (input : Input) : Option JsonObject :=
  if input.hooks = [] then none
  else some (object [("hooks", (object (eventRows input)).value)])

def processFiles (entry : Hooks.IndexedHook) : List FilePlan :=
  let script := Process.Portable.Captures.compile entry.hook.plan
  [.process (dataPath entry.ordinal) ⟨shellPath entry.ordinal, script⟩,
   .posix (shellPath entry.ordinal) (Process.Launcher.serialize script)]

def files (input : Input) : List FilePlan :=
  if input.hooks = [] then []
  else .runtime runtimeFile :: (entries input).flatMap processFiles

end PluginSdk.Compiler.Hooks.Portable
