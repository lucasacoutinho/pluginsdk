import PluginSdk.Installer.Companions.Types

namespace PluginSdk.Installer.Companions

open PluginSdk.Compiler

instance (input : Input) (issue : Issue) : Decidable (RequiredIssue input issue) := by
  cases issue with
  | mk name reason =>
    cases reason <;> unfold RequiredIssue <;> infer_instance

def NameKey (name : RoleName) : Key := [name.value]

def RequiredNames (input : Input) : List RoleName :=
  ordered NameKey (unique (input.previous.map (·.name) ++ input.desired.map (·.name)))

def PossibleReasons : List Reason :=
  [.duplicatePrevious, .duplicateDesired, .observationUnavailable, .unowned, .drift, .unknown]

def IssuesForName (input : Input) (name : RoleName) : List Issue :=
  (PossibleReasons.map fun reason => (⟨name, reason⟩ : Issue)).filter
    (fun issue => decide (RequiredIssue input issue))

def IssueCandidates (input : Input) : List Issue :=
  (RequiredNames input).flatMap (IssuesForName input)

def CanonicalIssues (input : Input) : List Issue :=
  ordered IssueKey (unique (IssueCandidates input))

def PlanChange (input : Input) (name : RoleName) : Option Change :=
  match Previous input name, Desired input name with
  | [], [after] => some (.create name after.digest)
  | [before], [] => some (.remove name before.digest)
  | [before], [after] =>
    if before.digest == after.digest then some (.keep name before.digest)
    else some (.replace name before.digest after.digest)
  | _, _ => none

def ChangeKey (change : Change) : Key := [change.name.value]

def CanonicalChanges (input : Input) : List Change :=
  (RequiredNames input).filterMap (PlanChange input)

def reviewInput (input : Input) : Result :=
  let issues := CanonicalIssues input
  if empty : issues = [] then .ready (CanonicalChanges input)
  else .blocked (nonempty issues empty)

def model : Interface := ⟨reviewInput⟩

end PluginSdk.Installer.Companions
