import PluginSdk.Compatibility.ClientPackages.Types

namespace PluginSdk.Project.Preview

abbrev Client := Compatibility.ClientPackages.Client

inductive Desired where
  | present
  | absent
  deriving DecidableEq, Repr

inductive Provider where
  | none
  | qualified
  | unqualified
  deriving DecidableEq, Repr

structure RouteInput where
  client : Client
  desired : Desired
  provider : Provider
  deriving DecidableEq, Repr

inductive Route where
  | direct (client : Client) (desired : Desired)
  | inherited
  | blocked
  deriving DecidableEq, Repr

inductive LocalStatus where
  | missing
  | unchanged
  | installed
  | removed
  | notApplied
  | uncertain
  deriving DecidableEq, Repr

inductive Completion where
  | missing
  | unchanged
  | installed
  | removed
  | notApplied
  | uncertain
  | inherited
  deriving DecidableEq, Repr

def LocalStatus.toCompletion : LocalStatus → Completion
  | .missing => .missing
  | .unchanged => .unchanged
  | .installed => .installed
  | .removed => .removed
  | .notApplied => .notApplied
  | .uncertain => .uncertain

inductive CompletionInput where
  | direct (status : LocalStatus)
  | inherited (provider cleanup : LocalStatus)
  deriving DecidableEq, Repr

def ProviderSucceeded (status : LocalStatus) : Prop :=
  status = .installed ∨ status = .unchanged

def LocalAbsenceConfirmed (status : LocalStatus) : Prop :=
  status = .removed ∨ status = .unchanged

structure Interface where
  route : RouteInput → Route
  mayApplyInherited : LocalStatus → Bool
  finish : CompletionInput → Completion

end PluginSdk.Project.Preview
