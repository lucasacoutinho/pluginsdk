import PluginSdk.Installer.LocalPackage.Model
import PluginSdk.Installer.LocalPackage.Properties

namespace PluginSdk.Installer.LocalPackage.Proofs

open PluginSdk.Installer.LocalPackage
open PluginSdk.Installer.LocalSlot

private theorem owned_classification_context {approval : Approval} {tree : Tree}
    (owned : IsOwnedObservation (model.classify ⟨some approval, .tree tree⟩)) :
    CanonicalApproval approval ∧ tree.root = approval.root ∧
      UsableModes tree ∧ CaptureConsistent approval tree := by
  by_cases unusable : HasUnusableMode tree.files
  · simp [model, classify, unusable, IsOwnedObservation] at owned
  · by_cases canonical : CanonicalApproval approval
    · by_cases sameRoot : tree.root = approval.root
      · by_cases consistent : CaptureConsistent approval tree
        · exact ⟨canonical, sameRoot, unusable, consistent⟩
        · simp [model, classify, unusable, canonical, sameRoot, consistent,
            IsOwnedObservation] at owned
      · simp [model, classify, unusable, canonical, sameRoot, IsOwnedObservation] at owned
    · simp [model, classify, unusable, canonical, IsOwnedObservation] at owned

private theorem missing_path_of_not_present {approval : Approval} {tree : Tree}
    (notPresent : ¬ ApprovalFilesPresent approval tree) :
    ApprovalFileMissing approval tree := by
  unfold ApprovalFilesPresent ApprovalFileMissing at *
  by_cases existsMissing : ∃ retained, retained ∈ approval.files ∧
      retained.path ∉ ObservedFilePaths tree
  · exact existsMissing
  · exfalso
    apply notPresent
    intro retained member
    by_cases present : retained.path ∈ ObservedFilePaths tree
    · exact present
    · exact False.elim (existsMissing ⟨retained, member, present⟩)

theorem LP1_preserves_absent_and_unknown : LP1_preserves_absent_and_unknown model := by
  constructor <;> intro approval <;> rfl

theorem LP2_owned_requires_approved_physical_root :
    LP2_owned_requires_approved_physical_root model := by
  intro input owned
  cases input with
  | mk approval observed =>
      cases observed with
      | absent => simp [model, classify, IsOwnedObservation] at owned
      | unknown => simp [model, classify, IsOwnedObservation] at owned
      | tree tree =>
          cases approval with
          | none =>
              by_cases unusable : HasUnusableMode tree.files
              · simp [model, classify, unusable, IsOwnedObservation] at owned
              · simp [model, classify, unusable, IsOwnedObservation] at owned
          | some approval =>
              obtain ⟨_, sameRoot, _, _⟩ := owned_classification_context owned
              exact ⟨approval, tree, rfl, rfl, sameRoot⟩

theorem LP3_owned_requires_valid_approval_and_usable_modes :
    LP3_owned_requires_valid_approval_and_usable_modes model := by
  intro input owned
  cases input with
  | mk approval observed =>
      cases observed with
      | absent => simp [model, classify, IsOwnedObservation] at owned
      | unknown => simp [model, classify, IsOwnedObservation] at owned
      | tree tree =>
          cases approval with
          | none =>
              by_cases unusable : HasUnusableMode tree.files
              · simp [model, classify, unusable, IsOwnedObservation] at owned
              · simp [model, classify, unusable, IsOwnedObservation] at owned
          | some approval =>
              obtain ⟨canonical, _, usable, _⟩ := owned_classification_context owned
              exact ⟨approval, tree, rfl, rfl, canonical, usable⟩

theorem LP4_owned_preserves_claim_and_basis : LP4_owned_preserves_claim_and_basis model := by
  intro input owned
  cases input with
  | mk approval observed =>
      cases observed with
      | absent => simp [model, classify, IsOwnedObservation] at owned
      | unknown => simp [model, classify, IsOwnedObservation] at owned
      | tree tree =>
          cases approval with
          | none =>
              by_cases unusable : HasUnusableMode tree.files
              · simp [model, classify, unusable, IsOwnedObservation] at owned
              · simp [model, classify, unusable, IsOwnedObservation] at owned
          | some approval =>
              obtain ⟨canonical, sameRoot, usable, consistent⟩ :=
                owned_classification_context owned
              have notUnusable : ¬ HasUnusableMode tree.files := usable
              by_cases present : ApprovalFilesPresent approval tree
              · simp [model, classify, canonical, sameRoot, notUnusable, consistent,
                  present, HasOwnedClaim]
              · simp [model, classify, canonical, sameRoot, notUnusable, consistent,
                  present, HasOwnedClaim]

