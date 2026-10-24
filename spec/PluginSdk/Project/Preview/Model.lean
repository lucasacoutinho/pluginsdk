import PluginSdk.Project.Preview.Types

namespace PluginSdk.Project.Preview

def route (input : RouteInput) : Route :=
  match input.client, input.desired, input.provider with
  | .claudeCode, desired, _ => .direct .claudeCode desired
  | .codex, desired, _ => .direct .codex desired
  | .cursor, .absent, _ => .direct .cursor .absent
  | .cursor, .present, .none => .direct .cursor .present
  | .cursor, .present, .qualified => .inherited
  | .cursor, .present, .unqualified => .blocked

def mayApplyInherited : LocalStatus → Bool
  | .installed => true
  | .unchanged => true
  | .missing => false
  | .removed => false
  | .notApplied => false
  | .uncertain => false

def localAbsenceConfirmedBool : LocalStatus → Bool
  | .removed => true
  | .unchanged => true
  | .missing => false
  | .installed => false
  | .notApplied => false
  | .uncertain => false

def finish : CompletionInput → Completion
  | .direct status => status.toCompletion
  | .inherited provider cleanup =>
      if mayApplyInherited provider && localAbsenceConfirmedBool cleanup then .inherited
      else if provider = .uncertain ∨ cleanup = .uncertain then .uncertain
      else .notApplied

def model : Interface := ⟨route, mayApplyInherited, finish⟩

end PluginSdk.Project.Preview
