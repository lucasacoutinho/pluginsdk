import PluginSdk.Lifecycle.Types

namespace PluginSdk.Installer.LocalSlot

abbrev Identity := PluginSdk.Lifecycle.Identity
abbrev Fingerprint := PluginSdk.Fingerprint
abbrev Owner := String

structure Claim where
  owner : Owner
  identity : Identity
  deriving DecidableEq, Repr

inductive Observation where
  | absent
  | unknown
  | foreign (basis : Fingerprint)
  | complete (claim : Claim) (basis : Fingerprint)
  | partialPackage (claim : Claim) (basis : Fingerprint)
  deriving DecidableEq, Repr

structure Slots where
  live : Observation
  staged : Observation
  retired : Observation
  deriving DecidableEq, Repr

inductive Operation where
  | install (next : Identity)
  | replace (previous next : Identity)
  | remove (previous : Identity)
  deriving DecidableEq, Repr

structure Input where
  owner : Owner
  operation : Operation
  slots : Slots
  deriving DecidableEq, Repr

inductive Action where
  | prepare
  | discardStage
  | retire
  | publish
  | discardRetired
  deriving DecidableEq, Repr

inductive Reason where
  | unknown
  | unowned
  | operation
  | drift
  | state
  deriving DecidableEq, Repr

inductive Decision where
  | complete
  | step (action : Action)
  | blocked (reason : Reason)
  deriving DecidableEq, Repr

structure Interface where
  advance : Input → Decision

def HasUnknown (slots : Slots) : Prop :=
  slots.live = .unknown ∨ slots.staged = .unknown ∨ slots.retired = .unknown

def ForeignOrMismatchedOwner (owner : Owner) : Observation → Prop
  | .foreign _ => True
  | .complete claim _ => claim.owner ≠ owner
  | .partialPackage claim _ => claim.owner ≠ owner
  | .absent | .unknown => False

def HasUnownedObservation (owner : Owner) (slots : Slots) : Prop :=
  ForeignOrMismatchedOwner owner slots.live ∨
  ForeignOrMismatchedOwner owner slots.staged ∨
  ForeignOrMismatchedOwner owner slots.retired

def CompleteClaim (owner : Owner) (identity : Identity) : Observation → Prop
  | .complete claim _ => claim.owner = owner ∧ claim.identity = identity
  | .absent | .unknown | .foreign _ | .partialPackage _ _ => False

def PartialClaim (owner : Owner) (identity : Identity) : Observation → Prop
  | .partialPackage claim _ => claim.owner = owner ∧ claim.identity = identity
  | .absent | .unknown | .foreign _ | .complete _ _ => False

def ValidOperation : Operation → Prop
  | .install _ | .remove _ => True
  | .replace previous next => previous.plan ≠ next.plan

def LiveRoleValid (owner : Owner) (operation : Operation) (observation : Observation) : Prop :=
  match observation with
  | .absent => True
  | .complete claim _ => claim.owner = owner ∧ match operation with
      | .install next => claim.identity = next
      | .replace previous next => claim.identity = previous ∨ claim.identity = next
      | .remove previous => claim.identity = previous
  | .unknown | .foreign _ | .partialPackage _ _ => False

def StagedRoleValid (owner : Owner) (operation : Operation) (observation : Observation) : Prop :=
  match observation with
  | .absent => True
  | .complete claim _ => claim.owner = owner ∧ match operation with
      | .install next => claim.identity = next
      | .replace _ next => claim.identity = next
      | .remove _ => False
  | .partialPackage claim _ => claim.owner = owner ∧ match operation with
      | .install next => claim.identity = next
      | .replace _ next => claim.identity = next
      | .remove _ => False
  | .unknown | .foreign _ => False

def RetiredRoleValid (owner : Owner) (operation : Operation) (observation : Observation) : Prop :=
  match observation with
  | .absent => True
  | .complete claim _ => claim.owner = owner ∧ match operation with
      | .install _ => False
      | .replace previous _ => claim.identity = previous
      | .remove previous => claim.identity = previous
  | .unknown | .foreign _ | .partialPackage _ _ => False

