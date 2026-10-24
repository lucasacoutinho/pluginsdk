import PluginSdk.Catalog.Types

namespace PluginSdk.Compatibility

inductive Host where
  | claudeCode | codex | cursor | grokBot | muse
  deriving DecidableEq, Repr

inductive Scope where
  | user | project
  deriving DecidableEq, Repr

structure RuntimePlatform where
  value : String
  deriving DecidableEq, Repr

structure RuntimeVersion where
  value : String
  deriving DecidableEq, Repr

structure AdapterRevision where
  value : String
  deriving DecidableEq, Repr

structure ProfileIdentity where
  host : Host
  platform : RuntimePlatform
  version : RuntimeVersion
  scope : Scope
  revision : AdapterRevision
  deriving DecidableEq, Repr

structure NativeProfile where
  identity : ProfileIdentity
  formats : List Catalog.PackageFormat
  deriving DecidableEq, Repr

structure ProfileQuery where
  host : Host
  platform : RuntimePlatform
  version : RuntimeVersion
  scope : Scope
  format : Option Catalog.PackageFormat
  deriving DecidableEq, Repr

structure SelectionInput where
  query : ProfileQuery
  profiles : List NativeProfile

inductive Selection where
  | selected (profile : NativeProfile)
  | unqualified
  | ambiguous
  deriving DecidableEq, Repr

structure OwnershipInput where
  current : ProfileIdentity
  retained : ProfileIdentity
  profiles : List NativeProfile

structure Interface where
  select : SelectionInput → Selection
  ownershipCompatible : OwnershipInput → Bool

def Eligible (query : ProfileQuery) (profile : NativeProfile) : Prop :=
  profile.identity.host = query.host ∧ profile.identity.platform = query.platform ∧
  profile.identity.version = query.version ∧ profile.identity.scope = query.scope ∧
  (match query.format with | none => True | some format => format ∈ profile.formats)

instance (query : ProfileQuery) (profile : NativeProfile) : Decidable (Eligible query profile) := by
  cases query with
  | mk host platform version scope format =>
    cases format <;> dsimp [Eligible] <;> infer_instance

def EligibleProfiles (input : SelectionInput) : List NativeProfile :=
  input.profiles.filter (fun profile => decide (Eligible input.query profile))

def Registrations (profiles : List NativeProfile) (identity : ProfileIdentity) : List NativeProfile :=
  profiles.filter (fun profile => profile.identity == identity)

def UniqueRegistration (profiles : List NativeProfile) (identity : ProfileIdentity) : Prop :=
  (Registrations profiles identity).length = 1

def SameAdapter (current retained : ProfileIdentity) : Prop :=
  current.host = retained.host ∧ current.platform = retained.platform ∧
  current.scope = retained.scope ∧ current.revision = retained.revision

instance (current retained : ProfileIdentity) : Decidable (SameAdapter current retained) :=
  inferInstanceAs (Decidable (_ ∧ _ ∧ _ ∧ _))

end PluginSdk.Compatibility
