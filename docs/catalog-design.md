# Immutable release catalog

## Outcome and current flow

The compiler captures one plugin and returns complete native bundles with content digests. The installer reviews and applies one of those bundles. Neither module owns a company's release history. Organization distribution needs to choose the same approved content without fetching a mutable source tag or asking every caller to compare native package metadata.

The first catalog slice is an internal, pure release ledger. It admits immutable releases and resolves an organization-qualified release reference to a requested package or MCP contract. It performs no repository fetch, storage write, publication or authentication. The owning I/O module will verify artifacts and serialize catalog updates before using this model.

## Caller and alternatives

```ts
declare const ledger: ReleaseLedger
declare const release: Release
const registration = register(ledger, release)
const selected = resolve(ledger, release.key, {
  type: "plugin",
  format: "claude_code_v2"
})
```

| Candidate | Caller knowledge | Decision |
| --- | --- | --- |
| Resolve a repository tag on every distribution | Every rollout must detect changed content, compare native packages and preserve the old source. | Reject. A version label cannot establish immutable identity. |
| Expose a mutable map from names to URLs | Callers implement tenant isolation, update rules and package selection. Provenance can disappear during an update. | Reject. It moves the catalog rules into callers. |
| Admit immutable releases under organization-qualified keys | The model owns identity reuse, replay, conflict detection and exact artifact selection. Source ownership can change while catalog identities remain stable. | Select. |

The main thread selects the release ledger. `register` and `resolve` are internal pure functions, not new public runtime methods. Entry ownership, audiences, distribution state and storage belong to subsequent organization slices. The plugin authoring example does not change.

## Contract

A release key contains organization, integration and release IDs. The release includes a display version, pinned provenance and either plugin packages or an MCP contract. Repository provenance names an exact Git commit and contained source path. Artifact provenance names a location and digest. Locators are opaque provenance identifiers; this slice does not execute, fetch or grant authority to them.

Plugin releases retain the plugin identity and a nonempty map of native formats to bundle digests. Format enumeration order carries no precedence. MCP releases retain an exact service identity and reviewed tool-contract digest. Deployment endpoints remain separate from a contract release.

An absent key can be registered. Re-registering the complete same release returns `unchanged`. Any existing different release under that key returns `conflict`, including changes to provenance, version, kind, service, contract or package digest. Registration never replaces an old entry. A new approved release needs a new release ID. Responsibility for an integration can change independently of its release history; it is not part of immutable release content.

Resolution rejects a missing key or conflicting records. Identical duplicate records have the same meaning. A successful result returns the complete retained release and precisely the requested artifact. Asking for another kind or an absent format is blocked; a different format is never substituted. Format availability does not qualify a client, organization API or permissions. Those checks remain distribution obligations.

The ledger is trusted persisted state. An unavailable store must not be represented by an empty ledger. Concurrent writers need atomic admission against the same observed revision. Artifact producers must verify the bytes committed by each bundle or contract digest; the pure model cannot verify a network response or detect a rewritten store. Its immutability claim applies to transitions through `register`.

## LDD obligations

| ID | Required claim |
| --- | --- |
| C1 | Registration adds exactly the proposed release, and only if its key was absent. |
| C2 | A different existing release under the same key rejects registration. |
| C3 | Replaying a consistent existing release leaves the ledger unchanged. |
| C4 | Registration preserves every old record and introduces no new record under an old key. |
| C5 | A resolved artifact comes from a consistent, exactly matching qualified key and preserves the requested kind, format and content identity. |
| C6 | A consistent existing release with the requested artifact resolves successfully. |

C6 rules out a model that rejects everything. The independent selection relation specifies artifact correspondence. Effect schemas, Lean types and properties come first, followed by the Lean model and proofs, strict oracle vectors, then conforming TypeScript. These properties establish the pure admission and selection portion of organization O1. They do not complete artifact verification, client compatibility O2 or rollout recovery O8.

All six properties have checked proof certificates. The strict oracle matches 41 independent vectors and rejects 481 malformed requests. Five TypeScript tests compare those vectors and 144 generated requests with Lean, then check promotion, enumeration order and schema rejection. Catalog I/O remains unimplemented.