def RoleValidClaims (owner : Owner) (operation : Operation) (slots : Slots) : Prop :=
  LiveRoleValid owner operation slots.live ∧
  StagedRoleValid owner operation slots.staged ∧
  RetiredRoleValid owner operation slots.retired

def RoleValidKnownOwnedClaims (owner : Owner) (operation : Operation) (slots : Slots) : Prop :=
  ¬ HasUnknown slots ∧ ¬ HasUnownedObservation owner slots ∧
  RoleValidClaims owner operation slots

def InitialLive (owner : Owner) (operation : Operation) (live : Observation) : Prop :=
  match operation with
  | .install _ => live = .absent
  | .replace previous _ => CompleteClaim owner previous live
  | .remove previous => CompleteClaim owner previous live

def DesiredLive (owner : Owner) (operation : Operation) (live : Observation) : Prop :=
  match operation with
  | .install next => CompleteClaim owner next live
  | .replace _ next => CompleteClaim owner next live
  | .remove _ => live = .absent

def StageNextComplete (owner : Owner) (operation : Operation) (staged : Observation) : Prop :=
  match operation with
  | .install next => CompleteClaim owner next staged
  | .replace _ next => CompleteClaim owner next staged
  | .remove _ => False

def StageNextPartial (owner : Owner) (operation : Operation) (staged : Observation) : Prop :=
  match operation with
  | .install next => PartialClaim owner next staged
  | .replace _ next => PartialClaim owner next staged
  | .remove _ => False

def RetiredPreviousComplete (owner : Owner) (operation : Operation) (retired : Observation) : Prop :=
  match operation with
  | .install _ => False
  | .replace previous _ => CompleteClaim owner previous retired
  | .remove previous => CompleteClaim owner previous retired

def PrepareState (input : Input) : Prop :=
  (match input.operation with
   | .install _ | .replace _ _ =>
       InitialLive input.owner input.operation input.slots.live ∧
       input.slots.staged = .absent ∧ input.slots.retired = .absent
   | .remove _ => False)

def DiscardStageState (input : Input) : Prop :=
  InitialLive input.owner input.operation input.slots.live ∧
  StageNextPartial input.owner input.operation input.slots.staged ∧
  input.slots.retired = .absent

def RetireState (input : Input) : Prop :=
  (match input.operation with
   | .replace previous _next =>
       CompleteClaim input.owner previous input.slots.live ∧
       StageNextComplete input.owner input.operation input.slots.staged ∧
       input.slots.retired = .absent
   | .remove previous =>
       CompleteClaim input.owner previous input.slots.live ∧
       input.slots.staged = .absent ∧ input.slots.retired = .absent
   | .install _ => False)

def PublishState (input : Input) : Prop :=
  match input.operation with
  | .install next =>
      input.slots.live = .absent ∧
      CompleteClaim input.owner next input.slots.staged ∧
      input.slots.retired = .absent
  | .replace previous next =>
      input.slots.live = .absent ∧
      CompleteClaim input.owner next input.slots.staged ∧
      CompleteClaim input.owner previous input.slots.retired
  | .remove _ => False

def DiscardRetiredState (input : Input) : Prop :=
  match input.operation with
  | .install _ => False
  | .replace previous _ =>
      DesiredLive input.owner input.operation input.slots.live ∧
      input.slots.staged = .absent ∧
      CompleteClaim input.owner previous input.slots.retired
  | .remove previous =>
      DesiredLive input.owner input.operation input.slots.live ∧
      input.slots.staged = .absent ∧
      CompleteClaim input.owner previous input.slots.retired

def CompletionState (input : Input) : Prop :=
  ValidOperation input.operation ∧
  DesiredLive input.owner input.operation input.slots.live ∧
  input.slots.staged = .absent ∧ input.slots.retired = .absent

def IsBlocked : Decision → Prop
  | .blocked _ => True
  | .complete | .step _ => False

def IsActionOrComplete : Decision → Prop
  | .step _ | .complete => True
  | .blocked _ => False

instance (slots : Slots) : Decidable (HasUnknown slots) := by
  unfold HasUnknown
  infer_instance

