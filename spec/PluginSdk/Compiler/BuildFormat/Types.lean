import PluginSdk.Catalog.Types
import PluginSdk.Compiler.Process.Types

namespace PluginSdk.Compiler.BuildFormat

structure Input where
  client : Process.Host
  hasAgents : Bool
  hasHooks : Bool
  hasStdio : Bool
  deriving DecidableEq

structure Interface where
  select : Input → Catalog.PackageFormat

end PluginSdk.Compiler.BuildFormat
