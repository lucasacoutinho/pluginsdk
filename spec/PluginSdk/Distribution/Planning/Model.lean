import PluginSdk.Distribution.Planning.Types

namespace PluginSdk.Distribution.Planning

def StepKey (step : StepDescriptor) : Compiler.Key := [step.target.value]

def BlockedCandidates (input : List Candidate) : List Issue :=
  input.filterMap fun candidate => match candidate with
    | .ready _ => none
    | .blocked target reason => some (.blocked target reason)

def RepeatedTargets (input : List Candidate) : List TargetId :=
  (input.map CandidateTarget).filter fun target =>
    decide (1 < CountTarget input target)

def RepeatedInstallations (input : List Candidate) : List InstallationKey :=
  ((ReadySteps input).map (·.installation)).filter fun installation =>
    decide (1 < CountInstallation input installation)

def IssueCandidates (input : List Candidate) : List Issue :=
  BlockedCandidates input ++
    (RepeatedTargets input).map Issue.duplicateTarget ++
    (RepeatedInstallations input).map Issue.duplicateInstallation

def PlanningIssues (input : List Candidate) : List Issue :=
  Compiler.ordered IssueKey (Compiler.unique (IssueCandidates input))

def OrderedReadySteps (input : List Candidate) : List StepDescriptor :=
  Compiler.ordered StepKey (ReadySteps input)

theorem readySteps_nonempty_of_no_issues (input : NonemptyList Candidate)
    (empty : PlanningIssues input.toList = []) : OrderedReadySteps input.toList ≠ [] := by
  cases input with
  | mk head tail =>
    cases head with
    | ready step =>
      have readyStarts : ReadySteps (.ready step :: tail) = step :: ReadySteps tail := by
        simp [ReadySteps]
      intro orderedEmpty
      have perm := Compiler.ordered_perm StepKey (ReadySteps (.ready step :: tail))
      have lengths := perm.length_eq
      change Compiler.ordered StepKey (ReadySteps (.ready step :: tail)) = [] at orderedEmpty
      rw [orderedEmpty, readyStarts] at lengths
      simp at lengths
    | blocked target reason =>
      have member : .blocked target reason ∈ PlanningIssues (.blocked target reason :: tail) := by
        simp [PlanningIssues, IssueCandidates, BlockedCandidates]
      change PlanningIssues (.blocked target reason :: tail) = [] at empty
      rw [empty] at member
      simp at member

def normalize (input : NonemptyList Candidate) : Result :=
  if h : PlanningIssues input.toList = [] then
    .ready (Compiler.nonempty (OrderedReadySteps input.toList)
      (readySteps_nonempty_of_no_issues input h))
  else
    .blocked (Compiler.nonempty (PlanningIssues input.toList) h)

def model : Interface := ⟨normalize⟩

end PluginSdk.Distribution.Planning
