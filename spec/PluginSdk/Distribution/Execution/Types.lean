import PluginSdk.Distribution.Types

namespace PluginSdk.Distribution.Execution

inductive Status where
  | pending
  | installed
  | removed
  | unchanged
  | notApplied
  | blocked
  | uncertain
  | unavailable
  deriving DecidableEq, Repr

inductive AttemptStatus where
  | installed
  | removed
  | unchanged
  | notApplied
  | blocked
  | uncertain
  | unavailable
  deriving DecidableEq, Repr

def AttemptStatus.toStatus : AttemptStatus → Status
  | .installed => .installed
  | .removed => .removed
  | .unchanged => .unchanged
  | .notApplied => .notApplied
  | .blocked => .blocked
  | .uncertain => .uncertain
  | .unavailable => .unavailable

structure Plan where
  id : DistributionPlanId
  desired : Desired
  steps : NonemptyList StepDescriptor

structure Entry where
  step : StepDescriptor
  status : Status
  deriving DecidableEq, Repr

structure Progress where
  id : DistributionPlanId
  desired : Desired
  entries : NonemptyList Entry

structure OpenInput where
  plan : Plan
  prior : Option Progress

inductive OpenResult where
  | opened (record : Progress)
  | planConflict

structure ScheduleInput where
  record : Progress
  visited : List TargetId

inductive ScheduleResult where
  | attempt (step : StepDescriptor)
  | idle
  deriving DecidableEq, Repr

structure RecordInput where
  record : Progress
  target : TargetId
  status : AttemptStatus

inductive RecordResult where
  | recorded (record : Progress)
  | stepMissing
  | stepTerminal

inductive Summary where
  | complete
  | incomplete
  deriving DecidableEq, Repr

structure Interface where
  openRecord : OpenInput → OpenResult
  schedule : ScheduleInput → ScheduleResult
  record : RecordInput → RecordResult
  summarize : Progress → Summary

def BindingsMatch (plan : Plan) (record : Progress) : Prop :=
  record.id = plan.id ∧ record.desired = plan.desired ∧
    record.entries.toList.map (·.step) = plan.steps.toList

instance (plan : Plan) (record : Progress) : Decidable (BindingsMatch plan record) :=
  inferInstanceAs (Decidable (_ ∧ _ ∧ _))

def CanAttempt (status : Status) : Prop :=
  status = .pending ∨ status = .uncertain ∨ status = .unavailable

instance (status : Status) : Decidable (CanAttempt status) :=
  inferInstanceAs (Decidable (_ ∨ _ ∨ _))

def Eligible (entry : Entry) (visited : List TargetId) : Prop :=
  CanAttempt entry.status ∧ entry.step.target ∉ visited

instance (entry : Entry) (visited : List TargetId) : Decidable (Eligible entry visited) :=
  inferInstanceAs (Decidable (_ ∧ _))

def Satisfies (desired : Desired) (status : Status) : Prop :=
  status = .unchanged ∨ (desired = .present ∧ status = .installed) ∨
    (desired = .absent ∧ status = .removed)

instance (desired : Desired) (status : Status) : Decidable (Satisfies desired status) :=
  inferInstanceAs (Decidable (_ ∨ _ ∨ _))

end PluginSdk.Distribution.Execution
