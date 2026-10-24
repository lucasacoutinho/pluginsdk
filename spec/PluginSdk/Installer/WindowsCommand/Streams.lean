import Init.Data.List.Basic

namespace PluginSdk.Installer.WindowsCommand.Streams

inductive InputState where
  | open (remaining : Nat)
  | closed (remaining : Nat)
  deriving BEq, DecidableEq, Repr

def InputState.remaining : InputState → Nat
  | .open remaining | .closed remaining => remaining

def InputState.isOpen : InputState → Bool
  | .open _ => true
  | .closed _ => false

structure StreamState where
  input : InputState
  outputRemaining : Nat
  deriving BEq, DecidableEq, Repr

inductive StreamSignal where
  | input (bytes : Nat)
  | output (bytes : Nat)
  | endInput
  deriving BEq, DecidableEq, Repr

inductive BlockedReason where
  | inputClosed
  | inputLimit
  | outputLimit
  deriving BEq, DecidableEq, Repr

inductive StreamAction where
  | accepted
  | closeInput
  | ignore
  | blocked (reason : BlockedReason)
  deriving BEq, DecidableEq, Repr

structure StreamInput where
  state : StreamState
  signal : StreamSignal
  deriving BEq, DecidableEq, Repr

structure StreamStep where
  state : StreamState
  action : StreamAction
  deriving BEq, DecidableEq, Repr

inductive IoPhase where
  | pending
  | cancelling
  | terminal
  | released
  deriving BEq, DecidableEq, Repr

inductive IoSignal where
  | cancel
  | completed
  | release
  deriving BEq, DecidableEq, Repr

inductive IoAction where
  | cancel
  | wait
  | release
  | ignore
  deriving BEq, DecidableEq, Repr

structure IoInput where
  phase : IoPhase
  signal : IoSignal
  deriving BEq, DecidableEq, Repr

structure IoStep where
  phase : IoPhase
  action : IoAction
  deriving BEq, DecidableEq, Repr

structure Interface where
  stream : StreamInput → StreamStep
  io : IoInput → IoStep

private def inputCharge : StreamSignal → StreamAction → Nat
  | .input bytes, .accepted => bytes
  | _, _ => 0

private def outputCharge : StreamSignal → StreamAction → Nat
  | .output bytes, .accepted => bytes
  | _, _ => 0

structure StreamTrace where
  state : StreamState
  inputBytes : Nat
  outputBytes : Nat

def streamTrace (interface : Interface) (state : StreamState) : List StreamSignal → StreamTrace
  | [] => ⟨state, 0, 0⟩
  | signal :: rest =>
      let next := interface.stream ⟨state, signal⟩
      let tail := streamTrace interface next.state rest
      ⟨tail.state, inputCharge signal next.action + tail.inputBytes,
        outputCharge signal next.action + tail.outputBytes⟩

structure IoTrace where
  phase : IoPhase
  releases : Nat

def ioTrace (interface : Interface) (phase : IoPhase) : List IoSignal → IoTrace
  | [] => ⟨phase, 0⟩
  | signal :: rest =>
      let next := interface.io ⟨phase, signal⟩
      let tail := ioTrace interface next.phase rest
      ⟨tail.phase, (if next.action = .release then 1 else 0) + tail.releases⟩

def IoPhase.Active (phase : IoPhase) : Prop := phase = .pending ∨ phase = .cancelling

def Q3_stream_conservation (interface : Interface) : Prop :=
  ∀ state signals,
    let trace := streamTrace interface state signals
    state.input.remaining = trace.state.input.remaining + trace.inputBytes ∧
      state.outputRemaining = trace.state.outputRemaining + trace.outputBytes

def Q4_stream_admission (interface : Interface) : Prop :=
  (∀ state bytes, (interface.stream ⟨state, .input bytes⟩).action = .accepted ↔
    state.input.isOpen = true ∧ bytes ≤ state.input.remaining) ∧
  (∀ state bytes, (interface.stream ⟨state, .output bytes⟩).action = .accepted ↔
    bytes ≤ state.outputRemaining) ∧
  (∀ input reason, (interface.stream input).action = .blocked reason →
    (interface.stream input).state = input.state)

def Q5_input_close_once (interface : Interface) : Prop :=
  ∀ state, interface.stream ⟨state, .endInput⟩ =
    ⟨⟨.closed state.input.remaining, state.outputRemaining⟩,
      if state.input.isOpen then .closeInput else .ignore⟩

