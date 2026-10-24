import PluginSdk.Installer.LauncherRuntime.Types

namespace PluginSdk.Installer.LauncherRuntime

def requirements (input : Input) : Option (List Check) :=
  match input.kind with
  | .absent => some []
  | .posix cwdRoot =>
    if input.platform = "linux" then
      some ([.shell, .env] ++ if cwdRoot then [.pwd] else [])
    else none
  | .portable =>
    if input.platform = "linux" then some [.node, .shell, .env]
    else if input.platform = "win32" then some [.node]
    else none

def acceptsNode (observation : NodeObservation) : Bool :=
  (observation.major > 24 || observation.major == 24 && observation.minor >= 18) &&
    (observation.platform == "win32" || observation.platform == "linux" && observation.execve)

def model : Interface := ⟨requirements, acceptsNode⟩

end PluginSdk.Installer.LauncherRuntime
