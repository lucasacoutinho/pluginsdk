import PluginSdk.Installer.ProjectFile.Types
import PluginSdk.Installer.Companions.Types

namespace PluginSdk.Installer.CompanionFile

abbrev Input := ProjectFile.Input
abbrev ReviewInput := ProjectFile.ReviewInput
abbrev Basis := ProjectFile.Basis

def privateMode : ProjectFile.PosixMode := ⟨384, by decide⟩

inductive Reason where
  | metadata (reason : ProjectFile.Reason)
  | mode
  deriving DecidableEq, Repr

inductive Decision where
  | ready (basis : Basis)
  | blocked (reason : Reason)
  deriving DecidableEq, Repr

def projectedBasis : Basis → Companions.Observation
  | .absent => .absent
  | .file digest _ => .file ⟨digest⟩
  | .windowsFile digest _ _ => .file ⟨digest⟩

structure Interface where
  admit : Input → Decision
  review : ReviewInput → Decision
  observe : Input → Companions.Observation

end PluginSdk.Installer.CompanionFile
