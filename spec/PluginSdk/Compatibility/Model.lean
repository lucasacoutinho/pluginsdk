import PluginSdk.Compatibility.Types

namespace PluginSdk.Compatibility

def selectCandidates : List NativeProfile → Selection
  | [] => .unqualified
  | profile :: [] => .selected profile
  | _ :: _ :: _ => .ambiguous

def select (input : SelectionInput) : Selection :=
  selectCandidates (EligibleProfiles input)

def ownershipCompatible (input : OwnershipInput) : Bool :=
  decide ((Registrations input.profiles input.current).length = 1) &&
    decide ((Registrations input.profiles input.retained).length = 1) &&
    decide (input.current.host = input.retained.host) &&
    decide (input.current.platform = input.retained.platform) &&
    decide (input.current.scope = input.retained.scope) &&
    decide (input.current.revision = input.retained.revision)

def model : Interface := ⟨select, ownershipCompatible⟩

end PluginSdk.Compatibility
