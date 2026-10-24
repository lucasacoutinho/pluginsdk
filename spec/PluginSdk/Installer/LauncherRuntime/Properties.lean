import PluginSdk.Installer.LauncherRuntime.Types

namespace PluginSdk.Installer.LauncherRuntime

def NR1_absent_requires_nothing (model : Interface) : Prop :=
  ∀ platform, model.requirements ⟨platform, .absent⟩ = some []

def NR2_posix_checks_exact (model : Interface) : Prop :=
  ∀ cwdRoot, model.requirements ⟨"linux", .posix cwdRoot⟩ =
    some ([.shell, .env] ++ if cwdRoot then [.pwd] else [])

def NR3_portable_checks_exact (model : Interface) : Prop :=
  model.requirements ⟨"linux", .portable⟩ = some [.node, .shell, .env] ∧
  model.requirements ⟨"win32", .portable⟩ = some [.node]

def NR4_unsupported_exact (model : Interface) : Prop :=
  ∀ input, model.requirements input = none ↔
    input.kind ≠ .absent ∧ input.platform ≠ "linux" ∧
    (input.platform ≠ "win32" ∨ input.kind ≠ .portable)

def NR5_node_admission_exact (model : Interface) : Prop :=
  ∀ observation, model.acceptsNode observation = true ↔
    (24 < observation.major ∨ observation.major = 24 ∧ 18 ≤ observation.minor) ∧
    (observation.platform = "win32" ∨ observation.platform = "linux" ∧ observation.execve = true)

end PluginSdk.Installer.LauncherRuntime
