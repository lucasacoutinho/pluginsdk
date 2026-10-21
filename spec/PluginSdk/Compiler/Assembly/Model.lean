import PluginSdk.Compiler.Assembly.Properties
import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Collisions

namespace PluginSdk.Compiler.Assembly

def requestedAssets (input : Input) : List Asset := input.base.toList ++ input.assets

def paths (input : Input) : List String :=
  (requestedAssets input).map (fun asset => asset.path.value)

def assetKey (asset : Asset) : Key := [asset.path.value]

def reservedIssuesFor (assets : List Asset) : List Issue :=
  assets.filterMap fun asset =>
    if decide (ReservedPath asset.path.value) then some (.reservedAsset asset.path.value) else none

def reservedIssues (input : Input) : List Issue := reservedIssuesFor input.assets

def rawIssues (input : Input) : List Issue :=
  (pathCollisions (paths input)).map .pathCollision ++ reservedIssues input

def issues (input : Input) : List Issue := ordered IssueKey (unique (rawIssues input))

def files (input : Input) : List Asset := ordered assetKey (requestedAssets input)

def assemble (input : Input) : Result :=
  match issues input with
  | [] => .assembled (nonempty (files input) (by
      intro empty
      have sameLength := (ordered_perm assetKey (requestedAssets input)).length_eq
      simp only [files] at empty
      rw [empty] at sameLength
      simp only [requestedAssets, NonemptyList.toList, List.length_append, List.length_cons,
        List.length_nil] at sameLength
      omega))
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨assemble⟩

end PluginSdk.Compiler.Assembly
