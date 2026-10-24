import PluginSdk.Compiler.Process.Portable.Runtime.Model
import PluginSdk.Compiler.Process.Portable.SemanticProofs
import PluginSdk.Compiler.Process.LauncherProofs

namespace PluginSdk.Compiler.Process.Portable.Runtime.Proofs

private theorem capture_guard_eq (script : Launcher.Script)
    (ambient : EnvironmentName → Option String) :
    script.captures.any (fun capture => (ambient capture.source).isNone) =
      script.captures.any (fun capture =>
        (Captures.execution.capture capture.source
          (Launcher.rawValue ambient capture.source)
          (Launcher.checkValue ambient capture.source)).isNone) := by
  have predicates :
      (fun capture : Launcher.Capture => (ambient capture.source).isNone) =
        (fun capture : Launcher.Capture =>
          (Captures.execution.capture capture.source
            (Launcher.rawValue ambient capture.source)
            (Launcher.checkValue ambient capture.source)).isNone) := by
    funext capture
    change (ambient capture.source).isNone =
      (Launcher.model.capture capture.source
        (Launcher.rawValue ambient capture.source)
        (Launcher.checkValue ambient capture.source)).isNone
    rw [← Launcher.Proofs.L1_capture_exact capture.source ambient]
  exact congrArg (fun predicate : Launcher.Capture → Bool =>
    script.captures.any predicate) predicates

private theorem snapshot_resolver_eq (root : String)
    (ambient : EnvironmentName → Option String) :
    resolve root ambient =
      Launcher.SnapshotWord.resolve Captures.execution root ambient := by
  funext word
  cases word with
  | literal value => rfl
  | root => rfl
  | file path => rfl
  | captured capture =>
      change ambient capture.source =
        Launcher.model.capture capture.source
          (Launcher.rawValue ambient capture.source)
          (Launcher.checkValue ambient capture.source)
      exact (Launcher.Proofs.L1_capture_exact capture.source ambient).symm

theorem PR1_capture_protocol : PR1_capture_protocol model := by
  intro name raw check value
  cases raw with
  | none => simp [model, read]
  | some sourceValue =>
      cases check with
      | none => simp [model, read]
      | some checkValue =>
          simp [model, read, Launcher.readCapture]
          constructor
          · rintro ⟨notAbsent, sourceEq⟩
            subst value
            refine ⟨rfl, ?_⟩
            by_cases placeholder : sourceValue = Launcher.placeholder name
            · exact Or.inr (notAbsent placeholder)
            · exact Or.inl placeholder
          · rintro ⟨valueEq, valid⟩
            subst value
            refine ⟨?_, rfl⟩
            intro placeholder
            rcases valid with notPlaceholder | checked
            · exact False.elim (notPlaceholder placeholder)
            · exact checked

theorem PR2_execution_refines_launcher :
    PR2_execution_refines_launcher model := by
  intro script root ambient
  change execute script root ambient =
    Launcher.execute Captures.execution script root ambient
  simp only [execute, Launcher.execute]
  rw [capture_guard_eq script ambient]
  rw [snapshot_resolver_eq root ambient]

theorem PR3_complete_process : PR3_complete_process model := by
  intro plan root ambient
  change model.execute (Captures.compile plan) root
      (fun name => some (ambient name)) =
    some (Launcher.expected plan root ambient)
  rw [PR2_execution_refines_launcher]
  exact PluginSdk.Compiler.Process.Portable.complete_process plan root ambient

theorem PR4_missing_source_stops : PR4_missing_source_stops model := by
  intro plan root ambient name member missing
  change model.execute (Captures.compile plan) root ambient = none
  rw [PR2_execution_refines_launcher]
  exact PluginSdk.Compiler.Process.Portable.missing_source_stops
    plan root ambient name member missing

end PluginSdk.Compiler.Process.Portable.Runtime.Proofs
