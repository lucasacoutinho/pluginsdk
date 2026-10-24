import PluginSdk.Installer.CompanionFile.Types
import PluginSdk.Installer.ProjectFile.Model

namespace PluginSdk.Installer.CompanionFile

def admit (input : Input) : Decision :=
  match ProjectFile.admit input with
  | .blocked reason => .blocked (.metadata reason)
  | .ready basis =>
    match basis with
    | .file _ mode => if mode = privateMode then .ready basis else .blocked .mode
    | .absent | .windowsFile _ _ _ => .ready basis

def review (input : ReviewInput) : Decision :=
  match admit input.current with
  | .blocked reason => .blocked reason
  | .ready basis =>
    if input.reviewed = basis then .ready basis else .blocked (.metadata .changed)

def observe (input : Input) : Companions.Observation :=
  match admit input with
  | .ready basis => projectedBasis basis
  | .blocked _ => .unknown

def model : Interface := ⟨admit, review, observe⟩

end PluginSdk.Installer.CompanionFile
