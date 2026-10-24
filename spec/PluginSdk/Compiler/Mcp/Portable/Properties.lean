import PluginSdk.Compiler.Mcp.Portable.Layout

namespace PluginSdk.Compiler.Mcp.Portable

def Representable (input : Input) : Prop :=
  ∀ name plan, (name, plan) ∈ input.locals →
    Process.Portable.Representable ⟨Mcp.hostFor input.format, dataPath 0, plan⟩

def RequiredIssue (input : Input) (issue : Issue) : Prop :=
  ∃ plan, (issue.server, plan) ∈ input.locals ∧
    Process.Portable.RequiredIssue ⟨Mcp.hostFor input.format, dataPath 0, plan⟩ issue.reason

def IssueBefore (left right : Issue) : Prop :=
  Utf8Before left.server right.server ∨
    left.server = right.server ∧
      KeyBefore (Process.Portable.IssueKey left.reason) (Process.Portable.IssueKey right.reason)

def PM1_exact_admission (model : Interface) : Prop :=
  ∀ input, (∃ output, model.render input = .rendered output) ↔ Representable input

def PM2_document_exact (model : Interface) : Prop :=
  ∀ input output, Mcp.Normalized input → model.render input = .rendered output →
    (output.document.isSome = true ↔ input.remote ≠ [] ∨ input.locals ≠ []) ∧
    match output.document with
    | none => True
    | some value =>
      ObjectKeys value.value (match input.format with
        | .agentPluginsV1 => ["$schema", "mcpServers"]
        | .claudeCodeV1 => ["mcpServers"]
        | .codexPluginV1 => ["mcpServers"]) ∧
      SchemaField input.format value.value "mcp" ∧
      ∃ servers, Field value.value "mcpServers" servers ∧
        ObjectKeys servers (input.remote.map Prod.fst ++ input.locals.map Prod.fst) ∧
        (∀ name source, (name, source) ∈ input.remote →
          Field servers name (object (Compiler.serverRows input.format source)).value) ∧
        ∀ entry ∈ entries input,
          Field servers entry.name
            (Mcp.nativeObject input.format (Process.Portable.native (launcherInput input entry)
              (Process.Portable.Captures.compile entry.plan))).value

def PM3_files_exact (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    output.files = if input.locals = [] then [] else
      .runtime runtimeFile :: (entries input).flatMap fun entry =>
        [.process (dataPath entry.ordinal)
          ⟨shellPath entry.ordinal, Process.Portable.Captures.compile entry.plan⟩,
         .posix (shellPath entry.ordinal)
          (Process.Launcher.serialize (Process.Portable.Captures.compile entry.plan))]

def PM4_paths_safe (model : Interface) : Prop :=
  ∀ input output, model.render input = .rendered output →
    (output.files.map (fun file => file.path.value)).Pairwise (fun left right => left ≠ right) ∧
    ∀ file ∈ output.files, Contained file.path.value ∧ '$' ∉ file.path.value.toList

def PM5_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, Mcp.Normalized left → Mcp.Normalized right → Mcp.EnumerationEquivalent left right →
    model.render left = model.render right

def PM6_diagnostics (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.render input = .rejected issues ∧ issue ∈ issues.toList) ∧
  ∀ input issues, Mcp.Normalized input → model.render input = .rejected issues →
    issues.toList.Pairwise IssueBefore

end PluginSdk.Compiler.Mcp.Portable
