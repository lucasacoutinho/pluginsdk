import PluginSdk.Compiler.Process.Portable.Model
import PluginSdk.Compiler.Process.LauncherProofs

namespace PluginSdk.Compiler.Process.Portable

private theorem renamed_snapshot_resolve (names sources : List EnvironmentName)
    (root : String) (ambient : EnvironmentName → Option String)
    (word : Launcher.SnapshotWord) :
    Launcher.SnapshotWord.resolve Captures.execution root ambient
        (Captures.snapshot names sources word) =
      Launcher.SnapshotWord.resolve Launcher.model root ambient word := by
  cases word with
  | literal value => rfl
  | root => rfl
  | file path => rfl
  | captured capture =>
      simp [Captures.execution, Captures.snapshot, Captures.rename,
        Launcher.SnapshotWord.resolve]

theorem execute_renamed (script : Launcher.Script) (names sources : List EnvironmentName)
    (root : String) (ambient : EnvironmentName → Option String) :
    Launcher.execute Captures.execution
      { script with
        captures := script.captures.map (Captures.rename names sources)
        snapshot := script.snapshot.map (Captures.snapshot names sources) }
      root ambient =
    Launcher.execute Launcher.model script root ambient := by
  simp only [Launcher.execute]
  have capturesSame :
      (script.captures.map (Captures.rename names sources)).any (fun capture =>
        (Captures.execution.capture capture.source (Launcher.rawValue ambient capture.source)
          (Launcher.checkValue ambient capture.source)).isNone) =
      script.captures.any (fun capture =>
        (Launcher.model.capture capture.source (Launcher.rawValue ambient capture.source)
          (Launcher.checkValue ambient capture.source)).isNone) := by
    rw [List.any_map]
    simp [Captures.execution, Captures.rename, Function.comp_def]
  have resolveSame :
      Launcher.SnapshotWord.resolve Captures.execution root ambient ∘
          Captures.snapshot names sources =
        Launcher.SnapshotWord.resolve Launcher.model root ambient := by
    funext word
    exact renamed_snapshot_resolve names sources root ambient word
  rw [capturesSame, List.mapM_map, resolveSame]

theorem execute_compile_eq (plan : Plan) (root : String)
    (ambient : EnvironmentName → Option String) :
    Launcher.execute Captures.execution (Captures.compile plan) root ambient =
      Launcher.execute Launcher.model (Launcher.compile plan) root ambient := by
  simpa [Captures.compile] using
    execute_renamed (Launcher.compile plan) (Launcher.compile plan).names
      (Launcher.sourceNames plan) root ambient

theorem complete_process (plan : Plan) (root : String)
    (ambient : EnvironmentName → String) :
    Launcher.execute Captures.execution (Captures.compile plan) root
      (fun name => some (ambient name)) = some (Launcher.expected plan root ambient) := by
  rw [execute_compile_eq]
  exact Launcher.Proofs.L4_complete_process_preserved plan root ambient

theorem missing_source_stops (plan : Plan) (root : String)
    (ambient : EnvironmentName → Option String) (name : EnvironmentName)
    (member : name ∈ (Launcher.words plan).flatMap Launcher.references)
    (missing : ambient name = none) :
    Launcher.execute Captures.execution (Captures.compile plan) root ambient = none := by
  rw [execute_compile_eq]
  exact Launcher.Proofs.L5_missing_source_stops plan root ambient name member missing

end PluginSdk.Compiler.Process.Portable
