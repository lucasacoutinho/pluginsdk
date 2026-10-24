import PluginSdk.Installer.Execution.Model
import PluginSdk.Installer.Execution.Properties

namespace PluginSdk.Installer.Execution

private theorem classification (input : StatusInput) :
    (executionDomainStatus input = .quiescent ↔ QuietEvidence input) ∧
    (executionDomainStatus input = .active ↔ ActiveEvidence input) ∧
    (executionDomainStatus input = .unknown ↔
      ¬ QuietEvidence input ∧ ¬ ActiveEvidence input) := by
  cases input with
  | mk domain observed =>
    cases domain with
    | processGroup group boot =>
      cases observed with
      | unknown => simp [executionDomainStatus, QuietEvidence, ActiveEvidence]
      | boot observedBoot =>
        by_cases same : observedBoot = boot <;>
          simp [executionDomainStatus, QuietEvidence, ActiveEvidence, same]
      | processGroup observedGroup observedBoot state =>
        cases state with
        | present =>
          by_cases same : group = observedGroup ∧ boot = observedBoot <;>
            simp [executionDomainStatus, QuietEvidence, ActiveEvidence, same]
        | absent =>
          by_cases same : group = observedGroup ∧ boot = observedBoot <;>
            simp [executionDomainStatus, QuietEvidence, ActiveEvidence, same]
      | windowsJob name state => simp [executionDomainStatus, QuietEvidence, ActiveEvidence]
    | windowsJob name =>
      cases observed with
      | unknown => simp [executionDomainStatus, QuietEvidence, ActiveEvidence]
      | boot boot => simp [executionDomainStatus, QuietEvidence, ActiveEvidence]
      | processGroup group boot state => simp [executionDomainStatus, QuietEvidence, ActiveEvidence]
      | windowsJob observedName state =>
        cases state with
        | active =>
          by_cases same : name = observedName <;>
            simp [executionDomainStatus, QuietEvidence, ActiveEvidence, same]
        | empty =>
          by_cases same : name = observedName <;>
            simp [executionDomainStatus, QuietEvidence, ActiveEvidence, same]
        | absent =>
          by_cases same : name = observedName <;>
            simp [executionDomainStatus, QuietEvidence, ActiveEvidence, same]

namespace Proofs

theorem I1_quiescence_exact : PluginSdk.Installer.Execution.I1_quiescence_exact model := by
  intro input
  exact (classification input).1

theorem I2_activity_exact : PluginSdk.Installer.Execution.I2_activity_exact model := by
  intro input
  exact (classification input).2.1

theorem I3_unknown_exact : PluginSdk.Installer.Execution.I3_unknown_exact model := by
  intro input
  exact (classification input).2.2

theorem I4_job_accounting_not_completion :
    PluginSdk.Installer.Execution.I4_job_accounting_not_completion model := by
  intro name observedName state
  cases state <;> by_cases same : name = observedName <;>
    simp [model, executionDomainStatus, same]

end Proofs

end PluginSdk.Installer.Execution
