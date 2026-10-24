import PluginSdk.Compiler.Process.Portable.Runtime.Types

namespace PluginSdk.Compiler.Process.Portable.Runtime

def PR1_capture_protocol (model : Interface) : Prop :=
  ∀ name raw check value, model.read name raw check = some value ↔
    ∃ sourceValue checkValue, raw = some sourceValue ∧ check = some checkValue ∧
      value = sourceValue ∧ (sourceValue ≠ Launcher.placeholder name ∨ checkValue = sourceValue)

def PR2_execution_refines_launcher (model : Interface) : Prop :=
  ∀ script root ambient, model.execute script root ambient =
    Launcher.execute Captures.execution script root ambient

def PR3_complete_process (model : Interface) : Prop :=
  ∀ plan root ambient, model.execute (Captures.compile plan) root
    (fun name => some (ambient name)) = some (Launcher.expected plan root ambient)

def PR4_missing_source_stops (model : Interface) : Prop :=
  ∀ plan root ambient name, name ∈ (Launcher.words plan).flatMap Launcher.references →
    ambient name = none → model.execute (Captures.compile plan) root ambient = none

end PluginSdk.Compiler.Process.Portable.Runtime
