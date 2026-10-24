import PluginSdk.Compiler.Json
import PluginSdk.Compiler.Process.Launcher
import PluginSdk.Compiler.Mcp.Paths
import PluginSdk.Compiler.Mcp.CwdLauncher

namespace PluginSdk.Compiler.Mcp

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process
open PluginSdk.Compiler.Process.Launcher

structure Input where
  format : Format
  remote : List (String × RemoteMcp)
  locals : List (String × Plan)

structure GeneratedFile where
  path : PackagePath
  content : String
  executable : Bool
  deriving DecidableEq

structure Output where
  document : Option JsonObject
  files : List GeneratedFile

inductive Issue where
  | unsupportedLauncher (server : String)
  deriving DecidableEq, Repr

inductive Result where
  | rendered (output : Output)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  render : Input → Result

structure IndexedLocal where
  ordinal : Nat
  name : String
  plan : Plan
  native : Option Native
  deriving DecidableEq

def Normalized (input : Input) : Prop :=
  (input.remote.map Prod.fst ++ input.locals.map Prod.fst).Nodup ∧
  (∀ name source, (name, source) ∈ input.remote →
    name ≠ "" ∧ (source.headers.map Prod.fst).Nodup) ∧
  ∀ name plan, (name, plan) ∈ input.locals → name ≠ ""

def nativeRows (format : Format) (native : Native) : List (String × Json) :=
  (if format = .codexPluginV1 then [] else [("type", .str "stdio")]) ++
  [("command", .str native.command),
    ("args", .arr (native.args.toArray.map Json.str)),
    ("env", (object (native.environment.map fun (name, value) => (name, .str value))).value)] ++
    native.cwd.toList.map fun cwd => ("cwd", .str cwd)

def nativeObject (format : Format) (native : Native) : JsonObject := object (nativeRows format native)

def nativeKeys (format : Format) (native : Native) : List String :=
  (if format = .codexPluginV1 then [] else ["type"]) ++
    ["command", "args", "env"] ++ native.cwd.toList.map (fun _ => "cwd")

def nativeFor (input : Input) (ordinal : Nat) (plan : Plan) : Option Native :=
  if input.format = .codexPluginV1 then
    CwdLauncher.native (launcherPath ordinal) (Launcher.model.compile plan)
  else Launcher.model.native (hostFor input.format) (launcherPath ordinal) (Launcher.model.compile plan)

def indexedEntries (input : Input) : List IndexedLocal :=
  (indexedLocals input.locals).map fun (ordinal, (name, plan)) =>
    ⟨ordinal, name, plan, nativeFor input ordinal plan⟩

def failedNames (input : Input) : List String :=
  (indexedEntries input).filterMap fun entry =>
    if entry.native.isNone then some entry.name else none

def failedIssues (input : Input) : List Issue :=
  (failedNames input).map Issue.unsupportedLauncher

def expectedGeneratedFile (format : Format) (entry : IndexedLocal) : GeneratedFile :=
  ⟨launcherPath entry.ordinal,
    (if format = .codexPluginV1 then CwdLauncher.serialize else Launcher.serialize)
      (Launcher.compile entry.plan), true⟩

def expectedGeneratedFiles (input : Input) : List GeneratedFile :=
  (indexedEntries input).map (expectedGeneratedFile input.format)

def remoteEntries (input : Input) : List (String × Json) :=
  input.remote.map fun (name, source) =>
    (name, (object (serverRows input.format source)).value)

def localEntries (input : Input) : List (String × Json) :=
  (indexedEntries input).filterMap fun entry => entry.native.map fun native =>
    (entry.name, (nativeObject input.format native).value)

def serverEntries (input : Input) : List (String × Json) :=
  remoteEntries input ++ localEntries input

def documentRows (input : Input) : List (String × Json) :=
  schemaRows input.format "mcp" ++
    [("mcpServers", (object (serverEntries input)).value)]

def expectedDocument (input : Input) : Option JsonObject :=
  if input.remote = [] ∧ input.locals = [] then none
  else some (object (documentRows input))

def legacyInput (input : Input) : RenderInput :=
  ⟨input.format, ⟨"", "", ""⟩, [], input.remote⟩

def legacyDocument (input : Input) : Option JsonObject :=
  match mcp (legacyInput input) with
  | .copy _ _ => none
  | .json _ value => some value

