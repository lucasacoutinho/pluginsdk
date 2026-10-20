import PluginSdk.Compiler.Bundle.Types
import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Collisions

namespace PluginSdk.Compiler.Bundle

def rawIssues (input : Input) : List Issue :=
  (if input.digest = input.computed then [] else [.digestMismatch]) ++
  (if (paths input).Pairwise Utf8Before then [] else [.noncanonicalOrder]) ++
  (pathCollisions (paths input)).map .pathCollision

def issues (input : Input) : List Issue := ordered IssueKey (unique (rawIssues input))

def check (input : Input) : Result :=
  match issues input with
  | [] => .valid
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨check⟩

end PluginSdk.Compiler.Bundle
