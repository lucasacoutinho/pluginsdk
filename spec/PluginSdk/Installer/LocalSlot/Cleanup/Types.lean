import PluginSdk.Installer.LocalSlot.Types

namespace PluginSdk.Installer.LocalSlot.Cleanup

inductive Role where
  | live
  | staged
  | retired
  deriving DecidableEq, Repr

inductive Decision where
  | complete
  | step (role : Role)
  | blocked (reason : Reason)
  deriving DecidableEq, Repr

structure Interface where
  cleanup : Input → Decision

def Admitted (input : Input) : Prop :=
  ValidOperation input.operation ∧
  RoleValidKnownOwnedClaims input.owner input.operation input.slots

def Empty (slots : Slots) : Prop :=
  slots.live = .absent ∧ slots.staged = .absent ∧ slots.retired = .absent

def atRole (slots : Slots) : Role → Observation
  | .live => slots.live
  | .staged => slots.staged
  | .retired => slots.retired

def clear (slots : Slots) : Role → Slots
  | .live => { slots with live := .absent }
  | .staged => { slots with staged := .absent }
  | .retired => { slots with retired := .absent }

def occupied : Observation → Nat
  | .absent => 0
  | .unknown | .foreign _ | .complete _ _ | .partialPackage _ _ => 1

def count (slots : Slots) : Nat :=
  occupied slots.live + occupied slots.staged + occupied slots.retired

def simulate (model : Interface) : Nat → Input → Input
  | 0, input => input
  | n + 1, input => match model.cleanup input with
    | .step role => simulate model n { input with slots := clear input.slots role }
    | .complete | .blocked _ => input

instance (input : Input) : Decidable (Admitted input) := by
  unfold Admitted
  infer_instance

instance (slots : Slots) : Decidable (Empty slots) := by
  unfold Empty
  infer_instance

end PluginSdk.Installer.LocalSlot.Cleanup
