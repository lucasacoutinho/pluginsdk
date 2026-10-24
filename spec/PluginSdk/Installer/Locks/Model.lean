import PluginSdk.Installer.Locks.Types

namespace PluginSdk.Installer.Locks

def installationLockSubjects : Scope → List Subject
  | .user home => [.home home]
  | .project home root => [.home home, .project root]

def model : Interface := ⟨installationLockSubjects⟩

end PluginSdk.Installer.Locks
