import PluginSdk.Domain

namespace PluginSdk.Repair

inductive Residual where
  | absent
  | marketplace
  deriving DecidableEq, Repr

structure Snapshot where
  fingerprint : Fingerprint
  residual : Residual
  deriving DecidableEq, Repr

structure Basis where
  interrupted : PlanId
  pending : PlanId
  observed : Snapshot
  deriving DecidableEq, Repr

structure Pending where
  plan : PlanId
  before : Basis
  deriving DecidableEq, Repr

inductive State where
  | operationPending (plan : PlanId)
  | repairPending (pending : Pending)
  | complete (plan : PlanId)
  deriving DecidableEq, Repr

inductive Conflict where
  | unknown
  | unowned
  | drift
  deriving DecidableEq, Repr

inductive Inspection where
  | recoverable (state : Snapshot)
  | blocked (reason : Conflict)
  deriving DecidableEq, Repr

structure ProposalInput where
  state : State
  observed : Inspection
  deriving DecidableEq, Repr

inductive Proposal where
  | repair (before : Basis)
  | blocked (reason : Conflict)
  | notPending
  deriving DecidableEq, Repr

structure BeginInput where
  state : State
  observed : Inspection
  plan : PlanId
  before : Basis
  deriving DecidableEq, Repr

inductive Change where
  | none
  | removeMarketplace
  deriving DecidableEq, Repr

inductive PlanRejection where
  | invalidPlan
  | stalePlan
  | differentPendingPlan
  deriving DecidableEq, Repr

inductive BeginResult where
  | start (pending : Pending) (change : Change)
  | resume (pending : Pending)
  | completed
  | rejected (reason : PlanRejection)
  deriving DecidableEq, Repr

structure SettleInput where
  state : Pending
  observed : Inspection
  deriving DecidableEq, Repr

inductive Settlement where
  | completed (plan : PlanId)
  | uncertain (state : Pending) (observed : Inspection)
  deriving DecidableEq, Repr

structure Interface where
  propose : ProposalInput → Proposal
  begin : BeginInput → BeginResult
  settle : SettleInput → Settlement

end PluginSdk.Repair
