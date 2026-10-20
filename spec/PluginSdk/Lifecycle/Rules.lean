import PluginSdk.Lifecycle.Types

namespace PluginSdk.Lifecycle

def Idle.revision : Idle → Option PlanId
  | .empty last => last
  | .installed receipt => some receipt.identity.plan
  | .notApplied plan _ _ => some plan

def Idle.receipt : Idle → Option Receipt
  | .empty _ => none
  | .installed receipt => some receipt
  | .notApplied _ _ state => state.receipt

def Idle.snapshot (idle : Idle) (observed : Observation) : Snapshot :=
  ⟨idle.revision, idle.receipt, observed⟩

def Journal.receipt : Journal → Option Receipt
  | .idle state => state.receipt
  | .pending operation => operation.previous.receipt

def Change.desired : Change → Desired
  | .install bundle | .replace bundle => .present bundle
  | .remove => .absent

def Matches (observed : Observation) (receipt : Receipt) : Prop :=
  observed = .present receipt.fingerprint (some receipt.identity)

def Starts (result : BeginResult) : Prop := ∃ pending, result = .start pending

def Authorizes (decision : Decision) : Prop := ∃ change before, decision = .change change before

def Owned (journal : Journal) (observed : Observation) : Prop :=
  ∃ receipt, journal.receipt = some receipt ∧ Matches observed receipt

def DesiredEstablished (pending : Pending) (observed : Observation) : Prop :=
  match pending.change, observed with
  | .remove, .absent => True
  | .install bundle, .present _ (some identity)
  | .replace bundle, .present _ (some identity) => identity = ⟨pending.plan, bundle⟩
  | _, _ => False

def BeforeEstablished (pending : Pending) (observed : Observation) : Prop :=
  observed ≠ .unknown ∧ observed = pending.observed

def Idle.completedDesired : Idle → Option Desired
  | .empty none => none
  | .empty (some _) => some .absent
  | .installed receipt => some (.present receipt.identity.bundle)
  | .notApplied _ change _ => some change.desired

def RecordedOutcome (idle : Idle) (change : Change) (observed : Observation)
    (result : Completion) : Prop :=
  match idle with
  | .empty (some _) => change = .remove ∧ observed = .absent ∧ result = .removed
  | .empty none => False
  | .installed receipt =>
    change.desired = .present receipt.identity.bundle ∧ Matches observed receipt ∧
    result = .installed receipt
  | .notApplied _ attempted state =>
    change = attempted ∧ observed ≠ .unknown ∧ observed = state.observed ∧ result = .notApplied

def PlanningRule (idle : Idle) (observed : Observation) (desired : Desired)
    (decision : Decision) : Prop :=
  let state := idle.snapshot observed
  match observed with
  | .unknown => decision = .blocked .unknown state
  | .absent =>
    match desired with
    | .present bundle => decision = .change (.install bundle) state
    | .absent =>
      match idle.receipt with
      | none => decision = .unchanged state
      | some _ => decision = .change .remove state
  | .present fingerprint identity =>
    match idle.receipt with
    | none => decision = .blocked .unowned state
    | some receipt =>
      if Observation.present fingerprint identity = .present receipt.fingerprint (some receipt.identity) then
        match desired with
        | .absent => decision = .change .remove state
        | .present bundle =>
          if bundle = receipt.identity.bundle then decision = .unchanged state
          else decision = .change (.replace bundle) state
      else decision = .blocked .drift state

def DesiredSettlement (input : SettleInput) (result : Settlement) : Prop :=
  match input.journal.change, input.observed with
  | .remove, .absent => result = .completed (.empty (some input.journal.plan)) .removed
  | .install bundle, .present fingerprint (some identity)
  | .replace bundle, .present fingerprint (some identity) =>
    identity = ⟨input.journal.plan, bundle⟩ ∧
    result = .completed (.installed ⟨identity, fingerprint⟩) (.installed ⟨identity, fingerprint⟩)
  | _, _ => False

end PluginSdk.Lifecycle
