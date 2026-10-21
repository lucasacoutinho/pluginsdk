import PluginSdk.Catalog.Types

namespace PluginSdk.Catalog

def register (ledger : ReleaseLedger) (release : Release) : Registration :=
  if ledger.any (fun prior => decide (prior.key = release.key ∧ prior ≠ release)) then
    .conflict
  else if ledger.any (fun prior => decide (prior.key = release.key)) then
    .unchanged
  else .registered (ledger ++ [release])

def packageDigest (packages : FormatDigests) : PackageFormat → Option String
  | .agentPluginsV1 => packages.agentPluginsV1
  | .claudeCodeV1 => packages.claudeCodeV1
  | .agentPluginsV2 => packages.agentPluginsV2
  | .claudeCodeV2 => packages.claudeCodeV2

def selectArtifact (release : Release) (target : ReleaseTarget) : Resolution :=
  match release.contents, target with
  | .plugin plugin packages, .plugin format =>
    match packageDigest packages format with
    | some digest => .resolved release (.plugin plugin format digest)
    | none => .blocked .formatUnavailable
  | .mcp service contract, .mcp => .resolved release (.mcp service contract)
  | .plugin _ _, .mcp | .mcp _ _, .plugin _ => .blocked .kindMismatch

def resolve (ledger : ReleaseLedger) (key : ReleaseKey) (target : ReleaseTarget) : Resolution :=
  match ledger.filter (fun prior => decide (prior.key = key)) with
  | [] => .blocked .releaseMissing
  | first :: rest =>
    if rest.all (fun prior => decide (prior = first)) then selectArtifact first target
    else .blocked .releaseConflict

def model : Interface := ⟨register, resolve⟩

end PluginSdk.Catalog
