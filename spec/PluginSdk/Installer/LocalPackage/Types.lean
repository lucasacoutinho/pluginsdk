import PluginSdk.FileRead.Types
import PluginSdk.Installer.LocalSlot.Types
import PluginSdk.ExecutableIntent.Types
import PluginSdk.ExecutableIntent.Rules
import PluginSdk.Compiler.Collisions

namespace PluginSdk.Installer.LocalPackage

structure Approval where
  owner : PluginSdk.Installer.LocalSlot.Owner
  identity : PluginSdk.Installer.LocalSlot.Identity
  root : PluginSdk.FileRead.Identity
  files : List PluginSdk.ExecutableIntent.RetainedFile
  deriving DecidableEq, Repr

structure Tree where
  root : PluginSdk.FileRead.Identity
  basis : PluginSdk.Installer.LocalSlot.Fingerprint
  directories : List String
  files : List PluginSdk.ExecutableIntent.ObservedFile
  deriving DecidableEq, Repr

inductive Observation where
  | absent
  | unknown
  | tree (value : Tree)
  deriving DecidableEq, Repr

structure Input where
  approval : Option Approval
  observed : Observation
  deriving DecidableEq, Repr

structure Interface where
  classify : Input → PluginSdk.Installer.LocalSlot.Observation

def parentPathsFrom (pathPrefix : String) : List String → List String
  | [] => []
  | [_] => []
  | segment :: next :: rest =>
      let current := if pathPrefix = "" then segment else pathPrefix ++ "/" ++ segment
      current :: parentPathsFrom current (next :: rest)

def parentPaths (path : String) : List String :=
  parentPathsFrom "" (path.splitOn "/")

def ApprovedPaths (approval : Approval) : List String :=
  approval.files.map (·.path)

def ObservedFilePaths (tree : Tree) : List String :=
  tree.files.map (·.path)

def ApprovedParents (approval : Approval) : List String :=
  approval.files.flatMap fun file => parentPaths file.path

def ModeEvidenceUnusable : PluginSdk.ExecutableIntent.ModeObservation → Prop
  | .unavailable => True
  | .unrepresented => False
  | .posix before after => before ≠ after

def HasUnusableMode (files : List PluginSdk.ExecutableIntent.ObservedFile) : Prop :=
  ∃ file ∈ files, ModeEvidenceUnusable file.mode

def UsableModes (tree : Tree) : Prop := ¬ HasUnusableMode tree.files

def ApprovalNonempty (approval : Approval) : Prop := approval.files ≠ []

def ApprovedPathsCollisionFree (approval : Approval) : Prop :=
  PluginSdk.Compiler.pathCollisions (ApprovedPaths approval) = []

def ObservedFilesUnique (tree : Tree) : Prop :=
  (ObservedFilePaths tree).Nodup

def ObservedDirectoriesUnique (tree : Tree) : Prop := tree.directories.Nodup

def DirectoryIsApprovedParent (approval : Approval) (directory : String) : Prop :=
  directory ∈ ApprovedParents approval

def DirectoriesAreApprovedParents (approval : Approval) (tree : Tree) : Prop :=
  ∀ directory ∈ tree.directories, DirectoryIsApprovedParent approval directory

def EntryParentsAreCaptured (tree : Tree) (path : String) : Prop :=
  ∀ parent ∈ parentPaths path, parent ∈ tree.directories

def CapturedParentsComplete (tree : Tree) : Prop :=
  (∀ file ∈ tree.files, EntryParentsAreCaptured tree file.path) ∧
  (∀ directory ∈ tree.directories, EntryParentsAreCaptured tree directory)

def FileMatchesApproval (approval : Approval)
    (observed : PluginSdk.ExecutableIntent.ObservedFile) : Prop :=
  ∃ retained ∈ approval.files,
    PluginSdk.ExecutableIntent.PayloadReady ⟨retained, observed⟩

def ObservedFilesMatchApproval (approval : Approval) (tree : Tree) : Prop :=
  ∀ observed ∈ tree.files, FileMatchesApproval approval observed

def ApprovalFilesPresent (approval : Approval) (tree : Tree) : Prop :=
  ∀ retained ∈ approval.files, retained.path ∈ ObservedFilePaths tree

def ApprovalFileMissing (approval : Approval) (tree : Tree) : Prop :=
  ∃ retained ∈ approval.files, retained.path ∉ ObservedFilePaths tree

def CaptureConsistent (approval : Approval) (tree : Tree) : Prop :=
  ObservedFilesUnique tree ∧
  ObservedDirectoriesUnique tree ∧
  DirectoriesAreApprovedParents approval tree ∧
  CapturedParentsComplete tree ∧
  ObservedFilesMatchApproval approval tree

