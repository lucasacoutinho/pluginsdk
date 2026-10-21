import PluginSdk.Repair.Types

namespace PluginSdk.Repair

def propose (input : ProposalInput) : Proposal :=
  match input.state with
  | .complete _ => .notPending
  | .operationPending interrupted =>
    match input.observed with
    | .blocked reason => .blocked reason
    | .recoverable state =>
      .repair ⟨interrupted, interrupted, state⟩
  | .repairPending pending =>
    match input.observed with
    | .blocked reason => .blocked reason
    | .recoverable state =>
      .repair ⟨pending.before.interrupted, pending.plan, state⟩

def changeFor (state : Snapshot) : Change :=
  match state.residual with
  | .absent => .none
  | .marketplace => .removeMarketplace

def rejectFresh (input : BeginInput) (expectedPending : PlanId) : BeginResult :=
  if input.before.pending ≠ expectedPending then
    .rejected .differentPendingPlan
  else
    match propose ⟨input.state, input.observed⟩ with
    | .repair before =>
      if input.before = before then
        .start ⟨input.plan, before⟩ (changeFor before.observed)
      else
        .rejected .stalePlan
    | .blocked _ => .rejected .stalePlan
    | .notPending => .rejected .invalidPlan

def begin (input : BeginInput) : BeginResult :=
  match input.state with
  | .operationPending interrupted =>
    if input.plan = interrupted then
      .rejected .invalidPlan
    else if input.before.interrupted ≠ interrupted then
      .rejected .stalePlan
    else
      rejectFresh input interrupted
  | .repairPending pending =>
    if input.plan = pending.plan then
      if input.before = pending.before then .resume pending else .rejected .invalidPlan
    else if input.plan = pending.before.interrupted then
      .rejected .invalidPlan
    else if input.before.interrupted ≠ pending.before.interrupted then
      .rejected .stalePlan
    else
      rejectFresh input pending.plan
  | .complete completed =>
    if input.plan ≠ completed then
      .rejected .invalidPlan
    else
      match input.observed with
      | .recoverable state =>
        if state.residual = .absent then .completed else .rejected .stalePlan
      | .blocked _ => .rejected .stalePlan

def settle (input : SettleInput) : Settlement :=
  match input.observed with
  | .recoverable state =>
    if state.residual = .absent then .completed input.state.plan
    else .uncertain input.state input.observed
  | .blocked _ => .uncertain input.state input.observed

def model : Interface := ⟨propose, begin, settle⟩

end PluginSdk.Repair
