import PluginSdk.Compiler.BuildFormat.Model
import PluginSdk.Compiler.BuildFormat.Properties

namespace PluginSdk.Compiler.BuildFormat.Proofs

theorem BF1_agents_exact : BF1_agents_exact model := by
  intro input agents
  cases input with
  | mk client hasAgents hasHooks hasStdio =>
    change hasAgents = true at agents
    cases client <;> simp [model, select, agents]

theorem BF2_hooks_exact : BF2_hooks_exact model := by
  intro input noAgents hooks
  cases input with
  | mk client hasAgents hasHooks hasStdio =>
    change hasAgents = false at noAgents
    change hasHooks = true at hooks
    cases client <;> simp [model, select, noAgents, hooks]

theorem BF3_stdio_portable_exact : BF3_stdio_portable_exact model := by
  intro input noAgents noHooks stdio
  cases input with
  | mk client hasAgents hasHooks hasStdio =>
    change hasAgents = false at noAgents
    change hasHooks = false at noHooks
    change hasStdio = true at stdio
    cases client <;> simp [model, select, noAgents, noHooks, stdio]

theorem BF4_basic_exact : BF4_basic_exact model := by
  intro input noAgents noHooks noStdio
  cases input with
  | mk client hasAgents hasHooks hasStdio =>
    change hasAgents = false at noAgents
    change hasHooks = false at noHooks
    change hasStdio = false at noStdio
    cases client <;> simp [model, select, noAgents, noHooks, noStdio]

end PluginSdk.Compiler.BuildFormat.Proofs
