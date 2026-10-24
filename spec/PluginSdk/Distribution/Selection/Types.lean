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
  | .claudeCode, .claudeCodeV1 | .claudeCode, .claudeCodeV2
  | .claudeCode, .claudeCodeV3 | .claudeCode, .claudeCodeV4
  | .claudeCode, .claudeCodeV5 | .claudeCode, .claudeCodePortableV1
  | .claudeCode, .claudeCodePortableV2 => true
  | .codex, .agentPluginsV1 | .codex, .agentPluginsV2
  | .codex, .agentPluginsV3 | .codex, .codexPluginV1 | .codex, .codexPluginV2
  | .codex, .codexPluginPortableV1 | .codex, .codexPluginPortableV2 => true
  | .claudeCode, .agentPluginsV1 | .claudeCode, .agentPluginsV2
  | .claudeCode, .agentPluginsV3 | .claudeCode, .codexPluginV1
  | .claudeCode, .codexPluginV2 | .claudeCode, .codexPluginPortableV1
  | .claudeCode, .codexPluginPortableV2 => false
  | .codex, .claudeCodeV1 | .codex, .claudeCodeV2
  | .codex, .claudeCodeV3 | .codex, .claudeCodeV4 | .codex, .claudeCodeV5
  | .codex, .claudeCodePortableV1 | .codex, .claudeCodePortableV2 => false

def Compatible (host : LocalHost) (format : Catalog.PackageFormat) : Bool :=
  (PluginSdk.Compatibility.ClientPackages.FitsClient host .claudeCode && CompatiblePackage .claudeCode format) ||
    (PluginSdk.Compatibility.ClientPackages.FitsClient host .codex && CompatiblePackage .codex format)

def CompatibleFormats (input : Input) : List Catalog.PackageFormat :=
  input.formats.filter (Compatible input.host)

end PluginSdk.Distribution.Selection
