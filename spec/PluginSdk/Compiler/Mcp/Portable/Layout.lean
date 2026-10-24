import PluginSdk.Compiler.Mcp.Portable.Types
import PluginSdk.Compiler.Mcp.Portable.Paths
import PluginSdk.Compiler.Process.Portable.Model

namespace PluginSdk.Compiler.Mcp.Portable

structure Entry where
  ordinal : Nat
  name : String
  plan : Process.Plan
  deriving DecidableEq

def entries (input : Input) : List Entry :=
  (Mcp.indexedLocals input.locals).map fun (ordinal, (name, plan)) => ⟨ordinal, name, plan⟩

def launcherInput (input : Input) (entry : Entry) : Process.Portable.Input :=
  ⟨Mcp.hostFor input.format, dataPath entry.ordinal, entry.plan⟩

def requiredIssues (input : Input) : List Issue :=
  (entries input).flatMap fun entry =>
    (Process.Portable.issues (launcherInput input entry)).map fun reason => ⟨entry.name, reason⟩

def localRows (input : Input) : List (String × Lean.Json) :=
  (entries input).map fun entry =>
    let script := Process.Portable.Captures.compile entry.plan
    (entry.name, (Mcp.nativeObject input.format
      (Process.Portable.native (launcherInput input entry) script)).value)

def serverRows (input : Input) : List (String × Lean.Json) :=
  Mcp.remoteEntries input ++ localRows input

def documentRows (input : Input) : List (String × Lean.Json) :=
  [("mcpServers", (object (serverRows input)).value)]

def document (input : Input) : Option JsonObject :=
  if input.remote = [] ∧ input.locals = [] then none
  else some (object (documentRows input))

def processFiles (entry : Entry) : List FilePlan :=
  let script := Process.Portable.Captures.compile entry.plan
  [.process (dataPath entry.ordinal) ⟨shellPath entry.ordinal, script⟩,
   .posix (shellPath entry.ordinal) (Process.Launcher.serialize script)]

def files (input : Input) : List FilePlan :=
  if input.locals = [] then []
  else .runtime runtimeFile :: (entries input).flatMap processFiles

end PluginSdk.Compiler.Mcp.Portable
