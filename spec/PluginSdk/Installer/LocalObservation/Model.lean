import PluginSdk.Installer.LocalObservation.Types

namespace PluginSdk.Installer.LocalObservation

def observeLocalSlots (input : Input) : LifecycleObservation :=
  if AuxiliaryAbsent input.slots then
    match input.slots.live with
    | .absent => .absent
    | .unknown => .unknown
    | .foreign basis => .present basis none
    | .partialPackage _ basis => .present basis none
    | .complete claim basis =>
        if claim.owner = input.owner then .present basis (some claim.identity)
        else .present basis none
  else
    .unknown

def model : Interface := ⟨observeLocalSlots⟩

end PluginSdk.Installer.LocalObservation
