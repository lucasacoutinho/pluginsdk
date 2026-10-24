import PluginSdk.Installer.LocalSlot.Types

namespace PluginSdk.Installer.LocalSlot

def advance (input : Input) : Decision :=
  if HasUnknown input.slots then
    .blocked .unknown
  else if HasUnownedObservation input.owner input.slots then
    .blocked .unowned
  else if ¬ ValidOperation input.operation then
    .blocked .operation
  else if ¬ RoleValidClaims input.owner input.operation input.slots then
    .blocked .drift
  else if PrepareState input then
    .step .prepare
  else if DiscardStageState input then
    .step .discardStage
  else if RetireState input then
    .step .retire
  else if PublishState input then
    .step .publish
  else if DiscardRetiredState input then
    .step .discardRetired
  else if CompletionState input then
    .complete
  else
    .blocked .state

def model : Interface := ⟨advance⟩

end PluginSdk.Installer.LocalSlot
