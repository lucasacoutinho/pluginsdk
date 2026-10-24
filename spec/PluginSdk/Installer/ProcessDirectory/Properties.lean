import PluginSdk.Installer.ProcessDirectory.Types
import PluginSdk.Compiler.Process.Portable.Runtime.Model
import PluginSdk.WindowsPath.Rules

namespace PluginSdk.Installer.ProcessDirectory

open Compiler.Process
open WindowsPath (utf16Units)

inductive DeclaredDirectory (input : Input) : String → Prop where
  | implicitRoot : input.script.cwd = 0 → DeclaredDirectory input input.root
  | snapshotRoot (index : Nat) : input.script.cwd = index + 1 →
      input.script.snapshot[index]? = some .root → DeclaredDirectory input input.root
  | snapshotFile (index : Nat) (path : PackagePath) : input.script.cwd = index + 1 →
      input.script.snapshot[index]? = some (.file path) →
      DeclaredDirectory input (AtRoot input.root path)

def PD1_admitted_exact (model : Interface) : Prop :=
  ∀ input directory, model.admit input = .accepted directory ↔
    DeclaredDirectory input directory ∧ utf16Units directory + 2 ≤ 260

def PD2_unresolved_exact (model : Interface) : Prop :=
  ∀ input, model.admit input = .unresolved ↔ ¬ ∃ directory, DeclaredDirectory input directory

def PD3_capacity_refusal_exact (model : Interface) : Prop :=
  ∀ input units, model.admit input = .tooLong units ↔
    ∃ directory, DeclaredDirectory input directory ∧ utf16Units directory = units ∧
      260 < units + 2

def PD4_runtime_cwd_exact (model : Interface) : Prop :=
  ∀ input directory ambient invocation, model.admit input = .accepted directory →
    Portable.Runtime.execute input.script input.root ambient = some invocation →
    invocation.cwd = directory

end PluginSdk.Installer.ProcessDirectory
