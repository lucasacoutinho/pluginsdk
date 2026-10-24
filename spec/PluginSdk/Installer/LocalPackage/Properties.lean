import PluginSdk.Installer.LocalPackage.Types

namespace PluginSdk.Installer.LocalPackage

open PluginSdk.Installer.LocalSlot

def LP1_preserves_absent_and_unknown (model : Interface) : Prop :=
  (∀ approval, model.classify ⟨approval, .absent⟩ = .absent) ∧
  (∀ approval, model.classify ⟨approval, .unknown⟩ = .unknown)

def LP2_owned_requires_approved_physical_root (model : Interface) : Prop :=
  ∀ input, IsOwnedObservation (model.classify input) →
    ∃ approval tree, input.approval = some approval ∧ input.observed = .tree tree ∧
      tree.root = approval.root

def LP3_owned_requires_valid_approval_and_usable_modes (model : Interface) : Prop :=
  ∀ input, IsOwnedObservation (model.classify input) →
    ∃ approval tree, input.approval = some approval ∧ input.observed = .tree tree ∧
      CanonicalApproval approval ∧ UsableModes tree

def LP4_owned_preserves_claim_and_basis (model : Interface) : Prop :=
  ∀ input, IsOwnedObservation (model.classify input) →
    ∃ approval tree, input.approval = some approval ∧ input.observed = .tree tree ∧
      HasOwnedClaim approval.owner approval.identity tree.basis (model.classify input)

def LP5_owned_files_match_approved_content_and_intent (model : Interface) : Prop :=
  ∀ approval tree,
    IsOwnedObservation (model.classify ⟨some approval, .tree tree⟩) →
      ObservedFilesMatchApproval approval tree

def LP6_owned_tree_is_closed_unique_and_confined (model : Interface) : Prop :=
  ∀ approval tree,
    IsOwnedObservation (model.classify ⟨some approval, .tree tree⟩) →
      ObservedFilesUnique tree ∧
      ObservedDirectoriesUnique tree ∧
      DirectoriesAreApprovedParents approval tree ∧
      CapturedParentsComplete tree

def LP7_complete_covers_every_approved_file (model : Interface) : Prop :=
  ∀ approval tree claim basis,
    model.classify ⟨some approval, .tree tree⟩ = .complete claim basis →
      ApprovalFilesPresent approval tree

def LP8_partial_has_a_missing_approved_file (model : Interface) : Prop :=
  ∀ approval tree claim basis,
    model.classify ⟨some approval, .tree tree⟩ = .partialPackage claim basis →
      ApprovalFileMissing approval tree

def LP9_ambiguous_entries_never_produce_owned_output (model : Interface) : Prop :=
  ∀ approval tree,
    (¬ ApprovedPathsCollisionFree approval ∨
      ¬ ObservedFilesUnique tree ∨
      ¬ ObservedDirectoriesUnique tree) →
    ¬ IsOwnedObservation (model.classify ⟨some approval, .tree tree⟩)

def LP10_canonical_full_and_partial_trees (model : Interface) : Prop :=
  ∀ approval tree, CanonicalCapture approval tree →
    (ApprovalFilesPresent approval tree →
      model.classify ⟨some approval, .tree tree⟩ =
        .complete ⟨approval.owner, approval.identity⟩ tree.basis) ∧
    (ApprovalFileMissing approval tree →
      model.classify ⟨some approval, .tree tree⟩ =
        .partialPackage ⟨approval.owner, approval.identity⟩ tree.basis)

def LP11_permutation_invariance (model : Interface) : Prop :=
  ∀ approval tree approvedFiles observedFiles directories,
    approval.files.Perm approvedFiles →
    tree.files.Perm observedFiles →
    tree.directories.Perm directories →
    model.classify ⟨some approval, .tree tree⟩ =
      model.classify
        ⟨some { approval with files := approvedFiles },
          .tree { tree with files := observedFiles, directories := directories }⟩

end PluginSdk.Installer.LocalPackage
