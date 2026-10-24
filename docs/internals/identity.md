# Identity encoding

These rules are implemented in [identity.ts](../../src/internal/identity.ts) and [json.ts](../../src/internal/json.ts). Compiler tests check independent SHA-256 and canonical JSON vectors.

`BundleBody`, `PlanBody` and `RepairPlanBody` define the exact preimages. Their derived `Bundle`, `ReadyPlan` and `RepairPlan` schemas add `digest` or `id`. A hash never includes its own field.

## Canonical values

Hash the schema's encoded JSON representation. File bytes use the schema's standard Base64 encoding. Bundle files are sorted by the unsigned lexicographic order of their UTF-8 path bytes. Duplicate paths and aliases under the rendering format's rules are rejected before hashing. Installation additionally rejects aliases on the actual host. Arrays retain their resulting order.

Encode the JSON with [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785), then use its UTF-8 bytes. JCS orders object keys deterministically; it does not sort arrays or normalize Unicode strings. Invalid Unicode and duplicate JSON object keys are rejected at the input seam. General JSON serialization alone does not establish this encoding.

## Captured file identity

`FileDigest` is the lowercase SHA-256 hex digest of the raw captured bytes. Its preimage has no prefix or metadata. The executable bit is tracked separately, so equal bytes share a content identity even when their source modes differ.

## Bundle digest

The bundle preimage is the encoded `BundleBody`: schema version, plugin ID, rendering format, and canonical file entries. Each file contributes its path, content, and executable bit.

```text
BundleDigest = lowercase_hex(SHA256(
  UTF8("pluginsdk:bundle:1\0") || JCS(encoded BundleBody)
))
```

The prefix ends with one zero byte. No newline is appended. File order must already be canonical before a `Bundle` is returned or accepted for installation.

For a compiler model copy entry, the byte payload is the captured content identified by `FileDigest`, with its captured executable bit. For a generated JSON entry, the payload is the object's JCS bytes without a trailing newline, and its executable bit is false. Model file identities are not substituted for byte payloads in `BundleBody`.

An imported bundle is checked in its committed order. Sorting its files or replacing a digest would change the artifact under review. `Installer.plan` rejects invalid input with `BundleRejected`. [Bundle acceptance](bundle.md) specifies private snapshots, canonical paths, native validation, and the formal digest comparison. The implementation recomputes the digest from the same private byte snapshot it validates, persists and stages.

## Reviewed MCP contract

Canonicalize a reviewed contract by rejecting repeated exact tool names and sorting the complete tool definitions by the unsigned lexicographic order of UTF-8 name bytes. Names are case-sensitive and are not trimmed or Unicode-normalized. Preserve arrays inside each tool definition.

```text
ToolMetadataDigest = lowercase_hex(SHA256(
  UTF8("pluginsdk:mcp-tool:1\0") || JCS(encoded McpTool)
))
ContractDigest = lowercase_hex(SHA256(
  UTF8("pluginsdk:mcp-contract:1\0") || JCS(encoded canonical McpContract)
))
```

The complete contract commits to schema version, organization, service, declared protocol and all tool JSON, including extension metadata. Changing any of those changes the preimage. The descriptor model treats per-tool digests as opaque identities; private JSON capture, hashing and faithful materialization remain implementation obligations.

An artifact pin is the raw SHA-256 of the complete archive bytes, without a prefix. It has a separate type and preimage from the reviewed contract digest. Contract and artifact digests establish content identity; they do not authenticate a service or confer tool permissions.

## Plan ID

The plan preimage is the encoded `PlanBody`: ready tag, schema version, resolved target, before-snapshot, and change. It includes the before-state's journal revision and the complete bundle when one is required.

A cleanup uses the encoded `RepairPlanBody` with the same prefix: `repair_ready` tag, schema version, resolved target and repair basis. The basis commits to the interrupted original plan, current pending plan, residual kind and native fingerprint. It contains no ordinary `change` field. The distinct tag separates these two preimages while preserving existing ordinary plan IDs. [Storage checks](../../test/repair-storage.test.ts) include independent canonical JSON and SHA-256 golden values for both forms.

```text
PlanId = lowercase_hex(SHA256(
  UTF8("pluginsdk:plan:1\0") || JCS(encoded PlanBody)
))
```

Two previews of the same body have the same ID. Once an attempt completes, even as `not_applied`, its ID becomes the journal revision. A new preview includes that revision, so it commits to a different body. A retry of a retained plan keeps the original ID and body.

An installed payload's identity can refer to an older plan than the current journal revision. The payload records the installation that produced it; the revision records the latest acknowledged attempt. Fingerprint encoding belongs to the qualified native profile and must be pinned with that profile's revision.

## Distribution identities

Each distribution step commits to its destination label and complete operation. The operation contains either a complete native installation plan or an unchanged target, before-snapshot and desired intent. Its descriptor also records the physical installation key.

```text
StepDigest = lowercase_hex(SHA256(
  UTF8("pluginsdk:distribution-step:1\0") || JCS(encoded Step)
))
DistributionPlanId = lowercase_hex(SHA256(
  UTF8("pluginsdk:distribution-plan:1\0") || JCS(encoded Distribution.PlanBody)
))
```

The distribution body contains schema version, ready tag, desired presence, complete approved release and complete steps. It excludes its own ID. Steps are ordered by UTF-8 destination-label bytes; repeated labels and physical installations reject before hashing. The identity is unchanged by request enumeration order. Distribution IDs, step digests and native plan IDs have separate brands and prefixes.

The state store retains the full plan and validates each recorded outcome against its exact ordered descriptors. A digest alone does not establish that an outcome is valid. The native CLI pilot independently checks the distribution preimage; runtime tests reject schema-valid identity, ordering and receipt substitutions.

The Lean models treat these digests as input symbols. Cryptographic properties, canonical codecs, faithful descriptor projection and native fingerprints need separate implementation checks.