theorem LP5_owned_files_match_approved_content_and_intent :
    LP5_owned_files_match_approved_content_and_intent model := by
  intro approval tree owned
  obtain ⟨_, _, _, consistent⟩ := owned_classification_context owned
  exact consistent.2.2.2.2

theorem LP6_owned_tree_is_closed_unique_and_confined :
    LP6_owned_tree_is_closed_unique_and_confined model := by
  intro approval tree owned
  obtain ⟨_, _, _, consistent⟩ := owned_classification_context owned
  exact ⟨consistent.1, consistent.2.1, consistent.2.2.1, consistent.2.2.2.1⟩

theorem LP7_complete_covers_every_approved_file :
    LP7_complete_covers_every_approved_file model := by
  intro approval tree claim basis completed
  have owned : IsOwnedObservation (model.classify ⟨some approval, .tree tree⟩) := by
    rw [completed]
    simp [IsOwnedObservation]
  obtain ⟨canonical, sameRoot, usable, consistent⟩ := owned_classification_context owned
  have notUnusable : ¬ HasUnusableMode tree.files := usable
  by_cases present : ApprovalFilesPresent approval tree
  · exact present
  · simp [model, classify, canonical, sameRoot, notUnusable, consistent, present] at completed

theorem LP8_partial_has_a_missing_approved_file :
    LP8_partial_has_a_missing_approved_file model := by
  intro approval tree claim basis partialResult
  have owned : IsOwnedObservation (model.classify ⟨some approval, .tree tree⟩) := by
    rw [partialResult]
    simp [IsOwnedObservation]
  obtain ⟨canonical, sameRoot, usable, consistent⟩ := owned_classification_context owned
  have notUnusable : ¬ HasUnusableMode tree.files := usable
  by_cases present : ApprovalFilesPresent approval tree
  · simp [model, classify, canonical, sameRoot, notUnusable, consistent, present] at partialResult
  · exact missing_path_of_not_present present

theorem LP9_ambiguous_entries_never_produce_owned_output :
    LP9_ambiguous_entries_never_produce_owned_output model := by
  intro approval tree ambiguous owned
  obtain ⟨canonical, _, _, consistent⟩ := owned_classification_context owned
  rcases canonical with ⟨_, approvedUnique⟩
  rcases consistent with ⟨filesUnique, directoriesUnique, _, _, _⟩
  rcases ambiguous with approvedCollision | filesCollision | directoriesCollision
  · exact approvedCollision approvedUnique
  · exact filesCollision filesUnique
  · exact directoriesCollision directoriesUnique

theorem LP10_canonical_full_and_partial_trees : LP10_canonical_full_and_partial_trees model := by
  intro approval tree canonicalCapture
  rcases canonicalCapture with ⟨⟨nonempty, approvedUnique⟩, sameRoot, usable, consistent⟩
  have canonical : CanonicalApproval approval := ⟨nonempty, approvedUnique⟩
  constructor
  · intro present
    have notUnusable : ¬ HasUnusableMode tree.files := usable
    simp [model, classify, canonical, sameRoot, notUnusable, consistent, present]
  · intro missing
    have notUnusable : ¬ HasUnusableMode tree.files := usable
    have notPresent : ¬ ApprovalFilesPresent approval tree := by
      intro present
      rcases missing with ⟨retained, member, absent⟩
      exact absent (present retained member)
    simp [model, classify, canonical, sameRoot, notUnusable, consistent, notPresent]

private theorem nonempty_of_permutation {left right : List α} (permutation : left.Perm right) :
    left ≠ [] ↔ right ≠ [] := by
  constructor
  · intro leftNonempty rightEmpty
    subst right
    cases left with
    | nil => exact False.elim (leftNonempty rfl)
    | cons head tail =>
        have member : head ∈ head :: tail := by simp
        have impossible : head ∈ ([] : List α) := permutation.mem_iff.mp member
        simp at impossible
  · intro rightNonempty leftEmpty
    subst left
    cases right with
    | nil => exact False.elim (rightNonempty rfl)
    | cons head tail =>
        have member : head ∈ head :: tail := by simp
        have impossible : head ∈ ([] : List α) := permutation.mem_iff.mpr member
        simp at impossible

