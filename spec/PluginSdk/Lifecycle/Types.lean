import PluginSdk.Domain

namespace PluginSdk.Lifecycle

structure Identity where
  plan : PlanId
  bundle : BundleDigest
  deriving DecidableEq, Repr

structure Receipt where
  identity : Identity
  fingerprint : Fingerprint
  deriving DecidableEq, Repr

inductive Observation where
  | absent
  | present (fingerprint : Fingerprint) (identity : Option Identity)
  | unknown
  deriving DecidableEq, Repr

structure Snapshot where
  revision : Option PlanId
  receipt : Option Receipt
  observed : Observation
  deriving DecidableEq, Repr

inductive Desired where
  | absent
  | present (bundle : BundleDigest)
  deriving DecidableEq, Repr

inductive Change where
  | install (bundle : BundleDigest)
  | replace (bundle : BundleDigest)
  | remove
  deriving DecidableEq, Repr

inductive Idle where
  | empty (last : Option PlanId)
  | installed (receipt : Receipt)
  | notApplied (plan : PlanId) (change : Change) (state : Snapshot)
  deriving DecidableEq, Repr

structure Pending where
  plan : PlanId
  previous : Idle
  observed : Observation
  change : Change
  deriving DecidableEq, Repr

inductive Journal where
  | idle (state : Idle)
  | pending (state : Pending)
  deriving DecidableEq, Repr

inductive Conflict where
  | unowned
  | drift
  | unknown
  deriving DecidableEq, Repr

inductive Decision where
  | change (change : Change) (before : Snapshot)
  | unchanged (state : Snapshot)
  | blocked (reason : Conflict) (state : Snapshot)
  | pending (plan : PlanId)
  deriving DecidableEq, Repr

structure PlanningInput where
  journal : Journal
  observed : Observation
  desired : Desired
  deriving DecidableEq, Repr

structure BeginInput where
  journal : Journal
  observed : Observation
  plan : PlanId
  before : Snapshot
  change : Change
  deriving DecidableEq, Repr

inductive Completion where
  | installed (receipt : Receipt)
  | removed
  | notApplied
  deriving DecidableEq, Repr

inductive PlanRejection where
  | invalidPlan
  | stalePlan
  | differentPendingPlan
  deriving DecidableEq, Repr

inductive BeginResult where
  | start (journal : Pending)
  | resume (journal : Pending)
  | completed (result : Completion)
  | rejected (reason : PlanRejection)
  deriving DecidableEq, Repr

structure SettleInput where
  journal : Pending
  observed : Observation
  deriving DecidableEq, Repr

inductive Settlement where
  | completed (journal : Idle) (result : Completion)
  | uncertain (journal : Pending) (observed : Observation)
  deriving DecidableEq, Repr

structure Interface where
  decide : PlanningInput → Decision
  begin : BeginInput → BeginResult
  settle : SettleInput → Settlement

end PluginSdk.Lifecycle
