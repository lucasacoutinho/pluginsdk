namespace PluginSdk.Installer.ProjectConfig

inductive Segment where
  | external (content : String)
  | managed (key content : String)
  deriving DecidableEq

structure Input where
  key : String
  previous : Option String
  desired : Option String
  document : List Segment

inductive Reason where
  | duplicate
  | unowned
  | drift
  deriving DecidableEq

inductive Result where
  | ready (document : List Segment)
  | blocked (reason : Reason)
  deriving DecidableEq

structure Interface where
  edit : Input → Result

def BelongsTo (key : String) : Segment → Bool
  | .external _ => false
  | .managed owner _ => owner == key

def Owned (key : String) (document : List Segment) : List String :=
  document.filterMap fun segment => match segment with
    | .external _ => none
    | .managed owner content => if owner = key then some content else none

def Foreign (key : String) (document : List Segment) : List Segment :=
  document.filter fun segment => !BelongsTo key segment

def Safe (input : Input) : Prop := Owned input.key input.document = input.previous.toList

instance (input : Input) : Decidable (Safe input) := by
  unfold Safe
  infer_instance

def RequiredReason (input : Input) : Reason → Prop
  | .duplicate => 1 < (Owned input.key input.document).length
  | .unowned => (Owned input.key input.document).length ≤ 1 ∧
      input.previous = none ∧ Owned input.key input.document ≠ []
  | .drift => (Owned input.key input.document).length ≤ 1 ∧
      input.previous ≠ none ∧ ¬Safe input

end PluginSdk.Installer.ProjectConfig
