namespace PluginSdk.Publication

structure Publication where
  plugin : String
  version : String
  digest : String
  deriving DecidableEq

def Publication.key (entry : Publication) : String × String := (entry.plugin, entry.version)

structure Input where
  history : List Publication
  desired : Publication

def ValidHistory (history : List Publication) : Prop := (history.map Publication.key).Nodup

instance (history : List Publication) : Decidable (ValidHistory history) := by
  unfold ValidHistory
  infer_instance

def HasKey (input : Input) : Prop := ∃ entry ∈ input.history, entry.key = input.desired.key

instance (input : Input) : Decidable (HasKey input) := by
  unfold HasKey
  infer_instance

inductive Reason where
  | duplicate
  | versionConflict
  deriving DecidableEq

inductive Result where
  | published (history : List Publication)
  | unchanged (history : List Publication)
  | blocked (reason : Reason)
  deriving DecidableEq

structure Interface where
  publish : Input → Result

def RequiredReason (input : Input) : Reason → Prop
  | .duplicate => ¬ValidHistory input.history
  | .versionConflict => ValidHistory input.history ∧ HasKey input ∧ input.desired ∉ input.history

end PluginSdk.Publication
