import PluginSdk.Compiler.Format

namespace PluginSdk.Compiler.Bundle

structure Input where
  digest : BundleDigest
  computed : BundleDigest
  paths : NonemptyList PackagePath

def paths (input : Input) : List String := input.paths.toList.map PackagePath.value

inductive Issue where
  | digestMismatch
  | noncanonicalOrder
  | pathCollision (path : String)
  deriving DecidableEq, Repr

inductive Result where
  | valid
  | rejected (issues : NonemptyList Issue)

structure Interface where
  check : Input → Result

def RequiredIssue (input : Input) : Issue → Prop
  | .digestMismatch => input.digest ≠ input.computed
  | .noncanonicalOrder => ¬ (paths input).Pairwise Utf8Before
  | .pathCollision key => ∃ left right, [left, right].Sublist (paths input) ∧ CollisionAt left right key

def IssueKey : Issue → List String
  | .digestMismatch => ["digest_mismatch"]
  | .noncanonicalOrder => ["noncanonical_order"]
  | .pathCollision path => ["path_collision", path]

end PluginSdk.Compiler.Bundle
