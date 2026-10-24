import PluginSdk.Authorization.Types
import PluginSdk.Domain

namespace PluginSdk.Catalog

structure IntegrationId where
  value : String
  deriving DecidableEq, Repr
structure ReleaseId where
  value : String
  deriving DecidableEq, Repr
structure ReleaseKey where
  organization : Authorization.OrganizationId
  integration : IntegrationId
  release : ReleaseId
  deriving DecidableEq, Repr

inductive ReleaseOrigin where
  | repository (repository commit path : String)
  | artifact (location digest : String)
  deriving DecidableEq, Repr

abbrev PackageFormat := PluginSdk.Format

structure FormatDigests where
  claudeCode : Option String
  codex : Option String
  deriving DecidableEq, Repr

inductive ReleaseContents where
  | plugin (plugin : String) (packages : FormatDigests)
  | mcp (service : Authorization.ServiceId) (contract : Authorization.ContractDigest)
  deriving DecidableEq, Repr

structure Release where
  key : ReleaseKey
  version : String
  origin : ReleaseOrigin
  contents : ReleaseContents
  deriving DecidableEq, Repr

abbrev ReleaseLedger := List Release

inductive Registration where
  | registered (ledger : ReleaseLedger)
  | unchanged
  | conflict
  deriving DecidableEq, Repr

inductive ReleaseTarget where
  | plugin (format : PackageFormat)
  | mcp
  deriving DecidableEq, Repr

inductive SelectedArtifact where
  | plugin (plugin : String) (format : PackageFormat) (digest : String)
  | mcp (service : Authorization.ServiceId) (contract : Authorization.ContractDigest)
  deriving DecidableEq, Repr

inductive BlockReason where
  | releaseMissing
  | releaseConflict
  | kindMismatch
  | formatUnavailable
  deriving DecidableEq, Repr

inductive Resolution where
  | resolved (release : Release) (artifact : SelectedArtifact)
  | blocked (reason : BlockReason)
  deriving DecidableEq, Repr

structure Interface where
  register : ReleaseLedger → Release → Registration
  resolve : ReleaseLedger → ReleaseKey → ReleaseTarget → Resolution

end PluginSdk.Catalog
