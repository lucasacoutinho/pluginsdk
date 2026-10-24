import PluginSdk.Compiler.Format

namespace PluginSdk.Compiler

def Normalized (input : RenderInput) : Prop :=
  (input.mcp.map Prod.fst).Nodup ∧
  ∀ name source, (name, source) ∈ input.mcp →
    name ≠ "" ∧ (source.headers.map Prod.fst).Nodup

def B1_render_deterministic (model : Interface) : Prop :=
  (∀ first second, first = second → model.render first = model.render second) ∧
  (∀ input files, model.render input = .rendered files →
    files.toList.Pairwise (fun left right => Utf8Before left.path.value right.path.value)) ∧
  (∀ input issues, model.render input = .rejected issues →
    (issues.toList.map IssueKey).Pairwise (List.Lex Utf8Before))

def B2_source_content_preserved (model : Interface) : Prop :=
  ∀ input files, Normalized input → model.render input = .rendered files →
    ∀ path file, SourceCopy input path file →
      files.toList.countP (fun output => match output with
        | .copy destination captured => decide (destination.value = path ∧ captured = file)
        | .json _ _ => false) = 1

def B3_output_paths_unique (model : Interface) : Prop :=
  (∀ input files, model.render input = .rendered files →
    files.toList.Pairwise (fun left right => ¬ PathsConflict left.path.value right.path.value)) ∧
  (∀ input path, Normalized input → RequestedCollision input path →
    ∃ issues, model.render input = .rejected issues ∧ .pathCollision path ∈ issues.toList) ∧
  (∀ input issues path, Normalized input → model.render input = .rejected issues →
    .pathCollision path ∈ issues.toList → RequestedCollision input path)

def RejectionAccountsForRequests (model : Interface) : Prop :=
  ∀ input server reason, Normalized input → UnsupportedRequest input server reason →
    ∃ issues, model.render input = .rejected issues ∧ .unsupportedMcp server reason ∈ issues.toList

def B4_requested_content_accounted_for (model : Interface) : Prop :=
  (∀ input files, Normalized input → model.render input = .rendered files →
    (∃ file ∈ files.toList, NativeManifest input file) ∧
    (input.mcp ≠ [] → ∃ file ∈ files.toList, NativeMcp input file) ∧
    (∀ path captured, SourceCopy input path captured →
      ∃ destination, .copy destination captured ∈ files.toList ∧ destination.value = path) ∧
    (∀ file ∈ files.toList, match file with
      | .copy path captured => SourceCopy input path.value captured
      | .json _ _ => NativeManifest input file ∨ NativeMcp input file)) ∧
  RejectionAccountsForRequests model ∧
  (∀ input, Normalized input → Representable input → ∃ files, model.render input = .rendered files)

def SkillEquivalent (left right : Skill) : Prop :=
  left.name.value = right.name.value ∧ left.entry = right.entry ∧ left.assets.Perm right.assets

def ServerEquivalent (left right : String × RemoteMcp) : Prop :=
  left.1 = right.1 ∧ left.2.url = right.2.url ∧ left.2.headers.Perm right.2.headers

def InOrder {α : Type} (related : α → α → Prop) : List α → List α → Prop
  | [], [] => True
  | left :: rest, right :: remaining => related left right ∧ InOrder related rest remaining
  | _, _ => False

def EnumerationEquivalent (left right : RenderInput) : Prop :=
  left.format = right.format ∧ left.metadata = right.metadata ∧
  (∃ reordered, left.skills.Perm reordered ∧ InOrder SkillEquivalent reordered right.skills) ∧
  (∃ reordered, left.mcp.Perm reordered ∧ InOrder ServerEquivalent reordered right.mcp)

def B5_enumeration_order_irrelevant (model : Interface) : Prop :=
  ∀ left right, Normalized left → Normalized right → EnumerationEquivalent left right →
    model.render left = model.render right

def B6_output_paths_contained (model : Interface) : Prop :=
  ∀ input files, model.render input = .rendered files →
    ∀ file ∈ files.toList, Contained file.path.value

def B7_copy_references_from_input (model : Interface) : Prop :=
  ∀ input files, Normalized input → model.render input = .rendered files →
    ∀ path captured, .copy path captured ∈ files.toList → SourceCopy input path.value captured

def B8_header_meaning_preserved (model : Interface) : Prop :=
  (∀ input files, Normalized input → model.render input = .rendered files →
    ∀ server source header requested, (server, source) ∈ input.mcp →
      (header, requested) ∈ source.headers →
      ∃ file ∈ files.toList, NativeMcp input file ∧
        ∃ native, HeaderAt input.format file server header native ∧ HeaderMeaning input.format requested native) ∧
  RejectionAccountsForRequests model

end PluginSdk.Compiler
