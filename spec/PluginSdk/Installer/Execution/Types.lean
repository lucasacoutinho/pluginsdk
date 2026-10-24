namespace PluginSdk.Installer.Execution

structure ProcessId where
  value : Nat
  deriving DecidableEq, Repr

structure BootId where
  value : String
  deriving DecidableEq, Repr

structure JobName where
  value : String
  deriving DecidableEq, Repr

inductive ProcessDomain where
  | processGroup (group : ProcessId) (boot : BootId)
  | windowsJob (name : JobName)
  deriving DecidableEq, Repr

inductive ProcessGroupState where
  | present
  | absent
  deriving DecidableEq, Repr

inductive WindowsJobState where
  | active
  | empty
  | absent
  deriving DecidableEq, Repr

inductive DomainObservation where
  | unknown
  | boot (boot : BootId)
  | processGroup (group : ProcessId) (boot : BootId) (state : ProcessGroupState)
  | windowsJob (name : JobName) (state : WindowsJobState)
  deriving DecidableEq, Repr

inductive DomainStatus where
  | quiescent
  | active
  | unknown
  deriving DecidableEq, Repr

structure StatusInput where
  domain : ProcessDomain
  observed : DomainObservation
  deriving DecidableEq, Repr

def QuietEvidence (input : StatusInput) : Prop :=
  match input.domain, input.observed with
  | .processGroup _ boot, .boot observedBoot => observedBoot ≠ boot
  | .processGroup group boot, .processGroup observedGroup observedBoot .absent =>
      group = observedGroup ∧ boot = observedBoot
  | _, _ => False

def ActiveEvidence (input : StatusInput) : Prop :=
  match input.domain, input.observed with
  | .processGroup group boot, .processGroup observedGroup observedBoot .present =>
      group = observedGroup ∧ boot = observedBoot
  | .windowsJob name, .windowsJob observedName .active => name = observedName
  | _, _ => False

structure Interface where
  status : StatusInput → DomainStatus

end PluginSdk.Installer.Execution
