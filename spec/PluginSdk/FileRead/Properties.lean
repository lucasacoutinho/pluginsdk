import PluginSdk.FileRead.Paths

namespace PluginSdk.FileRead

def Available (input : ReadInput) : Prop :=
  match input.before.root, input.after.root, input.before.file, input.after.file, input.read with
  | .directory _, .directory _, .unavailable, _, _ => False
  | .directory _, .directory _, _, .unavailable, _ => False
  | .directory _, .directory _, _, _, .complete _ => True
  | _, _, _, _, _ => False

def RegularFiles (input : ReadInput) : Prop :=
  match input.before.file, input.after.file with
  | .file _, .file _ => True
  | _, _ => False

def UnsupportedPath (input : ReadInput) : Prop :=
  ∃ raw ∈ input.paths, parsePath raw = .unsupported

def StreamPath (input : ReadInput) : Prop :=
  ∃ raw ∈ input.paths, parsePath raw = .stream

def RootBound (input : ReadInput) : Prop :=
  match input.before.root, input.after.root with
  | .directory before, .directory after =>
    before.identity = input.root.identity ∧ after.identity = input.root.identity ∧
      before.caseSensitive = input.root.caseSensitive ∧
      after.caseSensitive = input.root.caseSensitive ∧
      EquivalentPaths input.root.path before.path ∧ EquivalentPaths input.root.path after.path
  | _, _ => False

def FilesContained (input : ReadInput) : Prop :=
  match input.before.file, input.after.file with
  | .file before, .file after =>
    before.identity.volume = input.root.identity.volume ∧
      after.identity.volume = input.root.identity.volume ∧
      ContainedPaths input.root.path before.path ∧ ContainedPaths input.root.path after.path
  | _, _ => False

def StableRead (input : ReadInput) : Prop :=
  match input.before.file, input.after.file, input.read with
  | .file before, .file after, .complete length =>
    before.identity = after.identity ∧ EquivalentPaths before.path after.path ∧
      before.size = after.size ∧ before.modified = after.modified ∧
      before.changed = after.changed ∧ length = before.size
  | _, _, _ => False

def Admissible (input : ReadInput) : Prop :=
  Available input ∧ RegularFiles input ∧ ¬ UnsupportedPath input ∧ ¬ StreamPath input ∧
    RootBound input ∧ FilesContained input ∧ StableRead input

instance (input : ReadInput) : Decidable (Available input) := by unfold Available; split <;> infer_instance
instance (input : ReadInput) : Decidable (RegularFiles input) := by unfold RegularFiles; split <;> infer_instance
instance (input : ReadInput) : Decidable (UnsupportedPath input) := by unfold UnsupportedPath; infer_instance
instance (input : ReadInput) : Decidable (StreamPath input) := by unfold StreamPath; infer_instance
instance (input : ReadInput) : Decidable (RootBound input) := by unfold RootBound; split <;> infer_instance
instance (input : ReadInput) : Decidable (FilesContained input) := by unfold FilesContained; split <;> infer_instance
instance (input : ReadInput) : Decidable (StableRead input) := by unfold StableRead; split <;> infer_instance

def V1_plain_parse_exact (model : Interface) : Prop :=
  ∀ raw path, model.parsePath raw = .plain path ↔ PlainEvidence raw path
def V2_containment_exact (model : Interface) : Prop :=
  ∀ root file, model.inside root file = true ↔ Contained root file
def V3_admission_exact (model : Interface) : Prop :=
  ∀ input, model.admit input = .accepted ↔ Admissible input
def V4_unavailable_refuses (model : Interface) : Prop :=
  ∀ input, ¬ Available input → model.admit input ≠ .accepted
def V5_stream_refuses (model : Interface) : Prop :=
  ∀ input, StreamPath input → model.admit input ≠ .accepted
def V6_root_change_refuses (model : Interface) : Prop :=
  ∀ input, ¬ RootBound input → model.admit input ≠ .accepted
def V7_escape_refuses (model : Interface) : Prop :=
  ∀ input, ¬ FilesContained input → model.admit input ≠ .accepted
def V8_metadata_change_refuses (model : Interface) : Prop :=
  ∀ input, ¬ StableRead input → model.admit input ≠ .accepted
def V9_non_regular_refuses (model : Interface) : Prop :=
  ∀ input, ¬ RegularFiles input → model.admit input ≠ .accepted
def V10_identity_alone_insufficient (model : Interface) : Prop :=
  ∃ input before after length,
    Available input ∧ RootBound input ∧
    input.before.file = .file before ∧ input.after.file = .file after ∧ before = after ∧
    before.identity.volume = input.root.identity.volume ∧
    input.read = .complete length ∧ length = before.size ∧ StreamPath input ∧
    model.admit input ≠ .accepted

end PluginSdk.FileRead
