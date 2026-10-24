import PluginSdk.Compiler.Process.Portable.Properties
import PluginSdk.Compiler.Process.Portable.Captures

namespace PluginSdk.Compiler.Process.Portable

def rawIssues (input : Input) : List Issue :=
  (destinationKeys input.plan).filterMap (fun name =>
    if 1 < (destinationKeys input.plan).count name then some (.environmentCollision name) else none) ++
  (match input.host with
    | .claudeCode => []
    | .codex => (Launcher.sourceNames input.plan).map Issue.environmentReferenceUnsupported)

def issues (input : Input) : List Issue := ordered IssueKey (unique (rawIssues input))

def native (input : Input) (script : Launcher.Script) : Launcher.Native :=
  ⟨"node", (match input.host with
    | .claudeCode => [Launcher.rootVariable input.host ++ "/" ++ runtimePath,
        Launcher.rootVariable input.host, input.path.value]
    | .codex => [runtimePath, ".", input.path.value]),
    Launcher.nativeBindings script, (match input.host with
      | .claudeCode => none
      | .codex => some ".")⟩

def build (input : Input) : Result :=
  match issues input with
  | [] =>
      let script := Captures.compile input.plan
      .rendered ⟨script, native input script, Launcher.serialize script⟩
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨build, Captures.compile⟩

end PluginSdk.Compiler.Process.Portable
