import PluginSdk.Compiler.Assembly.Types
import PluginSdk.Compiler.Collisions

namespace PluginSdk.Compiler.Assembly

def PathBefore (left right : Asset) : Prop := Utf8Before left.path.value right.path.value

def NonConflicting (input : Input) : Prop :=
  ((input.base.toList ++ input.assets).map (fun asset => asset.path.value)).Pairwise
    (fun left right => ¬ PathsConflict left right)

def NoReservedAssets (input : Input) : Prop :=
  ∀ asset, asset ∈ input.assets → ¬ ReservedPath asset.path.value

def A1_deterministic_canonical (model : Interface) : Prop :=
  (∀ left right, left = right → model.assemble left = model.assemble right) ∧
  (∀ input files, model.assemble input = .assembled files →
    files.toList.Pairwise PathBefore) ∧
  (∀ input issues, model.assemble input = .rejected issues →
    (issues.toList.map IssueKey).Pairwise (List.Lex Utf8Before))

def A2_preserves_requested_files_once (model : Interface) : Prop :=
  ∀ input files, model.assemble input = .assembled files →
    ∀ asset, asset ∈ input.base.toList ++ input.assets →
      files.toList.countP (fun output => decide (output = asset)) = 1

def A3_no_invented_files (model : Interface) : Prop :=
  ∀ input files, model.assemble input = .assembled files →
    ∀ asset, asset ∈ files.toList → asset ∈ input.base.toList ++ input.assets

def A4_contained_conflict_free (model : Interface) : Prop :=
  ∀ input files, model.assemble input = .assembled files →
    (∀ asset, asset ∈ files.toList → Contained asset.path.value) ∧
    files.toList.Pairwise (fun left right => ¬ PathsConflict left.path.value right.path.value)

def RequiredIssue (input : Input) : Issue → Prop
  | .pathCollision path =>
    ∃ left right, [left, right].Sublist
      ((input.base.toList ++ input.assets).map (fun asset => asset.path.value)) ∧
      CollisionAt left right path
  | .reservedAsset path =>
    ∃ asset, asset ∈ input.assets ∧ asset.path.value = path ∧ ReservedPath path

def A5_diagnostics_complete (model : Interface) : Prop :=
  ∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.assemble input = .rejected issues ∧ issue ∈ issues.toList

def A6_permutation_invariant (model : Interface) : Prop :=
  ∀ left right, left.base.toList.Perm right.base.toList → left.assets.Perm right.assets →
    model.assemble left = model.assemble right

def A7_valid_input_accepted (model : Interface) : Prop :=
  ∀ input, NonConflicting input → NoReservedAssets input →
    ∃ files, model.assemble input = .assembled files

end PluginSdk.Compiler.Assembly
