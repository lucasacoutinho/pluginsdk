import PluginSdk.Distribution.Types

namespace PluginSdk.Distribution.Planning

inductive Failure where
  | wrongOrganization
  | workspaceUnqualified
  | mcpRegistrationUnqualified
  | releaseUnavailable
  | releaseMismatch
  | packageUnavailable
  | packageAmbiguous
  | packageRejected
  | destinationUnsupported
  | hostUnavailable
  | installationUnavailable
  | pendingOperation
  | unowned
  | drift
  | unknown
  deriving DecidableEq, Repr

inductive Candidate where
  | ready (step : StepDescriptor)
  | blocked (target : TargetId) (reason : Failure)
  deriving DecidableEq, Repr

inductive Issue where
  | blocked (target : TargetId) (reason : Failure)
  | duplicateTarget (target : TargetId)
  | duplicateInstallation (installation : InstallationKey)
  deriving DecidableEq, Repr

inductive Result where
  | ready (steps : NonemptyList StepDescriptor)
  | blocked (issues : NonemptyList Issue)

structure Interface where
  normalize : NonemptyList Candidate → Result

def CandidateTarget : Candidate → TargetId
  | .ready step => step.target
  | .blocked target _ => target

def ReadySteps (candidates : List Candidate) : List StepDescriptor :=
  candidates.filterMap fun candidate => match candidate with
    | .ready step => some step
    | .blocked _ _ => none

def FullyReady (candidates : List Candidate) : Prop :=
  ∀ candidate ∈ candidates, ∃ step, candidate = .ready step

def CountTarget (candidates : List Candidate) (target : TargetId) : Nat :=
  candidates.countP (fun candidate => CandidateTarget candidate == target)

def CountInstallation (candidates : List Candidate) (installation : InstallationKey) : Nat :=
  (ReadySteps candidates).countP (fun step => step.installation == installation)

def RequiredIssue (candidates : List Candidate) : Issue → Prop
  | .blocked target reason => .blocked target reason ∈ candidates
  | .duplicateTarget target => 1 < CountTarget candidates target
  | .duplicateInstallation installation => 1 < CountInstallation candidates installation

def FailureName : Failure → String
  | .wrongOrganization => "wrong_organization"
  | .workspaceUnqualified => "workspace_unqualified"
  | .mcpRegistrationUnqualified => "mcp_registration_unqualified"
  | .releaseUnavailable => "release_unavailable"
  | .releaseMismatch => "release_mismatch"
  | .packageUnavailable => "package_unavailable"
  | .packageAmbiguous => "package_ambiguous"
  | .packageRejected => "package_rejected"
  | .destinationUnsupported => "destination_unsupported"
  | .hostUnavailable => "host_unavailable"
  | .installationUnavailable => "installation_unavailable"
  | .pendingOperation => "pending_operation"
  | .unowned => "unowned"
  | .drift => "drift"
  | .unknown => "unknown"

def IssueKey : Issue → Compiler.Key
  | .blocked target reason => ["blocked", target.value, FailureName reason]
  | .duplicateTarget target => ["duplicate_target", target.value]
  | .duplicateInstallation installation => ["duplicate_installation", installation.value]

end PluginSdk.Distribution.Planning