instance (owner : Owner) (observation : Observation) :
    Decidable (ForeignOrMismatchedOwner owner observation) := by
  cases observation <;> simp [ForeignOrMismatchedOwner] <;> infer_instance

instance (owner : Owner) (slots : Slots) : Decidable (HasUnownedObservation owner slots) := by
  unfold HasUnownedObservation
  infer_instance

instance (owner : Owner) (identity : Identity) (observation : Observation) :
    Decidable (CompleteClaim owner identity observation) := by
  cases observation <;> simp [CompleteClaim] <;> infer_instance

instance (owner : Owner) (identity : Identity) (observation : Observation) :
    Decidable (PartialClaim owner identity observation) := by
  cases observation <;> simp [PartialClaim] <;> infer_instance

instance (operation : Operation) : Decidable (ValidOperation operation) := by
  cases operation <;> simp [ValidOperation] <;> infer_instance

instance (owner : Owner) (operation : Operation) (observation : Observation) :
    Decidable (LiveRoleValid owner operation observation) := by
  cases operation <;> cases observation <;>
    simp [LiveRoleValid] <;> infer_instance

instance (owner : Owner) (operation : Operation) (observation : Observation) :
    Decidable (StagedRoleValid owner operation observation) := by
  cases operation <;> cases observation <;>
    simp [StagedRoleValid] <;> infer_instance

instance (owner : Owner) (operation : Operation) (observation : Observation) :
    Decidable (RetiredRoleValid owner operation observation) := by
  cases operation <;> cases observation <;>
    simp [RetiredRoleValid] <;> infer_instance

instance (owner : Owner) (operation : Operation) (slots : Slots) :
    Decidable (RoleValidClaims owner operation slots) := by
  unfold RoleValidClaims
  infer_instance

instance (owner : Owner) (operation : Operation) (slots : Slots) :
    Decidable (RoleValidKnownOwnedClaims owner operation slots) := by
  unfold RoleValidKnownOwnedClaims
  infer_instance

instance (owner : Owner) (operation : Operation) (live : Observation) :
    Decidable (InitialLive owner operation live) := by
  cases operation <;> simp [InitialLive] <;> infer_instance

instance (owner : Owner) (operation : Operation) (live : Observation) :
    Decidable (DesiredLive owner operation live) := by
  cases operation <;> simp [DesiredLive] <;> infer_instance

instance (owner : Owner) (operation : Operation) (staged : Observation) :
    Decidable (StageNextComplete owner operation staged) := by
  cases operation <;> simp [StageNextComplete] <;> infer_instance

instance (owner : Owner) (operation : Operation) (staged : Observation) :
    Decidable (StageNextPartial owner operation staged) := by
  cases operation <;> simp [StageNextPartial] <;> infer_instance

instance (owner : Owner) (operation : Operation) (retired : Observation) :
    Decidable (RetiredPreviousComplete owner operation retired) := by
  cases operation <;> simp [RetiredPreviousComplete] <;> infer_instance

instance (input : Input) : Decidable (PrepareState input) := by
  cases input with
  | mk owner operation slots =>
      cases operation <;> simp [PrepareState] <;> infer_instance

instance (input : Input) : Decidable (DiscardStageState input) := by
  cases input with
  | mk owner operation slots =>
      cases operation <;> simp [DiscardStageState] <;> infer_instance

instance (input : Input) : Decidable (RetireState input) := by
  cases input with
  | mk owner operation slots =>
      cases operation <;> simp [RetireState] <;> infer_instance

instance (input : Input) : Decidable (PublishState input) := by
  cases input with
  | mk owner operation slots =>
      cases operation <;> simp [PublishState] <;> infer_instance

instance (input : Input) : Decidable (DiscardRetiredState input) := by
  cases input with
  | mk owner operation slots =>
      cases operation <;> simp [DiscardRetiredState] <;> infer_instance

instance (input : Input) : Decidable (CompletionState input) := by
  cases input with
  | mk owner operation slots =>
      cases operation <;> simp [CompletionState] <;> infer_instance

end PluginSdk.Installer.LocalSlot
