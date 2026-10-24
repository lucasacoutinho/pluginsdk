import PluginSdk.Catalog.Types
import PluginSdk.Compatibility.ClientPackages.Types
import PluginSdk.Compiler.Canonical

namespace PluginSdk.Distribution

abbrev LocalHost := PluginSdk.Compatibility.ClientPackages.Client

structure TargetId where
  value : String
  deriving DecidableEq, Repr

structure InstallationKey where
  value : String
  deriving DecidableEq, Repr

structure StepDigest where
  value : String
  deriving DecidableEq, Repr

structure DistributionPlanId where
  value : String
  deriving DecidableEq, Repr

inductive Desired where
  | present
  | absent
  deriving DecidableEq, Repr

structure StepDescriptor where
  target : TargetId
  installation : InstallationKey
  digest : StepDigest
  deriving DecidableEq, Repr

end PluginSdk.Distribution
