import PluginSdk.Distribution.Types
import PluginSdk.Compatibility.ClientPackages.Types

namespace PluginSdk.Distribution.Selection

structure Input where
  host : LocalHost
  formats : List Catalog.PackageFormat

inductive Result where
  | selected (format : Catalog.PackageFormat)
  | unavailable
  | ambiguous
  deriving DecidableEq, Repr

structure Interface where
  select : Input → Result

def CompatiblePackage : PluginSdk.Compatibility.ClientPackages.PackageClient → Catalog.PackageFormat → Bool
  | .claudeCode, .claudeCode => true
  | .claudeCode, .codex => false
  | .codex, .claudeCode => false
  | .codex, .codex => true

def Compatible (host : LocalHost) (format : Catalog.PackageFormat) : Bool :=
  (PluginSdk.Compatibility.ClientPackages.FitsClient host .claudeCode && CompatiblePackage .claudeCode format) ||
    (PluginSdk.Compatibility.ClientPackages.FitsClient host .codex && CompatiblePackage .codex format)

def CompatibleFormats (input : Input) : List Catalog.PackageFormat :=
  input.formats.filter (Compatible input.host)

end PluginSdk.Distribution.Selection
