# Per-invocation authorization

## Caller and outcome

An existing MCP service receives a tool call. Its authentication integration supplies a verified principal, current policy and current group membership. Its application checks permission to operate on the requested records. The internal pure interface returns an authorization decision for that invocation:

```ts
declare const input: AuthorizationInput
declare const authorize: (input: AuthorizationInput) => AuthorizationDecision
const decision = authorize(input)
```

The MCP handler enforces the decision before invoking the tool. The same approved integration can serve a reader and an administrator from different clients. A reader cannot gain an administrative tool by calling its name directly, changing clients or keeping an old tool list.

This is the first contract slice of the [organization design](organization-design.md). The schemas and Lean obligations are internal. They do not add a public runtime service or claim implemented OAuth, membership retrieval, policy deployment or workspace distribution. Hosting and identity remain with the company's existing infrastructure.

## Candidates and synthesis

| Candidate | Caller knowledge and hidden behavior | Decision |
| --- | --- | --- |
| Compile one plugin per role | Callers select a role package and synchronize access changes across installations. A copied package can still invoke a backend unless the backend authorizes it. | Reject as an authorization mechanism. |
| Export a generic rule engine | Each service composes rules, chooses precedence, manages time and constructs its own tenant and identity checks. The security invariant spreads across callers. | Reject the exposed policy pipeline. |
| One pure invocation decision over trusted evidence | The model owns identity binding, freshness, contract identity, scopes, role grants and application restrictions. Existing I/O establishes the evidence. | Select. |

`authorize` earns its seam by keeping the invocation restrictions consistent across existing MCP services. Its implementation remains independent of the agent client's manifest, UI and tool cache. Discovery may filter available tools for usability; it cannot substitute for this invocation check. The external authentication and application adapters retain their own knowledge; the pure model never interprets bearer tokens or guesses group membership.

## Contract

[Authorization.ts](../contracts/Authorization.ts) is the authoritative Effect schema. `PrincipalKey` is organization, issuer and subject. Membership must bind that exact key. A policy belongs to the invocation's organization. A tool permission names a service and exact tool, so equal tool names in two applications do not share a grant.

Facts are `unverified`, `unavailable` with the missing authority, or `ready` with a verified principal, policy and membership snapshot. Readiness establishes availability, not permission. Tenant and subject binding, token lifetime and freshness are still checked by the model.

The policy declares tool rules, issuer-qualified group-to-role bindings and exact role grants. A grant without a matching tool declaration does not authorize a newly introduced tool. All matching rules must name the invoked contract digest, and every scope they require must exist in the verified token. Duplicate declarations are conjunctive restrictions; order grants no precedence. Bindings and grants are additive within those restrictions. There are no wildcard grants or implicit administrator privileges.

For ready facts, evaluation checks identity binding, token expiry, policy freshness, membership freshness, a known tool, contract agreement, scopes and an effective role grant. Application access is then `unknown`, `denied` or `allowed`. Only `allowed` can complete authorization. Missing role permission is reported before record-level access, so a revoked user does not learn a resource-specific denial through this decision.

An allowed result records policy and membership revisions for audit. It is a decision about the supplied invocation and evidence, not a credential or a reusable execution permit. A new call needs a new decision. Native client restrictions may prevent a call; they cannot grant backend permission.

The service supplies every input from trusted integrations, including its clock, freshness bounds, invoked contract and application-access result for this call's actual records. Decoding `ready` establishes structure, not authentication. An incoming MCP request must not supply its own trusted facts or application-access result. These producer and enforcement obligations need I/O acceptance.

## Freshness and revocation

Instants and durations are nonnegative safe integer milliseconds. A snapshot is current only when its observation is not in the future and its age is at most the configured bound. A token expires at its deadline: equality is expired. Policy and membership have separate freshness bounds.

The evidence producer retains the time it last checked the authority. Reading a cached record must not reset that observation time. The service captures `now` after gathering evidence and uses the same clock basis for all observations. After the freshness bound, unavailable authority yields denial rather than extending a cached grant.

Refreshing membership or policy can revoke a grant while the token and plugin remain installed. Revocation means removing every effective grant for the invocation; another valid role can still grant the same permission. End-to-end revocation latency also includes the identity provider's propagation delay and clock behavior. The pure model proves its snapshot-age condition; actual latency needs I/O acceptance.

## LDD obligations

| ID | Required claim |
| --- | --- |
| U1 | Unverified or unavailable evidence never permits invocation. |
| U2 | An allowed invocation binds organization, issuer and subject to the correct policy and membership. |
| U3 | Allowing requires an unexpired token and current policy and membership observations. |
| U4 | Allowing requires a declared tool and agreement with every applicable contract digest. |
| U5 | Every applicable scope and application permission is required. |
| U6 | Allowing requires an issuer-qualified group binding and an exact role grant for that service and tool. |
| U7 | A complete eligible invocation with an effective grant and application access succeeds and returns the evidence revisions. |
| U8 | Removing all effective grants from otherwise eligible evidence denies the invocation, including when application access is still allowed. |

U7 rules out an implementation that rejects everything. The independent predicates in Lean specify the required facts, and the executable model proves these exact statements. The [certificates](../spec/PluginSdk/Authorization/Proofs.lean) pass the exact-statement and axiom audit. The oracle checks 49 independently specified vectors and rejects 277 malformed wire inputs. Vectors cover two applications, reader/admin calls, cross-tenant and cross-issuer inputs, unknown tools, conflicting declarations, token expiry and freshness boundaries.

The [TypeScript model](../src/model/authorization.ts) uses exhaustive Effect `Match` and schema-derived equality. Its [conformance tests](../test/authorization.test.ts) compare those 49 vectors, 120 generated combinations and a three-call revocation sequence with Lean. They also check enumeration order and schema rejection. The revocation sequence repeats the same invocation with refreshed evidence; neither a cached discovery result nor an installed package participates in the decision.

These properties cover the authorization portion of organization O3 through O7. They do not complete catalog identity O1, client compatibility O2, rollout recovery O8 or the I/O part of revocation O7. Existing MCP integrations must separately prove token verification and audience binding, trusted membership retrieval, current policy and contract observations, record-level authorization and direct-call enforcement.
