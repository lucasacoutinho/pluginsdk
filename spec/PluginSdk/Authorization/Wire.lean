import PluginSdk.Authorization.Model
import PluginSdk.WireJson

namespace PluginSdk.Authorization.Wire

open Lean (Json)
open WireJson

private def readName (json : Json) : Except String String := do
  let name ← json.getStr?
  if name.isEmpty then throw "expected a nonempty identity"
  return name

private def readMilliseconds (json : Json) : Except String Nat := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= 0.0 && value <= 9007199254740991.0 &&
      value.toUInt64.toFloat == value do
    throw "expected nonnegative safe integer milliseconds"
  return value.toUInt64.toNat

private def readList {α : Type} (read : Json → Except String α) (json : Json) :
    Except String (List α) := do
  (← json.getArr?).toList.mapM read

private def readPrincipalKey (json : Json) : Except String PrincipalKey := do
  checkFields json ["organization", "issuer", "subject"]
  return ⟨⟨← readName (← json.getObjVal? "organization")⟩,
    ⟨← readName (← json.getObjVal? "issuer")⟩,
    ⟨← readName (← json.getObjVal? "subject")⟩⟩

private def readPrincipal (json : Json) : Except String VerifiedPrincipal := do
  checkFields json ["organization", "issuer", "subject", "scopes", "expiresAt"]
  let key : PrincipalKey := ⟨⟨← readName (← json.getObjVal? "organization")⟩,
    ⟨← readName (← json.getObjVal? "issuer")⟩,
    ⟨← readName (← json.getObjVal? "subject")⟩⟩
  return ⟨key, ← readList (fun entry => Scope.mk <$> readName entry) (← json.getObjVal? "scopes"),
    ⟨← readMilliseconds (← json.getObjVal? "expiresAt")⟩⟩

private def readPermission (json : Json) : Except String ToolPermission := do
  checkFields json ["service", "tool"]
  return ⟨⟨← readName (← json.getObjVal? "service")⟩,
    ⟨← readName (← json.getObjVal? "tool")⟩⟩

private def readToolRule (json : Json) : Except String ToolRule := do
  checkFields json ["permission", "contract", "scopes"]
  return ⟨← readPermission (← json.getObjVal? "permission"),
    ⟨← readHex (← json.getObjVal? "contract")⟩,
    ← readList (fun entry => Scope.mk <$> readName entry) (← json.getObjVal? "scopes")⟩

private def readBinding (json : Json) : Except String RoleBinding := do
  checkFields json ["issuer", "group", "role"]
  return ⟨⟨← readName (← json.getObjVal? "issuer")⟩,
    ⟨← readName (← json.getObjVal? "group")⟩,
    ⟨← readName (← json.getObjVal? "role")⟩⟩

private def readGrant (json : Json) : Except String RoleGrant := do
  checkFields json ["role", "permission"]
  return ⟨⟨← readName (← json.getObjVal? "role")⟩,
    ← readPermission (← json.getObjVal? "permission")⟩

private def readPolicy (json : Json) : Except String AccessPolicy := do
  checkFields json ["organization", "revision", "observedAt", "tools", "bindings", "grants"]
  return ⟨⟨← readName (← json.getObjVal? "organization")⟩,
    ⟨← readName (← json.getObjVal? "revision")⟩,
    ⟨← readMilliseconds (← json.getObjVal? "observedAt")⟩,
    ← readList readToolRule (← json.getObjVal? "tools"),
    ← readList readBinding (← json.getObjVal? "bindings"),
    ← readList readGrant (← json.getObjVal? "grants")⟩

private def readMembership (json : Json) : Except String MembershipSnapshot := do
  checkFields json ["principal", "revision", "observedAt", "groups"]
  return ⟨← readPrincipalKey (← json.getObjVal? "principal"),
    ⟨← readName (← json.getObjVal? "revision")⟩,
    ⟨← readMilliseconds (← json.getObjVal? "observedAt")⟩,
    ← readList (fun entry => GroupId.mk <$> readName entry) (← json.getObjVal? "groups")⟩

private def readFacts (json : Json) : Except String AuthorizationFacts := do
  match ← (← json.getObjVal? "type").getStr? with
  | "unverified" =>
    checkFields json ["type"]
    return .unverified
  | "unavailable" =>
    checkFields json ["type", "reason"]
    match ← (← json.getObjVal? "reason").getStr? with
    | "policy_unavailable" => return .unavailable .policy
    | "membership_unavailable" => return .unavailable .membership
    | reason => throw s!"unknown unavailable authority: {reason}"
  | "ready" =>
    checkFields json ["type", "principal", "policy", "membership"]
    return .ready ⟨← readPrincipal (← json.getObjVal? "principal"),
      ← readPolicy (← json.getObjVal? "policy"),
      ← readMembership (← json.getObjVal? "membership")⟩
  | tag => throw s!"unknown authorization facts: {tag}"

private def readInvocation (json : Json) : Except String Invocation := do
  checkFields json ["organization", "permission", "contract"]
  return ⟨⟨← readName (← json.getObjVal? "organization")⟩,
    ← readPermission (← json.getObjVal? "permission"),
    ⟨← readHex (← json.getObjVal? "contract")⟩⟩

private def readBounds (json : Json) : Except String FreshnessBounds := do
  checkFields json ["policy", "membership"]
  return ⟨⟨← readMilliseconds (← json.getObjVal? "policy")⟩,
    ⟨← readMilliseconds (← json.getObjVal? "membership")⟩⟩

private def readApplicationAccess (json : Json) : Except String ApplicationAccess := do
  match ← json.getStr? with
  | "unknown" => return .unknown
  | "denied" => return .denied
  | "allowed" => return .allowed
  | value => throw s!"unknown application access: {value}"

private def readInput (json : Json) : Except String Input := do
  checkFields json ["now", "bounds", "invocation", "facts", "applicationAccess"]
  return ⟨⟨← readMilliseconds (← json.getObjVal? "now")⟩,
    ← readBounds (← json.getObjVal? "bounds"),
    ← readInvocation (← json.getObjVal? "invocation"),
    ← readFacts (← json.getObjVal? "facts"),
    ← readApplicationAccess (← json.getObjVal? "applicationAccess")⟩

private def writeDenial : DenialReason → Json
  | .identityUnverified => .str "identity_unverified"
  | .policyUnavailable => .str "policy_unavailable"
  | .membershipUnavailable => .str "membership_unavailable"
  | .identityMismatch => .str "identity_mismatch"
  | .tokenExpired => .str "token_expired"
  | .policyStale => .str "policy_stale"
  | .membershipStale => .str "membership_stale"
  | .unknownTool => .str "unknown_tool"
  | .contractMismatch => .str "contract_mismatch"
  | .scopeMissing => .str "scope_missing"
  | .permissionMissing => .str "permission_missing"
  | .applicationUnknown => .str "application_unknown"
  | .applicationDenied => .str "application_denied"

private def writeDecision : Decision → Json
  | .allowed policy membership => tagged "allowed" [
      ("policy", .str policy.value), ("membership", .str membership.value)
    ]
  | .denied reason => tagged "denied" [("reason", writeDenial reason)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "authorize" do
    throw "expected authorize request"
  let input ← readInput (← request.getObjVal? "input")
  return Json.mkObj [
    ("schema", 1), ("type", .str "authorize"), ("output", writeDecision (model.authorize input))
  ]

end PluginSdk.Authorization.Wire
