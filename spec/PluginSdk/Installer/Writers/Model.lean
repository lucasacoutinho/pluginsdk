import PluginSdk.Installer.Writers.Types

namespace PluginSdk.Installer.Writers

def observeWriter (input : ObservationInput) : Observation :=
  ⟨input.writer, match input.lookup with
    | .opened actual state =>
      if actual.pid ≠ input.writer.pid then .unknown
      else if actual.creation ≠ input.writer.creation then .terminated
      else state
    | .missing pid => if pid = input.writer.pid then .terminated else .unknown
    | .unavailable => .unknown⟩

def writerCompletion (input : CompletionInput) : Completion :=
  if ActiveEvidence input then .active
  else if CompleteEvidence input then .complete
  else .unknown

def priorOwnerCompletion (input : PriorOwnersInput) : Completion :=
  writerCompletion input.foreign

def writerStep (input : GateInput) : GateStep :=
  match input.state, input.signal with
  | .open writers, .birth writer =>
      if ValidAdmission writers writer then
        ⟨.retaining writers writer, .retain (writers ++ [writer])⟩
      else ⟨.stopped writers, .stop⟩
  | .open writers, .retained _ | .open writers, .failed | .open writers, .stop =>
      ⟨.stopped writers, .stop⟩
  | .open writers, .close observed =>
      match writerCompletion ⟨writers, observed⟩ with
      | .complete => ⟨.closed writers, .complete⟩
      | .active => ⟨.open writers, .wait .active⟩
      | .unknown => ⟨.open writers, .wait .unknown⟩
  | .retaining writers writer, .retained retained =>
      if ValidAdmission writers writer ∧ retained = writers ++ [writer] then
        ⟨.open (writers ++ [writer]), .resume writer⟩
      else ⟨.stopped writers, .stop⟩
  | .retaining writers _, .birth _ | .retaining writers _, .failed
  | .retaining writers _, .close _ | .retaining writers _, .stop =>
      ⟨.stopped writers, .stop⟩
  | .closed writers, _ => ⟨.closed writers, .stop⟩
  | .stopped writers, _ => ⟨.stopped writers, .stop⟩

def model : Interface := ⟨writerStep, writerCompletion, observeWriter, priorOwnerCompletion⟩

end PluginSdk.Installer.Writers
