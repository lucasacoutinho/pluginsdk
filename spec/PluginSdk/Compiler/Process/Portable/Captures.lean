import PluginSdk.Compiler.Process.Launcher

namespace PluginSdk.Compiler.Process.Portable.Captures

def name (names : List EnvironmentName) (kind : Launcher.Kind) (index : Nat) : String :=
  "PSDK_" ++ String.ofList (List.replicate (Launcher.bound names) '_') ++
    String.singleton (Launcher.marker kind) ++ "_" ++ Nat.repr index

def rename (names sources : List EnvironmentName) (capture : Launcher.Capture) : Launcher.Capture :=
  ⟨capture.source, name names .raw (sources.idxOf capture.source),
    name names .check (sources.idxOf capture.source)⟩

def snapshot (names sources : List EnvironmentName) : Launcher.SnapshotWord → Launcher.SnapshotWord
  | .captured capture => .captured (rename names sources capture)
  | .literal value => .literal value
  | .root => .root
  | .file path => .file path

def compile (plan : Plan) : Launcher.Script :=
  let script := Launcher.compile plan
  let sources := Launcher.sourceNames plan
  { script with
    captures := script.captures.map (rename script.names sources)
    snapshot := script.snapshot.map (snapshot script.names sources) }

def execution : Launcher.Interface := { Launcher.model with compile := compile }

end PluginSdk.Compiler.Process.Portable.Captures