def InOrder {α : Type} (related : α → α → Prop) : List α → List α → Prop
  | [], [] => True
  | left :: leftTail, right :: rightTail => related left right ∧ InOrder related leftTail rightTail
  | _, _ => False

def RemoteEquivalent (left right : String × RemoteMcp) : Prop :=
  left.1 = right.1 ∧ left.2.url = right.2.url ∧ left.2.headers.Perm right.2.headers

def EnumerationEquivalent (left right : Input) : Prop :=
  left.format = right.format ∧
  (∃ reordered, left.remote.Perm reordered ∧ InOrder RemoteEquivalent reordered right.remote) ∧
  left.locals.Perm right.locals

def K1_servers_exact (model : Interface) : Prop :=
  ∀ input output, Normalized input → model.render input = .rendered output →
    ((output.document.isSome = true ↔ input.remote ≠ [] ∨ input.locals ≠ []) ∧
      match output.document with
      | none => True
      | some document =>
        ObjectKeys document.value (match input.format with
          | .agentPluginsV1 => ["$schema", "mcpServers"]
          | .claudeCodeV1 => ["mcpServers"]
          | .codexPluginV1 => ["mcpServers"]) ∧
        SchemaField input.format document.value "mcp" ∧
        ∃ servers, Field document.value "mcpServers" servers ∧
          ObjectKeys servers (input.remote.map Prod.fst ++ input.locals.map Prod.fst) ∧
          (∀ name source, (name, source) ∈ input.remote →
            Field servers name (object (serverRows input.format source)).value) ∧
          ∀ entry, entry ∈ indexedEntries input →
            ∀ native, entry.native = some native →
              Field servers entry.name (nativeObject input.format native).value ∧
              ObjectKeys (nativeObject input.format native).value (nativeKeys input.format native))

def K2_generated_files_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.files = expectedGeneratedFiles input

def K3_launcher_paths_safe (model : Interface) : Prop :=
  (∀ ordinal, Contained (launcherPath ordinal).value ∧
    '$' ∉ (launcherPath ordinal).value.toList) ∧
  (∀ left right, (launcherPath left).value = (launcherPath right).value → left = right) ∧
  ∀ input output, model.render input = .rendered output →
    (output.files.map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right)

def K4_accepts_exactly_native (model : Interface) : Prop :=
  ∀ input, Normalized input →
    ((∃ output, model.render input = .rendered output) ↔
      ∀ entry, entry ∈ indexedEntries input → ∃ native, entry.native = some native) ∧
    (∀ entry, entry ∈ indexedEntries input →
      ((∃ native, entry.native = some native) ↔
        hostFor input.format = .claudeCode ∨ (Launcher.model.compile entry.plan).captures = [])) ∧
    (∀ issues, model.render input = .rejected issues → issues.toList = failedIssues input) ∧
    (failedNames input).Nodup ∧ (failedNames input).Pairwise Utf8Before

def K5_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, Normalized left → Normalized right → EnumerationEquivalent left right →
    model.render left = model.render right

def K6_remote_document_preserved (model : Interface) : Prop :=
  ∀ input output, Normalized input → input.locals = [] →
    model.render input = .rendered output →
      output.files = [] ∧
      (output.document.isSome = true ↔ input.remote ≠ []) ∧
      (input.remote ≠ [] → output.document = legacyDocument input)

def K7_cwd_root_preserved (model : Interface) : Prop :=
  (∀ root, CwdLauncher.readRoot (root ++ "\n.") = some root) ∧
  ∀ input output, input.format = .codexPluginV1 → model.render input = .rendered output →
    ∀ entry, entry ∈ indexedEntries input →
      entry.native = some ⟨"/bin/sh", [(launcherPath entry.ordinal).value], [], some "."⟩ ∧
      ⟨launcherPath entry.ordinal, CwdLauncher.serialize (Launcher.model.compile entry.plan), true⟩ ∈
        output.files ∧
      ∀ root ambient,
        (CwdLauncher.readRoot (root ++ "\n.")).bind (fun recovered =>
          Launcher.execute Launcher.model (Launcher.model.compile entry.plan) recovered
            (fun source => some (ambient source))) =
          some (Launcher.expected entry.plan root ambient)

end PluginSdk.Compiler.Mcp
