import PluginSdk.Compiler.Json
import PluginSdk.Compiler.Generated
import PluginSdk.Compiler.Process.Launcher

namespace PluginSdk.Compiler.Hooks

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process

inductive Event where
  | sessionStart
  | userPromptSubmit
  deriving DecidableEq

def Event.name : Event → String
  | .sessionStart => "SessionStart"
  | .userPromptSubmit => "UserPromptSubmit"

def events : List Event := [.sessionStart, .userPromptSubmit]

structure Timeout where
  value : Nat
  valid : 1 ≤ value ∧ value ≤ 600
  deriving DecidableEq

structure Hook where
  event : Event
  plan : Plan
  timeout : Timeout
  deriving DecidableEq

structure Input where
  host : Host
  hooks : List (String × Hook)

structure IndexedHook where
  ordinal : Nat
  name : String
  hook : Hook
  deriving DecidableEq

structure GeneratedFile where
  path : PackagePath
  content : String
  executable : Bool
  deriving DecidableEq

structure Output where
  document : Option JsonObject
  files : List GeneratedFile

inductive Issue where
  | environmentReferenceUnsupported (hook : String) (name : EnvironmentName)
  deriving DecidableEq

inductive Result where
  | rendered (output : Output)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  render : Input → Result

def Normalized (input : Input) : Prop :=
  (input.hooks.map Prod.fst).Nodup ∧ ∀ name hook, (name, hook) ∈ input.hooks → name ≠ ""

def canonicalHooks (hooks : List (String × Hook)) : List (String × Hook) :=
  ordered (fun hook => [hook.1]) hooks

def indexedHooks (input : Input) : List IndexedHook :=
  (Generated.enumerateFrom 0 (canonicalHooks input.hooks)).map fun (ordinal, (name, hook)) =>
    ⟨ordinal, name, hook⟩

abbrev launcherPath := Generated.launcherPath .hooks

def rootVariable : Host → String
  | .claudeCode => "$CLAUDE_PLUGIN_ROOT"
  | .codex => "$PLUGIN_ROOT"

def nativeCommand (host : Host) (ordinal : Nat) : String :=
  "/bin/sh \"" ++ rootVariable host ++ "/" ++ (launcherPath ordinal).value ++
    "\" \"" ++ rootVariable host ++ "\""

def handlerRows (host : Host) (entry : IndexedHook) : List (String × Json) :=
  [("type", .str "command"), ("command", .str (nativeCommand host entry.ordinal)),
    ("timeout", toJson entry.hook.timeout.value), ("async", .bool false)] ++
    match host with
    | .claudeCode => []
    | .codex => [("additionalContextLimit", toJson (0 : Nat))]

def handler (host : Host) (entry : IndexedHook) : JsonObject := object (handlerRows host entry)

def group (host : Host) (entry : IndexedHook) : JsonObject :=
  object [("hooks", .arr #[(handler host entry).value])]

def forEvent (input : Input) (event : Event) : List IndexedHook :=
  (indexedHooks input).filter fun entry => entry.hook.event == event

def eventRows (input : Input) : List (String × Json) :=
  events.filterMap fun event =>
    let entries := forEvent input event
    if entries = [] then none
    else some (event.name, .arr (entries.toArray.map fun entry => (group input.host entry).value))

def expectedDocument (input : Input) : Option JsonObject :=
  if input.hooks = [] then none
  else some (object [("hooks", (object (eventRows input)).value)])

def expectedFile (entry : IndexedHook) : GeneratedFile :=
  ⟨launcherPath entry.ordinal, Launcher.serialize (Launcher.model.compile entry.hook.plan), true⟩

def expectedFiles (input : Input) : List GeneratedFile := (indexedHooks input).map expectedFile

def failedIssues (input : Input) : List Issue :=
  (indexedHooks input).flatMap fun entry =>
    (Launcher.model.compile entry.hook.plan).captures.map fun capture =>
      .environmentReferenceUnsupported entry.name capture.source

def NoReferences (hook : Hook) : Prop :=
  ∀ name, .environment name ∉ Launcher.words hook.plan

def EnumerationEquivalent (left right : Input) : Prop :=
  left.host = right.host ∧ left.hooks.Perm right.hooks

end PluginSdk.Compiler.Hooks
