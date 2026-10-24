import PluginSdk.Compiler.BuildFormat.Types

namespace PluginSdk.Compiler.BuildFormat

def BF1_agents_exact (model : Interface) : Prop :=
  ∀ input, input.hasAgents = true → model.select input =
    match input.client with
    | .claudeCode => .claudeCodePortableV2
    | .codex => .codexPluginPortableV2

def BF2_hooks_exact (model : Interface) : Prop :=
  ∀ input, input.hasAgents = false → input.hasHooks = true → model.select input =
    match input.client with
    | .claudeCode => .claudeCodePortableV2
    | .codex => .codexPluginPortableV2

def BF3_stdio_portable_exact (model : Interface) : Prop :=
  ∀ input, input.hasAgents = false → input.hasHooks = false → input.hasStdio = true →
    model.select input = match input.client with
    | .claudeCode => .claudeCodePortableV1
    | .codex => .codexPluginPortableV1

def BF4_basic_exact (model : Interface) : Prop :=
  ∀ input, input.hasAgents = false → input.hasHooks = false → input.hasStdio = false →
    model.select input = match input.client with
    | .claudeCode => .claudeCodeV2
    | .codex => .agentPluginsV2

end PluginSdk.Compiler.BuildFormat
