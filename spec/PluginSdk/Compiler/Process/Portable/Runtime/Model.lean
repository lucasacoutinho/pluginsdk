import PluginSdk.Compiler.Process.Portable.Runtime.Properties

namespace PluginSdk.Compiler.Process.Portable.Runtime

def read (source : EnvironmentName) (raw check : Option String) : Option String :=
  match raw, check with
  | some value, some checked => Launcher.readCapture source value checked
  | _, _ => none

def resolve (root : String) (ambient : EnvironmentName → Option String) : Launcher.SnapshotWord → Option String
  | .literal value => some value
  | .root => some root
  | .file path => some (AtRoot root path)
  | .captured capture => ambient capture.source

def execute (script : Launcher.Script) (root : String)
    (ambient : EnvironmentName → Option String) : Option Launcher.Invocation := do
  if script.captures.any (fun capture => (ambient capture.source).isNone) then none
  else do
    let snapshot ← script.snapshot.mapM (resolve root ambient)
    let parameters := root :: snapshot
    return ⟨← parameters[script.command]?,
      ← script.args.mapM (fun index => parameters[index]?),
      ← script.environment.mapM (fun binding => do
        return (binding.1, ← parameters[binding.2]?)),
      ← parameters[script.cwd]?⟩

def model : Interface := ⟨read, execute⟩

end PluginSdk.Compiler.Process.Portable.Runtime
