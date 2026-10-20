import PluginSdk.Lifecycle.Rules

namespace PluginSdk.Lifecycle

def decideIdle (idle : Idle) (observed : Observation) (desired : Desired) : Decision :=
  let state := idle.snapshot observed
  match observed with
  | .unknown => .blocked .unknown state
  | .absent =>
    match desired with
    | .present bundle => .change (.install bundle) state
    | .absent => if idle.receipt = none then .unchanged state else .change .remove state
  | .present fingerprint identity =>
    match idle.receipt with
    | none => .blocked .unowned state
    | some receipt =>
      if Observation.present fingerprint identity = .present receipt.fingerprint (some receipt.identity) then
        match desired with
        | .absent => .change .remove state
        | .present bundle =>
          if bundle = receipt.identity.bundle then .unchanged state else .change (.replace bundle) state
      else .blocked .drift state

def decide (input : PlanningInput) : Decision :=
  match input.journal with
  | .idle state => decideIdle state input.observed input.desired
  | .pending operation => .pending operation.plan

def replay (idle : Idle) (change : Change) (observed : Observation) : BeginResult :=
  if idle.completedDesired ≠ some change.desired then .rejected .invalidPlan
  else
    match idle with
    | .empty _ => if observed = .absent then .completed .removed else .rejected .stalePlan
    | .installed receipt =>
      if observed = .present receipt.fingerprint (some receipt.identity) then .completed (.installed receipt)
      else .rejected .stalePlan
    | .notApplied _ attempted state =>
      if change ≠ attempted then .rejected .invalidPlan
      else if observed ≠ .unknown ∧ observed = state.observed then .completed .notApplied
      else .rejected .stalePlan

def begin (input : BeginInput) : BeginResult :=
  match input.journal with
  | .pending operation =>
    if input.plan ≠ operation.plan then .rejected .differentPendingPlan
    else if input.change ≠ operation.change then .rejected .invalidPlan
    else .resume operation
  | .idle state =>
    if state.revision = some input.plan then replay state input.change input.observed
    else if input.before ≠ state.snapshot input.observed then .rejected .stalePlan
    else if decide ⟨input.journal, input.observed, input.change.desired⟩ = .change input.change input.before then
      .start ⟨input.plan, state, input.observed, input.change⟩
    else .rejected .invalidPlan

def established (pending : Pending) (observed : Observation) : Option (Idle × Completion) :=
  match pending.change, observed with
  | .remove, .absent => some (.empty (some pending.plan), .removed)
  | .install bundle, .present fingerprint (some identity)
  | .replace bundle, .present fingerprint (some identity) =>
    if identity = ⟨pending.plan, bundle⟩ then
      let receipt := Receipt.mk identity fingerprint
      some (.installed receipt, .installed receipt)
    else none
  | _, _ => none

def settle (input : SettleInput) : Settlement :=
  match established input.journal input.observed with
  | some (idle, result) => .completed idle result
  | none =>
    if input.observed ≠ .unknown ∧ input.observed = input.journal.observed then
      .completed (.notApplied input.journal.plan input.journal.change
        (input.journal.previous.snapshot input.journal.observed)) .notApplied
    else .uncertain input.journal input.observed

def model : Interface := ⟨decide, begin, settle⟩

end PluginSdk.Lifecycle
