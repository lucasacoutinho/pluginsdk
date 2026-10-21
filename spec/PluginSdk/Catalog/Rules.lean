import PluginSdk.Catalog.Types

namespace PluginSdk.Catalog

def FormatDigest (packages : FormatDigests) (format : PackageFormat) (digest : String) : Prop :=
  match format with
  | .agentPluginsV1 => packages.agentPluginsV1 = some digest
  | .claudeCodeV1 => packages.claudeCodeV1 = some digest
  | .agentPluginsV2 => packages.agentPluginsV2 = some digest
  | .claudeCodeV2 => packages.claudeCodeV2 = some digest

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