def CanonicalApproval (approval : Approval) : Prop :=
  ApprovalNonempty approval ∧ ApprovedPathsCollisionFree approval

def CanonicalCapture (approval : Approval) (tree : Tree) : Prop :=
  CanonicalApproval approval ∧
  tree.root = approval.root ∧
  UsableModes tree ∧
  CaptureConsistent approval tree

def IsOwnedObservation : PluginSdk.Installer.LocalSlot.Observation → Prop
  | .complete _ _ | .partialPackage _ _ => True
  | .absent | .unknown | .foreign _ => False

def HasOwnedClaim (owner : String) (identity : PluginSdk.Installer.LocalSlot.Identity)
    (basis : PluginSdk.Installer.LocalSlot.Fingerprint) :
    PluginSdk.Installer.LocalSlot.Observation → Prop
  | .complete claim observedBasis | .partialPackage claim observedBasis =>
      claim.owner = owner ∧ claim.identity = identity ∧ observedBasis = basis
  | .absent | .unknown | .foreign _ => False

instance (mode : PluginSdk.ExecutableIntent.ModeObservation) :
    Decidable (ModeEvidenceUnusable mode) := by
  cases mode <;> simp [ModeEvidenceUnusable] <;> infer_instance

instance (files : List PluginSdk.ExecutableIntent.ObservedFile) :
    Decidable (HasUnusableMode files) := by
  unfold HasUnusableMode
  exact List.decidableBEx (fun file => ModeEvidenceUnusable file.mode) files

instance (input : PluginSdk.ExecutableIntent.PayloadInput) :
    Decidable (PluginSdk.ExecutableIntent.PayloadReady input) := by
  unfold PluginSdk.ExecutableIntent.PayloadReady
    PluginSdk.ExecutableIntent.Bound PluginSdk.ExecutableIntent.ModeMatches
  cases input with
  | mk retained observed => cases observed.mode <;> infer_instance

instance (approval : Approval) (observed : PluginSdk.ExecutableIntent.ObservedFile) :
    Decidable (FileMatchesApproval approval observed) := by
  unfold FileMatchesApproval
  exact List.decidableBEx
    (fun retained => PluginSdk.ExecutableIntent.PayloadReady ⟨retained, observed⟩)
    approval.files

instance (approval : Approval) (directory : String) :
    Decidable (DirectoryIsApprovedParent approval directory) := by
  unfold DirectoryIsApprovedParent ApprovedParents
  infer_instance

instance (tree : Tree) (path : String) : Decidable (EntryParentsAreCaptured tree path) := by
  unfold EntryParentsAreCaptured
  exact List.decidableBAll (fun parent => parent ∈ tree.directories) (parentPaths path)

instance (approval : Approval) (tree : Tree) :
    Decidable (DirectoriesAreApprovedParents approval tree) := by
  unfold DirectoriesAreApprovedParents
  exact List.decidableBAll (DirectoryIsApprovedParent approval) tree.directories

instance (tree : Tree) : Decidable (CapturedParentsComplete tree) := by
  unfold CapturedParentsComplete
  have filesDecidable : Decidable
      (∀ file, file ∈ tree.files → EntryParentsAreCaptured tree file.path) :=
    List.decidableBAll (fun file => EntryParentsAreCaptured tree file.path) tree.files
  have directoriesDecidable : Decidable
      (∀ directory, directory ∈ tree.directories → EntryParentsAreCaptured tree directory) :=
    List.decidableBAll (EntryParentsAreCaptured tree) tree.directories
  exact inferInstance

instance (approval : Approval) (tree : Tree) :
    Decidable (ObservedFilesMatchApproval approval tree) := by
  unfold ObservedFilesMatchApproval
  exact List.decidableBAll (FileMatchesApproval approval) tree.files

instance (approval : Approval) : Decidable (CanonicalApproval approval) := by
  unfold CanonicalApproval ApprovalNonempty ApprovedPathsCollisionFree ApprovedPaths
  infer_instance

instance (approval : Approval) (tree : Tree) :
    Decidable (CaptureConsistent approval tree) := by
  unfold CaptureConsistent ObservedFilesUnique ObservedDirectoriesUnique
    DirectoriesAreApprovedParents DirectoryIsApprovedParent ApprovedParents
    CapturedParentsComplete EntryParentsAreCaptured ObservedFilesMatchApproval FileMatchesApproval
  infer_instance

instance (approval : Approval) (tree : Tree) :
    Decidable (ApprovalFilesPresent approval tree) := by
  unfold ApprovalFilesPresent ObservedFilePaths
  exact List.decidableBAll
    (fun retained => retained.path ∈ ObservedFilePaths tree) approval.files

end PluginSdk.Installer.LocalPackage
