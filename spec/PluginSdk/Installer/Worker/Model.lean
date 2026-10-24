import PluginSdk.Installer.Worker.Types

namespace PluginSdk.Installer.Worker

def admitWorkerRequest (input : Input) : Step :=
  match input.state, input.signal with
  | .waiting, .request => ⟨.accepted, .start⟩
  | .waiting, .invalid | .waiting, .disconnect => ⟨.stopped, .stop⟩
  | .accepted, _ => ⟨.accepted, .ignore⟩
  | .stopped, _ => ⟨.stopped, .ignore⟩

def model : Interface := ⟨admitWorkerRequest⟩

end PluginSdk.Installer.Worker
