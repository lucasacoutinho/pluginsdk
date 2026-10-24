import PluginSdk.Installer.ProjectConfig.Types

namespace PluginSdk.Installer.ProjectConfig

def blockedReason (input : Input) : Reason :=
  if 1 < (Owned input.key input.document).length then .duplicate
  else if input.previous = none then .unowned
  else .drift

def editInput (input : Input) : Result :=
  if Safe input then
    if input.previous = input.desired then .ready input.document
    else .ready (Foreign input.key input.document ++
      input.desired.toList.map (Segment.managed input.key))
  else .blocked (blockedReason input)

def model : Interface := ⟨editInput⟩

end PluginSdk.Installer.ProjectConfig
