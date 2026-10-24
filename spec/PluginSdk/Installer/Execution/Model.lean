import PluginSdk.Installer.Execution.Types

namespace PluginSdk.Installer.Execution

def executionDomainStatus (input : StatusInput) : DomainStatus :=
  match input.domain, input.observed with
  | .processGroup _ boot, .boot observedBoot =>
      if observedBoot = boot then .unknown else .quiescent
  | .processGroup group boot, .processGroup observedGroup observedBoot state =>
      if group = observedGroup ∧ boot = observedBoot then
        match state with
        | .present => .active
        | .absent => .quiescent
      else .unknown
  | .processGroup _ _, .unknown => .unknown
  | .processGroup _ _, .windowsJob _ _ => .unknown
  | .windowsJob name, .windowsJob observedName state =>
      if name = observedName then
        match state with
        | .active => .active
        | .empty | .absent => .unknown
      else .unknown
  | .windowsJob _, .unknown => .unknown
  | .windowsJob _, .boot _ => .unknown
  | .windowsJob _, .processGroup _ _ _ => .unknown

def model : Interface := ⟨executionDomainStatus⟩

end PluginSdk.Installer.Execution
