import PluginSdk.Compiler.Canonical

namespace PluginSdk.Installer.Companions

open PluginSdk.Compiler

structure RoleName where
  value : String
  deriving DecidableEq, Repr

structure FileIdentity where
  name : RoleName
  digest : FileDigest
  deriving DecidableEq

inductive Observation where
  | absent
  | file (digest : FileDigest)
  | conflict
  | unknown
  deriving DecidableEq

structure ObservedFile where
  name : RoleName
  observed : Observation
  deriving DecidableEq

structure Input where
  previous : List FileIdentity
  desired : List FileIdentity
  observed : List ObservedFile

inductive Change where
  | create (name : RoleName) (after : FileDigest)
  | replace (name : RoleName) (before after : FileDigest)
  | remove (name : RoleName) (before : FileDigest)
  | keep (name : RoleName) (digest : FileDigest)
  deriving DecidableEq

def Change.name : Change → RoleName
  | .create name _ | .replace name _ _ | .remove name _ | .keep name _ => name

inductive Reason where
  | duplicatePrevious
  | duplicateDesired
  | observationUnavailable
  | unowned
  | drift
  | unknown
  deriving DecidableEq, Repr

structure Issue where
  name : RoleName
  reason : Reason
  deriving DecidableEq

inductive Result where
  | ready (changes : List Change)
  | blocked (issues : NonemptyList Issue)

structure Interface where
  review : Input → Result

def Previous (input : Input) (name : RoleName) : List FileIdentity := input.previous.filter (fun file => file.name == name)
def Desired (input : Input) (name : RoleName) : List FileIdentity := input.desired.filter (fun file => file.name == name)
def Observed (input : Input) (name : RoleName) : List ObservedFile := input.observed.filter (fun file => file.name == name)
def RequiredName (input : Input) (name : RoleName) : Prop :=
  name ∈ input.previous.map (·.name) ∨ name ∈ input.desired.map (·.name)

instance (input : Input) (name : RoleName) : Decidable (RequiredName input name) := by
  unfold RequiredName
  infer_instance

def SafeBefore (input : Input) (name : RoleName) : Prop :=
  (Previous input name = [] ∧ Observed input name = [⟨name, .absent⟩]) ∨
  ∃ digest, Previous input name = [⟨name, digest⟩] ∧ Observed input name = [⟨name, .file digest⟩]

def Safe (input : Input) : Prop :=
  (input.previous.map (·.name)).Nodup ∧ (input.desired.map (·.name)).Nodup ∧
  ∀ name, RequiredName input name → SafeBefore input name

def UnsafeReason (input : Input) (name : RoleName) : Option Reason :=
  match Previous input name, Observed input name with
  | [], [⟨_, .absent⟩] => none
  | [], [⟨_, .file _⟩] => some .unowned
  | [_], [⟨_, .absent⟩] => some .drift
  | [before], [⟨_, .file digest⟩] => if before.digest = digest then none else some .drift
  | _, [⟨_, .conflict⟩] => some .unowned
  | _, [⟨_, .unknown⟩] => some .unknown
  | _, _ => none

def RequiredIssue (input : Input) (issue : Issue) : Prop :=
  RequiredName input issue.name ∧ match issue.reason with
  | .duplicatePrevious => 1 < (Previous input issue.name).length
  | .duplicateDesired => 1 < (Desired input issue.name).length
  | .observationUnavailable => (Observed input issue.name).length ≠ 1
  | .unowned => UnsafeReason input issue.name = some .unowned
  | .drift => UnsafeReason input issue.name = some .drift
  | .unknown => UnsafeReason input issue.name = some .unknown

def ExpectedChange (input : Input) : Change → Prop
  | .create name after => Previous input name = [] ∧ Desired input name = [⟨name, after⟩]
  | .replace name before after => before ≠ after ∧ Previous input name = [⟨name, before⟩] ∧ Desired input name = [⟨name, after⟩]
  | .remove name before => Previous input name = [⟨name, before⟩] ∧ Desired input name = []
  | .keep name digest => Previous input name = [⟨name, digest⟩] ∧ Desired input name = [⟨name, digest⟩]

def ReasonName : Reason → String
  | .duplicatePrevious => "duplicate_previous"
  | .duplicateDesired => "duplicate_desired"
  | .observationUnavailable => "observation_unavailable"
  | .unowned => "unowned"
  | .drift => "drift"
  | .unknown => "unknown"

def IssueKey (issue : Issue) : Key := [issue.name.value, ReasonName issue.reason]

end PluginSdk.Installer.Companions