def Q6_input_stays_closed (interface : Interface) : Prop :=
  ∀ state signals, state.input.isOpen = false →
    (streamTrace interface state signals).state.input.isOpen = false

def Q7_io_release_exact (interface : Interface) : Prop :=
  (∀ input, (interface.io input).action = .release ↔
    input.phase = .terminal ∧ input.signal = .release) ∧
  (∀ phase, phase.Active → interface.io ⟨phase, .completed⟩ = ⟨.terminal, .wait⟩) ∧
  interface.io ⟨.terminal, .release⟩ = ⟨.released, .release⟩

def Q8_io_cancellation_waits (interface : Interface) : Prop :=
  interface.io ⟨.pending, .cancel⟩ = ⟨.cancelling, .cancel⟩ ∧
  interface.io ⟨.cancelling, .cancel⟩ = ⟨.cancelling, .wait⟩ ∧
  (∀ phase signals, phase.Active → (∀ signal ∈ signals, signal ≠ .completed) →
    (ioTrace interface phase signals).phase.Active ∧
      (ioTrace interface phase signals).releases = 0)

def Q9_io_released_absorbs (interface : Interface) : Prop :=
  ∀ signal, interface.io ⟨.released, signal⟩ = ⟨.released, .ignore⟩

def Q10_io_release_once (interface : Interface) : Prop :=
  ∀ phase signals, (ioTrace interface phase signals).releases ≤ 1

def stream (input : StreamInput) : StreamStep :=
  match input.signal with
  | .input bytes =>
      match input.state.input with
      | .open remaining =>
          if bytes ≤ remaining then
            ⟨⟨.open (remaining - bytes), input.state.outputRemaining⟩, .accepted⟩
          else
            ⟨input.state, .blocked .inputLimit⟩
      | .closed _ => ⟨input.state, .blocked .inputClosed⟩
  | .output bytes =>
      if bytes ≤ input.state.outputRemaining then
        ⟨⟨input.state.input, input.state.outputRemaining - bytes⟩, .accepted⟩
      else
        ⟨input.state, .blocked .outputLimit⟩
  | .endInput =>
      ⟨⟨.closed input.state.input.remaining, input.state.outputRemaining⟩,
        if input.state.input.isOpen then .closeInput else .ignore⟩

def io (input : IoInput) : IoStep :=
  match input.phase, input.signal with
  | .pending, .cancel => ⟨.cancelling, .cancel⟩
  | .pending, .completed => ⟨.terminal, .wait⟩
  | .pending, .release => ⟨.pending, .wait⟩
  | .cancelling, .cancel => ⟨.cancelling, .wait⟩
  | .cancelling, .completed => ⟨.terminal, .wait⟩
  | .cancelling, .release => ⟨.cancelling, .wait⟩
  | .terminal, .cancel => ⟨.terminal, .ignore⟩
  | .terminal, .completed => ⟨.terminal, .ignore⟩
  | .terminal, .release => ⟨.released, .release⟩
  | .released, .cancel => ⟨.released, .ignore⟩
  | .released, .completed => ⟨.released, .ignore⟩
  | .released, .release => ⟨.released, .ignore⟩

def model : Interface := ⟨stream, io⟩

private theorem streamStep_conservation (state : StreamState) (signal : StreamSignal) :
    state.input.remaining =
        (model.stream ⟨state, signal⟩).state.input.remaining +
          inputCharge signal (model.stream ⟨state, signal⟩).action ∧
      state.outputRemaining =
        (model.stream ⟨state, signal⟩).state.outputRemaining +
          outputCharge signal (model.stream ⟨state, signal⟩).action := by
  cases signal with
  | input bytes =>
      cases inputState : state.input with
      | «open» remaining =>
          by_cases fits : bytes ≤ remaining
          · have balance : remaining - bytes + bytes = remaining := Nat.sub_add_cancel fits
            simp [model, stream, inputState, fits, inputCharge, outputCharge,
              InputState.remaining, balance]
          · simp [model, stream, inputState, fits, inputCharge, outputCharge,
              InputState.remaining]
      | closed remaining =>
          simp [model, stream, inputState, inputCharge, outputCharge, InputState.remaining]
  | output bytes =>
      by_cases fits : bytes ≤ state.outputRemaining
      · have balance : state.outputRemaining - bytes + bytes = state.outputRemaining :=
          Nat.sub_add_cancel fits
        simp [model, stream, fits, inputCharge, outputCharge, InputState.remaining, balance]
      · simp [model, stream, fits, inputCharge, outputCharge, InputState.remaining]
  | endInput =>
      cases inputState : state.input <;>
        simp [model, stream, inputState, inputCharge, outputCharge,
          InputState.remaining, InputState.isOpen]

