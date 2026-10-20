# Identity encoding

These rules are implemented in [identity.ts](../src/internal/identity.ts) and [json.ts](../src/internal/json.ts). Compiler tests check independent SHA-256 and canonical JSON vectors.

`BundleBody` and `PlanBody` define the exact preimages. Their derived `Bundle` and `ReadyPlan` schemas add `digest` and `id`, respectively. A hash never includes its own field.

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

## Plan ID

The plan preimage is the encoded `PlanBody`: ready tag, schema version, resolved target, before-snapshot, and change. It includes the before-state's journal revision and the complete bundle when one is required.

```text
PlanId = lowercase_hex(SHA256(
  UTF8("pluginsdk:plan:1\0") || JCS(encoded PlanBody)
))
```

Two previews of the same body have the same ID. Once an attempt completes, even as `not_applied`, its ID becomes the journal revision. A new preview includes that revision, so it commits to a different body. A retry of a retained plan keeps the original ID and body.

An installed payload's identity can refer to an older plan than the current journal revision. The payload records the installation that produced it; the revision records the latest acknowledged attempt. Fingerprint encoding belongs to the qualified native profile and must be pinned with that profile's revision.

The Lean model treats these digests as input symbols. Cryptographic properties, canonical codecs, and native fingerprints need separate implementation checks.
