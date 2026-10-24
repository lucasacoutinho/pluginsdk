import PluginSdk.Compiler.BuildFormat.Types

namespace PluginSdk.Compiler.BuildFormat

def select (input : Input) : Catalog.PackageFormat :=
  if input.hasAgents || input.hasHooks then
    match input.client with
    | .claudeCode => .claudeCodePortableV2
    | .codex => .codexPluginPortableV2
  else if input.hasStdio then
    match input.client with
    | .claudeCode => .claudeCodePortableV1
    | .codex => .codexPluginPortableV1
  else
    match input.client with
    | .claudeCode => .claudeCodeV2
    | .codex => .agentPluginsV2

def model : Interface := ⟨select⟩

end PluginSdk.Compiler.BuildFormat