private theorem streamStep_preserves_closed (state : StreamState) (signal : StreamSignal)
    (closed : state.input.isOpen = false) :
    (model.stream ⟨state, signal⟩).state.input.isOpen = false := by
  cases signal with
  | input bytes =>
      cases inputState : state.input with
      | «open» remaining => simp [inputState, InputState.isOpen] at closed
      | closed remaining => simp [model, stream, inputState, InputState.isOpen]
  | output bytes =>
      by_cases fits : bytes ≤ state.outputRemaining
      · simp [model, stream, fits, closed]
      · simp [model, stream, fits, closed]
  | endInput =>
      cases inputState : state.input with
      | «open» remaining => simp [inputState, InputState.isOpen] at closed
      | closed remaining => simp [model, stream, inputState, InputState.isOpen]

private theorem ioTrace_active_without_completion (phase : IoPhase) (signals : List IoSignal)
    (active : phase.Active) (noCompletion : ∀ signal ∈ signals, signal ≠ .completed) :
    (ioTrace model phase signals).phase.Active ∧ (ioTrace model phase signals).releases = 0 := by
  induction signals generalizing phase with
  | nil => simp [ioTrace, active]
  | cons signal rest ih =>
      have headNotCompleted : signal ≠ .completed := noCompletion signal (by simp)
      have tailNoCompletion : ∀ next ∈ rest, next ≠ .completed := by
        intro next member
        exact noCompletion next (by simp [member])
      rcases active with pending | cancelling
      · subst phase
        cases signal with
        | cancel =>
            have tail := ih .cancelling (by simp [IoPhase.Active]) tailNoCompletion
            simpa [model, io, ioTrace, IoPhase.Active] using tail
        | completed => exact False.elim (headNotCompleted rfl)
        | release =>
            have tail := ih .pending (by simp [IoPhase.Active]) tailNoCompletion
            simpa [model, io, ioTrace, IoPhase.Active] using tail
      · subst phase
        cases signal with
        | cancel =>
            have tail := ih .cancelling (by simp [IoPhase.Active]) tailNoCompletion
            simpa [model, io, ioTrace, IoPhase.Active] using tail
        | completed => exact False.elim (headNotCompleted rfl)
        | release =>
            have tail := ih .cancelling (by simp [IoPhase.Active]) tailNoCompletion
            simpa [model, io, ioTrace, IoPhase.Active] using tail

private theorem ioTrace_released_empty (signals : List IoSignal) :
    (ioTrace model .released signals).releases = 0 := by
  induction signals with
  | nil => rfl
  | cons signal rest ih =>
      have step : model.io ⟨.released, signal⟩ = ⟨.released, .ignore⟩ := by
        cases signal <;> rfl
      simp [ioTrace, step, ih]

namespace Proofs

theorem Q3_stream_conservation : Q3_stream_conservation model := by
  intro state signals
  induction signals generalizing state with
  | nil => simp [streamTrace]
  | cons signal rest ih =>
      let next := model.stream ⟨state, signal⟩
      have tail := ih next.state
      rcases tail with ⟨tailInput, tailOutput⟩
      have step := streamStep_conservation state signal
      change state.input.remaining =
          (streamTrace model next.state rest).state.input.remaining +
            (inputCharge signal next.action + (streamTrace model next.state rest).inputBytes) ∧
        state.outputRemaining =
          (streamTrace model next.state rest).state.outputRemaining +
            (outputCharge signal next.action + (streamTrace model next.state rest).outputBytes)
      constructor
      · calc
          state.input.remaining = next.state.input.remaining +
              inputCharge signal next.action := step.1
          _ = ((streamTrace model next.state rest).state.input.remaining +
                (streamTrace model next.state rest).inputBytes) +
              inputCharge signal next.action := by rw [tailInput]
          _ = (streamTrace model next.state rest).state.input.remaining +
                (inputCharge signal next.action + (streamTrace model next.state rest).inputBytes) := by
            rw [Nat.add_assoc, Nat.add_comm (streamTrace model next.state rest).inputBytes
              (inputCharge signal next.action)]
      · calc
          state.outputRemaining = next.state.outputRemaining +
              outputCharge signal next.action := step.2
          _ = ((streamTrace model next.state rest).state.outputRemaining +
                (streamTrace model next.state rest).outputBytes) +
              outputCharge signal next.action := by rw [tailOutput]
          _ = (streamTrace model next.state rest).state.outputRemaining +
                (outputCharge signal next.action + (streamTrace model next.state rest).outputBytes) := by
            rw [Nat.add_assoc, Nat.add_comm (streamTrace model next.state rest).outputBytes
              (outputCharge signal next.action)]

