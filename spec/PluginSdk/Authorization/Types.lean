namespace PluginSdk.Authorization

structure OrganizationId where
  value : String
  deriving DecidableEq, Repr
structure IssuerId where
  value : String
  deriving DecidableEq, Repr
structure SubjectId where
  value : String
  deriving DecidableEq, Repr
structure GroupId where
  value : String
  deriving DecidableEq, Repr
structure RoleId where
  value : String
  deriving DecidableEq, Repr
structure ServiceId where
  value : String
  deriving DecidableEq, Repr
structure ToolName where
  value : String
  deriving DecidableEq, Repr
structure Scope where
  value : String
  deriving DecidableEq, Repr
structure PolicyRevision where
  value : String
  deriving DecidableEq, Repr
structure MembershipRevision where
  value : String
  deriving DecidableEq, Repr
structure ContractDigest where
  value : String
  deriving DecidableEq, Repr
structure Instant where
  value : Nat
  deriving DecidableEq, Repr
structure Duration where
  value : Nat
  deriving DecidableEq, Repr

structure PrincipalKey where
  organization : OrganizationId
  issuer : IssuerId
  subject : SubjectId
  deriving DecidableEq, Repr
structure VerifiedPrincipal where
  key : PrincipalKey
  scopes : List Scope
  expiresAt : Instant
  deriving DecidableEq, Repr
structure ToolPermission where
  service : ServiceId
  tool : ToolName
  deriving DecidableEq, Repr
structure ToolRule where
  permission : ToolPermission
  contract : ContractDigest
  scopes : List Scope
  deriving DecidableEq, Repr
structure RoleBinding where
  issuer : IssuerId
  group : GroupId
  role : RoleId
  deriving DecidableEq, Repr
structure RoleGrant where
  role : RoleId
  permission : ToolPermission
  deriving DecidableEq, Repr
structure AccessPolicy where
  organization : OrganizationId
  revision : PolicyRevision
  observedAt : Instant
  tools : List ToolRule
  bindings : List RoleBinding
  grants : List RoleGrant
  deriving DecidableEq, Repr
structure MembershipSnapshot where
  principal : PrincipalKey
  revision : MembershipRevision
  observedAt : Instant
  groups : List GroupId
  deriving DecidableEq, Repr

inductive UnavailableReason where
  | policy
  | membership
  deriving DecidableEq, Repr
structure ReadyFacts where
  principal : VerifiedPrincipal
  policy : AccessPolicy
  membership : MembershipSnapshot
  deriving DecidableEq, Repr
inductive AuthorizationFacts where
  | unverified
  | unavailable (reason : UnavailableReason)
  | ready (facts : ReadyFacts)
  deriving DecidableEq, Repr
structure Invocation where
  organization : OrganizationId
  permission : ToolPermission
  contract : ContractDigest
  deriving DecidableEq, Repr
structure FreshnessBounds where
  policy : Duration
  membership : Duration
  deriving DecidableEq, Repr
inductive ApplicationAccess where
  | unknown
  | denied
  | allowed
  deriving DecidableEq, Repr
structure Input where
  now : Instant
  bounds : FreshnessBounds
  invocation : Invocation
  facts : AuthorizationFacts
  applicationAccess : ApplicationAccess
  deriving DecidableEq, Repr

inductive DenialReason where
  | identityUnverified
  | policyUnavailable
  | membershipUnavailable
  | identityMismatch
  | tokenExpired
  | policyStale
  | membershipStale
  | unknownTool
  | contractMismatch
  | scopeMissing
  | permissionMissing
  | applicationUnknown
  | applicationDenied
  deriving DecidableEq, Repr
inductive Decision where
  | allowed (policy : PolicyRevision) (membership : MembershipRevision)
  | denied (reason : DenialReason)
  deriving DecidableEq, Repr

structure Interface where
  authorize : Input → Decision

end PluginSdk.Authorization
