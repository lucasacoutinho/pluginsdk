import PluginSdk.Compiler.Json
import PluginSdk.Compiler.Process.LauncherTypes

namespace PluginSdk.Compiler.Mcp

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process
open PluginSdk.Compiler.Process.Launcher

structure Input where
  format : Format
  remote : List (String × RemoteMcp)
  locals : List (String × Plan)

def Normalized (input : Input) : Prop :=
  (input.remote.map Prod.fst ++ input.locals.map Prod.fst).Nodup ∧
  (∀ name source, (name, source) ∈ input.remote →
    name ≠ "" ∧ (source.headers.map Prod.fst).Nodup) ∧
  ∀ name plan, (name, plan) ∈ input.locals → name ≠ ""

def nativeRows (format : Format) (native : Native) : List (String × Json) :=
  (if format = .codex then [] else [("type", .str "stdio")]) ++
    [("command", .str native.command),
      ("args", .arr (native.args.toArray.map Json.str)),
      ("env", (object (native.environment.map fun (name, value) => (name, .str value))).value)] ++
    native.cwd.toList.map fun cwd => ("cwd", .str cwd)

def nativeObject (format : Format) (native : Native) : JsonObject := object (nativeRows format native)

def nativeKeys (format : Format) (native : Native) : List String :=
  (if format = .codex then [] else ["type"]) ++
    ["command", "args", "env"] ++ native.cwd.toList.map (fun _ => "cwd")

def remoteEntries (input : Input) : List (String × Json) :=
  input.remote.map fun (name, source) =>
    (name, (object (serverRows input.format source)).value)

def InOrder {α : Type} (related : α → α → Prop) : List α → List α → Prop
  | [], [] => True
  | left :: rest, right :: remaining => related left right ∧ InOrder related rest remaining
  | _, _ => False

def RemoteEquivalent (left right : String × RemoteMcp) : Prop :=
  left.1 = right.1 ∧ left.2.url = right.2.url ∧ left.2.headers.Perm right.2.headers

def EnumerationEquivalent (left right : Input) : Prop :=
  left.format = right.format ∧
  (∃ reordered, left.remote.Perm reordered ∧ InOrder RemoteEquivalent reordered right.remote) ∧
  left.locals.Perm right.locals

end PluginSdk.Compiler.Mcp
