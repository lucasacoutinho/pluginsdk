import PluginSdk.Distribution.Execution.Types

namespace PluginSdk.Distribution.Execution

def pendingEntries (steps : NonemptyList StepDescriptor) : NonemptyList Entry :=
  ⟨⟨steps.head, .pending⟩, steps.tail.map fun step => ⟨step, .pending⟩⟩

def openRecord (input : OpenInput) : OpenResult :=
  match input.prior with
  | none => .opened ⟨input.plan.id, input.plan.desired, pendingEntries input.plan.steps⟩
  | some prior =>
    if decide (BindingsMatch input.plan prior) then .opened prior else .planConflict

def findEligible : List Entry → List TargetId → Option Entry
  | [], _ => none
  | entry :: rest, visited =>
    if decide (Eligible entry visited) then some entry else findEligible rest visited

def schedule (input : ScheduleInput) : ScheduleResult :=
  match findEligible input.record.entries.toList input.visited with
  | none => .idle
  | some entry => .attempt entry.step

def findTarget (entries : List Entry) (target : TargetId) : Option Entry :=
  entries.find? fun entry => entry.step.target == target

def updateEntry (entry : Entry) (target : TargetId) (status : AttemptStatus) : Entry :=
  if entry.step.target = target then { entry with status := status.toStatus } else entry

def updatedEntries (entries : NonemptyList Entry) (target : TargetId)
    (status : AttemptStatus) : NonemptyList Entry :=
  ⟨updateEntry entries.head target status,
    entries.tail.map fun entry => updateEntry entry target status⟩

def record (input : RecordInput) : RecordResult :=
  match findTarget input.record.entries.toList input.target with
  | none => .stepMissing
  | some entry =>
    if CanAttempt entry.status then
      .recorded { input.record with entries := updatedEntries input.record.entries input.target input.status }
    else .stepTerminal

def summarize (record : Progress) : Summary :=
  if record.entries.toList.all fun entry => decide (Satisfies record.desired entry.status) then
    .complete
  else .incomplete

def model : Interface := ⟨openRecord, schedule, record, summarize⟩

end PluginSdk.Distribution.Execution
