import PluginSdk.Installer.LocalSlot.Cleanup.Types

namespace PluginSdk.Installer.LocalSlot.Cleanup

def cleanup (input : Input) : Decision :=
  if HasUnknown input.slots then .blocked .unknown
  else if HasUnownedObservation input.owner input.slots then .blocked .unowned
  else if ¬ ValidOperation input.operation then .blocked .operation
  else if ¬ RoleValidClaims input.owner input.operation input.slots then .blocked .drift
  else if input.slots.staged ≠ .absent then .step .staged
  else if input.slots.retired ≠ .absent then .step .retired
  else if input.slots.live ≠ .absent then .step .live
  else .complete

def model : Interface := ⟨cleanup⟩

end PluginSdk.Installer.LocalSlot.Cleanup
