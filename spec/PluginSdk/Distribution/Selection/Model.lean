import PluginSdk.Distribution.Selection.Types

namespace PluginSdk.Distribution.Selection

def selectCandidates : List Catalog.PackageFormat → Result
  | [] => .unavailable
  | format :: [] => .selected format
  | _ :: _ :: _ => .ambiguous

def select (input : Input) : Result :=
  selectCandidates (CompatibleFormats input)

def model : Interface := ⟨select⟩

end PluginSdk.Distribution.Selection