theorem Q4_stream_admission : Q4_stream_admission model := by
  constructor
  · intro state bytes
    cases inputState : state.input with
    | «open» remaining =>
        by_cases fits : bytes ≤ remaining <;>
          simp [model, stream, inputState, InputState.isOpen, InputState.remaining, fits]
    | closed remaining => simp [model, stream, inputState, InputState.isOpen, InputState.remaining]
  constructor
  · intro state bytes
    by_cases fits : bytes ≤ state.outputRemaining <;> simp [model, stream, fits]
  · intro input reason blocked
    rcases input with ⟨state, signal⟩
    cases signal with
    | input bytes =>
        cases inputState : state.input with
        | «open» remaining =>
            by_cases fits : bytes ≤ remaining
            · simp [model, stream, inputState, fits] at blocked
            · simp [model, stream, inputState, fits] at blocked ⊢
        | closed remaining => simp [model, stream, inputState] at blocked ⊢
    | output bytes =>
        by_cases fits : bytes ≤ state.outputRemaining
        · simp [model, stream, fits] at blocked
        · simp [model, stream, fits] at blocked ⊢
    | endInput =>
        by_cases isOpen : state.input.isOpen = true
        · simp [model, stream, isOpen] at blocked
        · simp [model, stream, isOpen] at blocked

theorem Q5_input_close_once : Q5_input_close_once model := by
  intro state
  cases inputState : state.input <;>
    simp [model, stream, inputState, InputState.remaining, InputState.isOpen]

theorem Q6_input_stays_closed : Q6_input_stays_closed model := by
  intro state signals
  induction signals generalizing state with
  | nil => simp [streamTrace]
  | cons signal rest ih =>
      intro closed
      simp only [streamTrace]
      apply ih
      exact streamStep_preserves_closed state signal closed

theorem Q7_io_release_exact : Q7_io_release_exact model := by
  constructor
  · intro input
    cases input with
    | mk phase signal => cases phase <;> cases signal <;> simp [model, io]
  constructor
  · intro phase active
    cases phase <;> simp_all [IoPhase.Active, model, io]
  · rfl

theorem Q8_io_cancellation_waits : Q8_io_cancellation_waits model := by
  constructor
  · rfl
  constructor
  · rfl
  · exact ioTrace_active_without_completion

theorem Q9_io_released_absorbs : Q9_io_released_absorbs model := by
  intro signal
  cases signal <;> rfl

theorem Q10_io_release_once : Q10_io_release_once model := by
  intro phase signals
  induction signals generalizing phase with
  | nil => simp [ioTrace]
  | cons signal rest ih =>
      cases phase with
      | pending =>
          cases signal with
          | cancel => simpa [ioTrace, model, io] using ih .cancelling
          | completed => simpa [ioTrace, model, io] using ih .terminal
          | release => simpa [ioTrace, model, io] using ih .pending
      | cancelling =>
          cases signal with
          | cancel => simpa [ioTrace, model, io] using ih .cancelling
          | completed => simpa [ioTrace, model, io] using ih .terminal
          | release => simpa [ioTrace, model, io] using ih .cancelling
      | terminal =>
          cases signal with
          | cancel => simpa [ioTrace, model, io] using ih .terminal
          | completed => simpa [ioTrace, model, io] using ih .terminal
          | release =>
              have step : model.io ⟨.terminal, .release⟩ = ⟨.released, .release⟩ := rfl
              change (if (model.io ⟨.terminal, .release⟩).action = .release then 1 else 0) +
                (ioTrace model (model.io ⟨.terminal, .release⟩).phase rest).releases ≤ 1
              rw [step]
              simp [ioTrace_released_empty]
      | released =>
          have step : model.io ⟨.released, signal⟩ = ⟨.released, .ignore⟩ := by
            cases signal <;> rfl
          change (if (model.io ⟨.released, signal⟩).action = .release then 1 else 0) +
            (ioTrace model (model.io ⟨.released, signal⟩).phase rest).releases ≤ 1
          rw [step]
          simp [ioTrace_released_empty]

end Proofs

end PluginSdk.Installer.WindowsCommand.Streams
