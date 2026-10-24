import PluginSdk.TreeRead.Types
import PluginSdk.FileRead.Paths

namespace PluginSdk.TreeRead

open PluginSdk.FileRead (Anchor Observation EquivalentPaths ContainedPaths parsePath)

def SameAnchor (left right : Anchor) : Prop :=
  left.identity = right.identity ∧ left.caseSensitive = right.caseSensitive ∧
    EquivalentPaths left.path right.path

def AtOrInside (root candidate : Anchor) : Prop :=
  candidate.identity.volume = root.identity.volume ∧
    (EquivalentPaths root.path candidate.path ∨ ContainedPaths root.path candidate.path)

instance (left right : Anchor) : Decidable (SameAnchor left right) := by
  unfold SameAnchor; infer_instance
instance (root candidate : Anchor) : Decidable (AtOrInside root candidate) := by
  unfold AtOrInside; infer_instance

def EntryAvailable (input : EntryInput) : Prop :=
  input.entry ≠ .unavailable ∧ input.target ≠ .unavailable

def EntryRegular (input : EntryInput) : Prop :=
  (match input.entry with | .directory _ | .file _ | .reparse _ => True | _ => False) ∧
    (match input.target with | .directory _ | .file _ => True | _ => False)

def Unsupported (paths : List String) : Prop := ∃ path ∈ paths, parsePath path = .unsupported
def Stream (paths : List String) : Prop := ∃ path ∈ paths, parsePath path = .stream

def OrdinaryBound (input : EntryInput) : Prop :=
  match input.entry, input.target with
  | .directory entry, .directory target => SameAnchor entry target
  | .file entry, .file target =>
    entry.identity = target.identity ∧ EquivalentPaths entry.path target.path
  | .reparse _, _ => True
  | _, _ => False

def EntryBound (input : EntryInput) : Prop :=
  SameAnchor input.root input.branch.root ∧ OrdinaryBound input

def EntryContained (input : EntryInput) : Prop :=
  (∀ anchor ∈ input.branch.anchors, AtOrInside input.root anchor) ∧
    (match input.entry.identity with
    | some identity => identity.volume = input.root.identity.volume
    | none => False) ∧
    (match input.target with
    | .directory anchor =>
      anchor.identity.volume = input.root.identity.volume ∧ ContainedPaths input.root.path anchor.path
    | .file info =>
      info.identity.volume = input.root.identity.volume ∧ ContainedPaths input.root.path info.path
    | _ => False)

def ExactEntry (input : EntryInput) : Prop :=
  match parsePath input.branch.parent.path, input.entry.path with
  | .plain parent, some raw =>
    match parsePath raw with
    | .plain child => child.volume = parent.volume ∧ child.components = parent.components ++ [input.name]
    | _ => False
  | _, _ => False

def LinkAllowed (input : EntryInput) : Prop :=
  match input.entry with
  | .reparse info => input.policy = .source ∧ (info.tag = 2684354563 ∨ info.tag = 2684354572)
  | .directory _ | .file _ => True
  | _ => False

def CycleFree (input : EntryInput) : Prop :=
  (input.branch.anchors.map (·.identity)).Nodup ∧
    (match input.target with
    | .directory anchor => anchor.identity ∉ input.branch.anchors.map (·.identity)
    | _ => True)

instance (input : EntryInput) : Decidable (EntryAvailable input) := by unfold EntryAvailable; infer_instance
instance (input : EntryInput) : Decidable (EntryRegular input) := by unfold EntryRegular; split <;> split <;> infer_instance
instance (paths : List String) : Decidable (Unsupported paths) := by unfold Unsupported; infer_instance
instance (paths : List String) : Decidable (Stream paths) := by unfold Stream; infer_instance
instance (input : EntryInput) : Decidable (OrdinaryBound input) := by unfold OrdinaryBound; split <;> infer_instance
instance (input : EntryInput) : Decidable (EntryBound input) := by unfold EntryBound; infer_instance
instance (input : EntryInput) : Decidable (EntryContained input) := by
  unfold EntryContained; split <;> split <;> infer_instance
instance (input : EntryInput) : Decidable (ExactEntry input) := by
  unfold ExactEntry; split <;> first | (split <;> infer_instance) | infer_instance
instance (input : EntryInput) : Decidable (LinkAllowed input) := by unfold LinkAllowed; split <;> infer_instance
instance (input : EntryInput) : Decidable (CycleFree input) := by unfold CycleFree; split <;> infer_instance

def EntryReady (input : EntryInput) : Prop :=
  EntryAvailable input ∧ EntryRegular input ∧ ¬ Unsupported input.paths ∧ ¬ Stream input.paths ∧
    EntryBound input ∧ EntryContained input ∧ ExactEntry input ∧ LinkAllowed input ∧ CycleFree input

def DirectoryAvailable (input : DirectoryInput) : Prop :=
  (match input.before.root, input.after.root with | .directory _, .directory _ => True | _, _ => False) ∧
    input.before.directory ≠ .unavailable ∧ input.after.directory ≠ .unavailable ∧
    input.enumeratedBefore ≠ .failed ∧ input.enumeratedAfter ≠ .failed

def DirectoryRegular (input : DirectoryInput) : Prop :=
  match input.before.directory, input.after.directory with
  | .directory _, .directory _ => True
  | _, _ => False

def DirectoryBound (input : DirectoryInput) : Prop :=
  match input.before.root, input.after.root, input.before.directory, input.after.directory with
  | .directory beforeRoot, .directory afterRoot, .directory before, .directory after =>
    SameAnchor input.root beforeRoot ∧ SameAnchor input.root afterRoot ∧
      SameAnchor input.directory before.anchor ∧ SameAnchor input.directory after.anchor ∧
      before.modified = after.modified ∧ before.changed = after.changed
  | _, _, _, _ => False

def UniqueNames (input : DirectoryInput) : Prop :=
  input.enumeratedBefore.names.Nodup ∧ input.enumeratedAfter.names.Nodup ∧ input.visited.Nodup

def EnumerationsAgree (input : DirectoryInput) : Prop :=
  input.enumeratedBefore.names.Perm input.enumeratedAfter.names

def VisitsComplete (input : DirectoryInput) : Prop :=
  input.enumeratedBefore.names.Perm input.visited

instance (input : DirectoryInput) : Decidable (DirectoryAvailable input) := by
  unfold DirectoryAvailable; split <;> infer_instance
instance (input : DirectoryInput) : Decidable (DirectoryRegular input) := by
  unfold DirectoryRegular; split <;> infer_instance
instance (input : DirectoryInput) : Decidable (DirectoryBound input) := by
  unfold DirectoryBound; split <;> infer_instance
instance (input : DirectoryInput) : Decidable (UniqueNames input) := by unfold UniqueNames; infer_instance
instance (input : DirectoryInput) : Decidable (EnumerationsAgree input) := by unfold EnumerationsAgree; infer_instance
instance (input : DirectoryInput) : Decidable (VisitsComplete input) := by unfold VisitsComplete; infer_instance

def DirectoryReady (input : DirectoryInput) : Prop :=
  DirectoryAvailable input ∧ DirectoryRegular input ∧ ¬ Unsupported input.paths ∧ ¬ Stream input.paths ∧
    DirectoryBound input ∧ AtOrInside input.root input.directory ∧ UniqueNames input ∧
    EnumerationsAgree input ∧ VisitsComplete input

end PluginSdk.TreeRead
