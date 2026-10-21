import { Schema } from "effect"

export const OrganizationId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/OrganizationId"))
export type OrganizationId = typeof OrganizationId.Type
export const IssuerId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/IssuerId"))
export type IssuerId = typeof IssuerId.Type
export const SubjectId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/SubjectId"))
export type SubjectId = typeof SubjectId.Type
export const GroupId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/GroupId"))
export type GroupId = typeof GroupId.Type
export const RoleId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/RoleId"))
export type RoleId = typeof RoleId.Type
export const ServiceId = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/ServiceId"))
export type ServiceId = typeof ServiceId.Type
export const ToolName = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/ToolName"))
export type ToolName = typeof ToolName.Type
export const Scope = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/Scope"))
export type Scope = typeof Scope.Type
export const PolicyRevision = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/PolicyRevision"))
export type PolicyRevision = typeof PolicyRevision.Type
export const MembershipRevision = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/MembershipRevision"))
export type MembershipRevision = typeof MembershipRevision.Type
export const ContractDigest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(Schema.brand("pluginsdk/ContractDigest"))
export type ContractDigest = typeof ContractDigest.Type

const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
export const Instant = Milliseconds.pipe(Schema.brand("pluginsdk/Instant"))
export type Instant = typeof Instant.Type
export const Duration = Milliseconds.pipe(Schema.brand("pluginsdk/Duration"))
export type Duration = typeof Duration.Type

export const PrincipalKey = Schema.Struct({ organization: OrganizationId, issuer: IssuerId, subject: SubjectId })
export type PrincipalKey = typeof PrincipalKey.Type
export const VerifiedPrincipal = Schema.Struct({ ...PrincipalKey.fields, scopes: Schema.Array(Scope), expiresAt: Instant })
export type VerifiedPrincipal = typeof VerifiedPrincipal.Type

export const ToolPermission = Schema.Struct({ service: ServiceId, tool: ToolName })
export type ToolPermission = typeof ToolPermission.Type
export const ToolRule = Schema.Struct({ permission: ToolPermission, contract: ContractDigest, scopes: Schema.Array(Scope) })
export type ToolRule = typeof ToolRule.Type
export const RoleBinding = Schema.Struct({ issuer: IssuerId, group: GroupId, role: RoleId })
export type RoleBinding = typeof RoleBinding.Type
export const RoleGrant = Schema.Struct({ role: RoleId, permission: ToolPermission })
export type RoleGrant = typeof RoleGrant.Type

export const AccessPolicy = Schema.Struct({
  organization: OrganizationId,
  revision: PolicyRevision,
  observedAt: Instant,
  tools: Schema.Array(ToolRule),
  bindings: Schema.Array(RoleBinding),
  grants: Schema.Array(RoleGrant)
})
export type AccessPolicy = typeof AccessPolicy.Type

export const MembershipSnapshot = Schema.Struct({
  principal: PrincipalKey,
  revision: MembershipRevision,
  observedAt: Instant,
  groups: Schema.Array(GroupId)
})
export type MembershipSnapshot = typeof MembershipSnapshot.Type

export const UnavailableReason = Schema.Literals(["policy_unavailable", "membership_unavailable"])
export type UnavailableReason = typeof UnavailableReason.Type
export const ReadyFacts = Schema.Struct({
  type: Schema.Literal("ready"),
  principal: VerifiedPrincipal,
  policy: AccessPolicy,
  membership: MembershipSnapshot
})
export type ReadyFacts = typeof ReadyFacts.Type
export const AuthorizationFacts = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unverified") }),
  Schema.Struct({ type: Schema.Literal("unavailable"), reason: UnavailableReason }),
  ReadyFacts
]).pipe(Schema.toTaggedUnion("type"))
export type AuthorizationFacts = typeof AuthorizationFacts.Type

export const Invocation = Schema.Struct({ organization: OrganizationId, permission: ToolPermission, contract: ContractDigest })
export type Invocation = typeof Invocation.Type
export const FreshnessBounds = Schema.Struct({ policy: Duration, membership: Duration })
export type FreshnessBounds = typeof FreshnessBounds.Type
export const ApplicationAccess = Schema.Literals(["unknown", "denied", "allowed"])
export type ApplicationAccess = typeof ApplicationAccess.Type
export const AuthorizationInput = Schema.Struct({
  now: Instant,
  bounds: FreshnessBounds,
  invocation: Invocation,
  facts: AuthorizationFacts,
  applicationAccess: ApplicationAccess
})
export type AuthorizationInput = typeof AuthorizationInput.Type

export const DenialReason = Schema.Literals([
  "identity_unverified", ...UnavailableReason.literals,
  "identity_mismatch", "token_expired", "policy_stale", "membership_stale",
  "unknown_tool", "contract_mismatch", "scope_missing", "permission_missing",
  "application_unknown", "application_denied"
])
export type DenialReason = typeof DenialReason.Type
export const AuthorizationDecision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("allowed"), policy: PolicyRevision, membership: MembershipRevision }),
  Schema.Struct({ type: Schema.Literal("denied"), reason: DenialReason })
]).pipe(Schema.toTaggedUnion("type"))
export type AuthorizationDecision = typeof AuthorizationDecision.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("authorize"), input: AuthorizationInput })
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("authorize"), output: AuthorizationDecision })
export type OracleResponse = typeof OracleResponse.Type
