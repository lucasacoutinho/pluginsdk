import PluginSdk.Installer.LocalApproval.Types

namespace PluginSdk.Installer.LocalApproval

def bindLocalApproval (input : Input) : Option PluginSdk.Installer.LocalPackage.Approval :=
  if BindingFacts input then some (BoundApproval input) else none

def model : Interface := ⟨bindLocalApproval⟩

end PluginSdk.Installer.LocalApproval
