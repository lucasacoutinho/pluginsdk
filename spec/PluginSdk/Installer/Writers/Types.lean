import PluginSdk.Installer.Execution.Types

namespace PluginSdk.Installer.Writers

open PluginSdk.Installer.Execution (ProcessId)

structure CreationTime where
  value : String
  deriving DecidableEq, Repr

structure Writer where
  pid : ProcessId
  creation : CreationTime
  deriving DecidableEq, Repr

inductive ProcessState where
  | terminated | active | unknown
  deriving DecidableEq, Repr

structure Observation where
  writer : Writer
  state : ProcessState
  deriving DecidableEq, Repr

inductive Lookup where
  | opened (writer : Writer) (state : ProcessState)
  | missing (pid : ProcessId)
  | unavailable
  deriving DecidableEq, Repr

def Lookup.pid : Lookup → Option ProcessId
  | .opened writer _ => some writer.pid
  | .missing pid => some pid
  | .unavailable => none

structure ObservationInput where
  writer : Writer
  lookup : Lookup
  deriving DecidableEq, Repr

def LookupTerminated (input : ObservationInput) : Prop :=
  match input.lookup with
  | .opened actual state =>
    actual.pid = input.writer.pid ∧
      (actual.creation ≠ input.writer.creation ∨ state = .terminated)
  | .missing pid => pid = input.writer.pid
  | .unavailable => False

def LookupActive (input : ObservationInput) : Prop :=
  match input.lookup with
  | .opened actual state => actual = input.writer ∧ state = .active
  | .missing _ | .unavailable => False

structure CompletionInput where
  writers : List Writer
  observed : List Observation
  deriving DecidableEq, Repr

structure PriorOwnersInput where
  current : Writer
  owners : List Writer
  observed : List Observation
  deriving DecidableEq, Repr

def PriorOwnersInput.foreign (input : PriorOwnersInput) : CompletionInput :=
  ⟨input.owners.filter (fun writer => writer != input.current), input.observed⟩

inductive Completion where
  | complete | active | unknown
  deriving DecidableEq, Repr

def ActiveEvidence (input : CompletionInput) : Prop :=
  ∃ observed ∈ input.observed,
    observed.writer ∈ input.writers ∧ observed.state = .active

def CompleteEvidence (input : CompletionInput) : Prop :=
  input.writers.Nodup ∧ ∀ writer ∈ input.writers,
    input.observed.filter (fun observed => observed.writer == writer) = [⟨writer, .terminated⟩]

def ValidAdmission (writers : List Writer) (writer : Writer) : Prop :=
  writers.Nodup ∧ writer ∉ writers

instance (input : CompletionInput) : Decidable (ActiveEvidence input) := by
  unfold ActiveEvidence
  infer_instance

instance (input : CompletionInput) : Decidable (CompleteEvidence input) := by
  unfold CompleteEvidence
  infer_instance

instance (writers : List Writer) (writer : Writer) : Decidable (ValidAdmission writers writer) := by
  unfold ValidAdmission
  infer_instance

inductive GateState where
  | open (writers : List Writer)
  | retaining (writers : List Writer) (writer : Writer)
  | closed (writers : List Writer)
  | stopped (writers : List Writer)
  deriving DecidableEq, Repr

def GateState.writers : GateState → List Writer
  | .open writers | .retaining writers _ | .closed writers | .stopped writers => writers

def GateState.Terminal : GateState → Prop
  | .closed _ | .stopped _ => True
  | .open _ | .retaining _ _ => False

inductive GateSignal where
  | birth (writer : Writer)
  | retained (writers : List Writer)
  | failed
  | close (observed : List Observation)
  | stop
  deriving DecidableEq, Repr

inductive WaitReason where
  | active | unknown
  deriving DecidableEq, Repr

inductive GateAction where
  | retain (writers : List Writer)
  | resume (writer : Writer)
  | wait (reason : WaitReason)
  | complete
  | stop
  deriving DecidableEq, Repr

structure GateInput where
  state : GateState
  signal : GateSignal
  deriving DecidableEq, Repr

structure GateStep where
  state : GateState
  action : GateAction
  deriving DecidableEq, Repr

structure Interface where
  step : GateInput → GateStep
  completion : CompletionInput → Completion
  observe : ObservationInput → Observation
  priorOwners : PriorOwnersInput → Completion

def traceState (interface : Interface) (state : GateState) : List GateSignal → GateState
  | [] => state
  | signal :: rest => traceState interface (interface.step ⟨state, signal⟩).state rest

def ResumedDuring (interface : Interface) (state : GateState) (signals : List GateSignal) (writer : Writer) : Prop :=
  match signals with
  | [] => False
  | signal :: rest =>
    (interface.step ⟨state, signal⟩).action = .resume writer ∨
      ResumedDuring interface (interface.step ⟨state, signal⟩).state rest writer

end PluginSdk.Installer.Writers
