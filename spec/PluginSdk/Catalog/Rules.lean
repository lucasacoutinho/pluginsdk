import PluginSdk.Catalog.Types

namespace PluginSdk.Catalog

def FormatDigest (packages : FormatDigests) (format : PackageFormat) (digest : String) : Prop :=
  match format with
  | .agentPluginsV1 => packages.agentPluginsV1 = some digest
  | .claudeCodeV1 => packages.claudeCodeV1 = some digest
  | .agentPluginsV2 => packages.agentPluginsV2 = some digest
  | .claudeCodeV2 => packages.claudeCodeV2 = some digest
  | .agentPluginsV3 => packages.agentPluginsV3 = some digest
  | .claudeCodeV3 => packages.claudeCodeV3 = some digest
  | .claudeCodeV4 => packages.claudeCodeV4 = some digest
  | .codexPluginV1 => packages.codexPluginV1 = some digest
  | .claudeCodeV5 => packages.claudeCodeV5 = some digest
  | .codexPluginV2 => packages.codexPluginV2 = some digest
  | .claudeCodePortableV1 => packages.claudeCodePortableV1 = some digest
  | .codexPluginPortableV1 => packages.codexPluginPortableV1 = some digest
  | .claudeCodePortableV2 => packages.claudeCodePortableV2 = some digest
  | .codexPluginPortableV2 => packages.codexPluginPortableV2 = some digest

def Selects (release : Release) (target : ReleaseTarget) (artifact : SelectedArtifact) : Prop :=
  match release.contents, target, artifact with
  | .plugin plugin packages, .plugin format, .plugin selected selectedFormat digest =>
      plugin = selected ∧ format = selectedFormat ∧ FormatDigest packages format digest
  | .mcp service contract, .mcp, .mcp selected selectedContract =>
      service = selected ∧ contract = selectedContract
  | _, _, _ => False

def ConsistentKey (ledger : ReleaseLedger) (release : Release) : Prop :=
  ∀ prior ∈ ledger, prior.key = release.key → prior = release

def StateAfter (ledger : ReleaseLedger) : Registration → ReleaseLedger
  | .registered next => next
  | .unchanged | .conflict => ledger

end PluginSdk.Catalog