private theorem pathCollisions_empty_of_permutation {left right : List String}
    (permutation : left.Perm right) :
    PluginSdk.Compiler.pathCollisions left = [] ↔
      PluginSdk.Compiler.pathCollisions right = [] := by
  rw [List.eq_nil_iff_forall_not_mem, List.eq_nil_iff_forall_not_mem]
  constructor
  · intro absent key member
    exact absent key ((PluginSdk.Compiler.pathCollisions_permutation permutation key).mpr member)
  · intro absent key member
    exact absent key ((PluginSdk.Compiler.pathCollisions_permutation permutation key).mp member)

private theorem approvedParentMembership_permutation {approval : Approval}
    {approvedFiles : List PluginSdk.ExecutableIntent.RetainedFile}
    (permutation : approval.files.Perm approvedFiles) (directory : String) :
    directory ∈ ApprovedParents approval ↔
      directory ∈ ApprovedParents { approval with files := approvedFiles } := by
  simp only [ApprovedParents, List.mem_flatMap]
  constructor
  · rintro ⟨file, member, parent⟩
    exact ⟨file, permutation.mem_iff.mp member, parent⟩
  · rintro ⟨file, member, parent⟩
    exact ⟨file, permutation.mem_iff.mpr member, parent⟩

private theorem unusableMode_permutation {left right : List PluginSdk.ExecutableIntent.ObservedFile}
    (permutation : left.Perm right) : HasUnusableMode left ↔ HasUnusableMode right := by
  unfold HasUnusableMode
  constructor
  · rintro ⟨file, member, unusable⟩
    exact ⟨file, permutation.mem_iff.mp member, unusable⟩
  · rintro ⟨file, member, unusable⟩
    exact ⟨file, permutation.mem_iff.mpr member, unusable⟩

private theorem canonicalApproval_permutation {approval : Approval}
    {approvedFiles : List PluginSdk.ExecutableIntent.RetainedFile}
    (permutation : approval.files.Perm approvedFiles) :
    CanonicalApproval approval ↔
      CanonicalApproval { approval with files := approvedFiles } := by
  have pathsPermutation : ApprovedPaths approval |>.Perm
      (ApprovedPaths { approval with files := approvedFiles }) := by
    exact permutation.map (·.path)
  have nonempty := nonempty_of_permutation permutation
  have collisionFree := pathCollisions_empty_of_permutation pathsPermutation
  unfold CanonicalApproval
  constructor
  · rintro ⟨valid, unique⟩
    exact ⟨nonempty.mp valid, collisionFree.mp unique⟩
  · rintro ⟨valid, unique⟩
    exact ⟨nonempty.mpr valid, collisionFree.mpr unique⟩

