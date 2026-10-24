import PluginSdk.Compiler.Generated
import PluginSdk.Compiler.Process.Types

namespace PluginSdk.Compiler.Hooks

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

def Normalized (input : Input) : Prop :=
  (input.hooks.map Prod.fst).Nodup ∧ ∀ name hook, (name, hook) ∈ input.hooks → name ≠ ""

def canonicalHooks (hooks : List (String × Hook)) : List (String × Hook) :=
  ordered (fun hook => [hook.1]) hooks

def indexedHooks (input : Input) : List IndexedHook :=
  (Generated.enumerateFrom 0 (canonicalHooks input.hooks)).map fun (ordinal, (name, hook)) =>
    ⟨ordinal, name, hook⟩

abbrev launcherPath := Generated.launcherPath .hooks

def forEvent (input : Input) (event : Event) : List IndexedHook :=
  (indexedHooks input).filter fun entry => entry.hook.event == event

def EnumerationEquivalent (left right : Input) : Prop :=
  left.host = right.host ∧ left.hooks.Perm right.hooks

end PluginSdk.Compiler.Hooks
