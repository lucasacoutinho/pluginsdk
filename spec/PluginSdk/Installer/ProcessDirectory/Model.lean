import PluginSdk.Installer.ProcessDirectory.Types
import PluginSdk.WindowsPath.Rules

namespace PluginSdk.Installer.ProcessDirectory

open Compiler.Process
open WindowsPath (utf16Units)

def cwdDirectory (input : Input) : Option String :=
  match input.script.cwd with
  | 0 => some input.root
  | Nat.succ index =>
    match input.script.snapshot[index]? with
    | some .root => some input.root
    | some (.file path) => some (AtRoot input.root path)
    | some (.literal _) | some (.captured _) | none => none

def admit (input : Input) : Admission :=
  match cwdDirectory input with
  | none => .unresolved
  | some directory =>
    if utf16Units directory + 2 ≤ 260 then .accepted directory
    else .tooLong (utf16Units directory)

def model : Interface := ⟨admit⟩

end PluginSdk.Installer.ProcessDirectory