private theorem captureConsistent_permutation {approval : Approval} {tree : Tree}
    {approvedFiles : List PluginSdk.ExecutableIntent.RetainedFile}
    {observedFiles : List PluginSdk.ExecutableIntent.ObservedFile}
    {directories : List String}
    (approvedPermutation : approval.files.Perm approvedFiles)
    (observedPermutation : tree.files.Perm observedFiles)
    (directoryPermutation : tree.directories.Perm directories) :
    CaptureConsistent approval tree ↔
      CaptureConsistent { approval with files := approvedFiles }
        { tree with files := observedFiles, directories := directories } := by
  have observedPathPermutation : ObservedFilePaths tree |>.Perm
      (ObservedFilePaths { tree with files := observedFiles, directories := directories }) := by
    exact observedPermutation.map (·.path)
  have parentMembership := approvedParentMembership_permutation approvedPermutation
  unfold CaptureConsistent
  constructor
  · rintro ⟨fileUnique, directoryUnique, directoriesApproved, parentsComplete, filesMatch⟩
    refine ⟨observedPathPermutation.nodup_iff.mp fileUnique,
      directoryPermutation.nodup_iff.mp directoryUnique, ?_, ?_, ?_⟩
    · intro directory member
      have oldMember := directoryPermutation.mem_iff.mpr member
      exact (parentMembership directory).mp (directoriesApproved directory oldMember)
    · refine ⟨?_, ?_⟩
      · intro file member parent parentMember
        have oldMember := observedPermutation.mem_iff.mpr member
        exact directoryPermutation.mem_iff.mp (parentsComplete.1 file oldMember parent parentMember)
      · intro directory member parent parentMember
        have oldMember := directoryPermutation.mem_iff.mpr member
        exact directoryPermutation.mem_iff.mp
          (parentsComplete.2 directory oldMember parent parentMember)
    · intro observed member
      have oldMember := observedPermutation.mem_iff.mpr member
      obtain ⟨retained, retainedMember, payloadMatches⟩ := filesMatch observed oldMember
      exact ⟨retained, approvedPermutation.mem_iff.mp retainedMember, payloadMatches⟩
  · rintro ⟨fileUnique, directoryUnique, directoriesApproved, parentsComplete, filesMatch⟩
    refine ⟨observedPathPermutation.nodup_iff.mpr fileUnique,
      directoryPermutation.nodup_iff.mpr directoryUnique, ?_, ?_, ?_⟩
    · intro directory member
      have newMember := directoryPermutation.mem_iff.mp member
      exact (parentMembership directory).mpr (directoriesApproved directory newMember)
    · refine ⟨?_, ?_⟩
      · intro file member parent parentMember
        have newMember := observedPermutation.mem_iff.mp member
        exact directoryPermutation.mem_iff.mpr (parentsComplete.1 file newMember parent parentMember)
      · intro directory member parent parentMember
        have newMember := directoryPermutation.mem_iff.mp member
        exact directoryPermutation.mem_iff.mpr
          (parentsComplete.2 directory newMember parent parentMember)
    · intro observed member
      have newMember := observedPermutation.mem_iff.mp member
      obtain ⟨retained, retainedMember, payloadMatches⟩ := filesMatch observed newMember
      exact ⟨retained, approvedPermutation.mem_iff.mpr retainedMember, payloadMatches⟩

private theorem approvalFilesPresent_permutation {approval : Approval} {tree : Tree}
    {approvedFiles : List PluginSdk.ExecutableIntent.RetainedFile}
    {observedFiles : List PluginSdk.ExecutableIntent.ObservedFile}
    (directories : List String)
    (approvedPermutation : approval.files.Perm approvedFiles)
    (observedPermutation : tree.files.Perm observedFiles) :
    ApprovalFilesPresent approval tree ↔
      ApprovalFilesPresent { approval with files := approvedFiles }
        { tree with files := observedFiles, directories := directories } := by
  have observedPathPermutation : ObservedFilePaths tree |>.Perm
      (observedFiles.map (·.path)) := by
    simpa [ObservedFilePaths] using observedPermutation.map (·.path)
  change (∀ retained, retained ∈ approval.files →
      retained.path ∈ ObservedFilePaths tree) ↔
    (∀ retained, retained ∈ approvedFiles → retained.path ∈ observedFiles.map (·.path))
  constructor
  · intro present retained member
    exact observedPathPermutation.mem_iff.mp
      (present retained (approvedPermutation.mem_iff.mpr member))
  · intro present retained member
    exact observedPathPermutation.mem_iff.mpr
      (present retained (approvedPermutation.mem_iff.mp member))

private theorem classify_permutation {approval : Approval} {tree : Tree}
    {approvedFiles : List PluginSdk.ExecutableIntent.RetainedFile}
    {observedFiles : List PluginSdk.ExecutableIntent.ObservedFile}
    {directories : List String}
    (approvedPermutation : approval.files.Perm approvedFiles)
    (observedPermutation : tree.files.Perm observedFiles)
    (directoryPermutation : tree.directories.Perm directories) :
    model.classify ⟨some approval, .tree tree⟩ =
      model.classify
        ⟨some { approval with files := approvedFiles },
          .tree { tree with files := observedFiles, directories := directories }⟩ := by
  have unusable := unusableMode_permutation observedPermutation
  have canonical := canonicalApproval_permutation approvedPermutation
  have consistent := captureConsistent_permutation
    approvedPermutation observedPermutation directoryPermutation
  have present := approvalFilesPresent_permutation directories
    approvedPermutation observedPermutation
  simp only [model, classify]
  simp only [← unusable, ← canonical, ← consistent, ← present]

theorem LP11_permutation_invariance : LP11_permutation_invariance model := by
  intro approval tree approvedFiles observedFiles directories approvedPermutation
    observedPermutation directoryPermutation
  exact classify_permutation approvedPermutation observedPermutation directoryPermutation

end PluginSdk.Installer.LocalPackage.Proofs
