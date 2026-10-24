import PluginSdk.Compiler.Portable.Layout

namespace PluginSdk.Compiler.Portable

def PC1_exact_admission (model : Interface) : Prop :=
  ∀ input, (∃ output, model.render input = .rendered output) ↔ Representable input

def PC2_documents_preserved (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    ∃ mcp hooks,
      Mcp.Portable.model.render input.mcp = .rendered mcp ∧
      Hooks.Portable.model.render (hookInput input) = .rendered hooks ∧
      output.mcpDocument = mcp.document ∧ output.hooksDocument = hooks.document

def PC3_files_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.files = expectedFiles input ∧
    output.files.length = if input.mcp.locals = [] ∧ input.hooks = [] then 0
      else 1 + 2 * (input.mcp.locals.length + input.hooks.length)

def PC4_runtime_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.files.filter (fun file => !payload file) =
      if input.mcp.locals = [] ∧ input.hooks = [] then []
      else [.runtime Process.Portable.runtimeFile]

def PC5_paths_safe (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    ((output.files.map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right)) ∧
    ∀ file ∈ output.files, Contained file.path.value ∧ '$' ∉ file.path.value.toList

def PC6_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, Normalized left → Normalized right → EnumerationEquivalent left right →
    model.render left = model.render right

def PC7_diagnostics (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList) ∧
  ∀ input issues, model.render input = .rejected issues → issues.toList = requiredIssues input

def PC8_empty_hooks_preserve_mcp (model : Interface) : Prop :=
  ∀ input, input.hooks = [] →
    (∀ mcp, Mcp.Portable.model.render input.mcp = .rendered mcp →
      model.render input = .rendered ⟨mcp.document, none, mcp.files⟩) ∧
    (∀ issues, Mcp.Portable.model.render input.mcp = .rejected issues →
      model.render input = .rejected ⟨.mcp issues.head, issues.tail.map Issue.mcp⟩)

end PluginSdk.Compiler.Portable
