# Verified catalog packages

## Outcome and current flow

A plugin manager should admit one release with its built packages, then retrieve the exact package approved for a client. Plugin authors keep their existing definition and content. The catalog must retain complete verified bytes, so later source changes or caller mutation cannot change an admitted release.

The current compiler captures source bytes and validates its final bundle. `validateBundle` in `src/compiler/package/native.ts` recomputes the commitment, checks canonical contained paths, and validates manifests, skills, MCP and hooks. `copyBundle` creates private byte arrays. The installer uses both before persisting a reviewed plan. It does not own organization release history.

The pure catalog's `register` protects immutable organization-qualified release keys; `resolve` selects exactly the requested format and digest. Those functions receive trusted release metadata and retain no artifact bytes. C1-C6 therefore cannot establish that a matching package exists. `ReleaseCatalog` owns that connection: verified package capture, immutable admission and serialized storage. Compiler and Installer keep their existing responsibilities.

Installer storage provides scoped advisory locking and file-sync/rename/directory-sync writes, but its types, errors and absent-state rule belong to installation state. An unavailable catalog must fail rather than become an empty release history. Reusing its initial-state rule would be incorrect.

## Caller and synthesis decision

The manager interface is exported from `pluginsdk/Catalog`. The initial plugin slice established local admission and acquisition. [Pinned import](artifact-import-design.md) and [reviewed MCP contracts](mcp-contract-design.md) extend the same module. Its authoritative signatures and error types are derived in [Registry.ts](../../contracts/Registry.ts):

```ts
catalog.admit({ type: "plugin", release, bundles })
catalog.acquire({ key, target: { type: "plugin", format } })
```

`AdmissionRequest` ties a plugin release to its complete bundles, or an MCP release to its complete reviewed contract. `AcquisitionRequest` contains the qualified release key and explicit plugin-format or MCP target. Admission returns `admitted`, `unchanged` or `conflict`; acquisition returns `plugin`, `mcp` or `blocked`.

Catalog initialization is explicit. `ReleaseCatalogLive(directory)` from `pluginsdk/node` configures a local Linux store independently of package authoring. Existing deployment infrastructure can call this module without a new author entrypoint. See [manager usage](../catalog-usage.md).

| Candidate | Interface and consequences | Decision |
| --- | --- | --- |
| Expose fetch, digest comparison, metadata checks and storage | Every manager coordinates the same sequence and must prevent mutation between verification and persistence. | Reject. Knowledge leaks into callers and one invariant has several owners. |
| Extend local Installer intents with release references | Every local installation becomes coupled to catalog access and organization provenance. Managing a release without installing it becomes awkward. | Reject. Local ownership and release admission have different lifetimes. |
| Retain complete verified releases in an owning catalog module | Admission privately captures and verifies every declared package before an atomic catalog update. Acquisition verifies retained data and returns the exact selected bundle. | Select. It hides package correspondence, immutable identity and storage behind initialization and two manager operations. |

The main thread selects complete release snapshots. No generic source-provider interface or per-client author setup is added. Bundle validation remains owned by the compiler. Catalog package binding reuses the authoritative format schemas and checks identity, native version, digest, completeness and duplicates. Artifact locations and repository commits retain declared provenance; checking these package bytes does not authenticate the declared source repository or source archive.

## Package binding contract

The internal pure check receives the expected plugin, display/native version and nonempty format-to-digest map, together with descriptors extracted from individually validated private bundle snapshots. Each descriptor contains plugin, format, native manifest version and recomputed bundle identity. It does not accept a caller's `verified` flag.

Every declared format must occur exactly once. Every supplied descriptor must use a declared format and match plugin, version and digest. Missing, unexpected and duplicated formats reject; identical duplicates also reject. Diagnostics identify every applicable mismatch and format, are deduplicated, and use canonical UTF-8 order. Reordering candidates or declaration fields has no effect. Accepted binding establishes correspondence only; cryptography, decoding and native validation have separate runtime checks.

```ts
checkPackages(input: PackageSetInput): PackageSetResult
```

The owning runtime captures the complete release and every candidate before its first asynchronous operation. It validates each bundle with the compiler's implementation, extracts the parsed native version from the same validation, then checks package-set correspondence. The exact captured bytes are retained or rejected together. Acquisition copies retained bytes before returning them, checks both bundle validity and release binding, and never substitutes another format.

## LDD obligations

| ID | Required claim |
| --- | --- |
| E1 | Acceptance establishes exactly one package for every declared format, no undeclared packages, and exact plugin, version and digest correspondence. |
| E2 | A complete corresponding package set is accepted. |
| E3 | Rejection contains exactly all required diagnostics, once each in canonical order. |
| E4 | Candidate enumeration order cannot change the result. |

The independent `Realizes` relation specifies E1/E2. E2 excludes an implementation that rejects every input. E3 checks both directions of every diagnostic. The model and strict oracle come before TypeScript and retained-byte I/O.

## Storage and runtime acceptance

One `catalog.json` retains each release with its complete encoded content. Schema 2 stores both entry kinds. Readers adapt schema-1 plugin entries in memory; initialization, acquisition and unchanged replay preserve their original bytes. A successful new admission writes schema 2. Older SDK builds cannot read schema 2. A scoped advisory lock serializes cooperating SDK writers. Each update writes and syncs a complete temporary record, renames it over the previous record, then syncs the directory. Acquisition validates the entire retained record before selecting a package. This deliberately reads the complete catalog on each operation and rewrites it on each new admission; a large catalog will need a different storage implementation behind the same interface.

`initialize` creates a fresh directory under an existing physical parent. Repeating it validates the existing store. A missing or corrupt record in an existing directory fails with `CatalogUnavailable`; it never resets release history. Symlinked directories and record files reject. An interruption during first initialization can leave an unavailable directory requiring operator recovery.

E1-E4 have checked Lean certificates in the 94-property audit. The strict oracle matches 23 independent vectors and 23 permutations and rejects 31 malformed inputs. Three TypeScript conformance tests include another 192 generated requests. Seven [runtime tests](../../test/catalog-runtime.test.ts) use two application integrations, Claude/Codex packages and binary executable assets. They check complete retained bytes after reopening, replay and conflicts, package mismatch and native tampering, caller/output mutation, unavailable storage and four concurrent child-process writers. These tests and the existing pure catalog suite pass together: 15 tests. The affected compiler, hook-build and installer-storage suites pass another 22 tests.

Separate local probes exercised the compiled public exports with both ten-file automation bundles, mutations while admission waited for its lock, and syntactically valid store corruption. Deterministic child-process probes killed actual admissions immediately before and after rename. Before rename, readers acquired the complete old release and rejected the new key; after rename, readers acquired both complete releases. Retrying admitted the first and reported the second unchanged. The pre-rename kill left a complete orphan temporary file; automatic stale-file collection is not implemented.

These observations qualify process-kill visibility on this Linux host, not power-loss durability or directory-sync completion. The store is local and trusted; arbitrary external rewriting, source authenticity, organization authorization, third-party authentication and workspace rollout remain separate requirements. [Pinned HTTP import](artifact-import-design.md) extends this module with bounded acquisition and archive verification before the same admission transition. [Acceptance](acceptance.md) records the scope. Full CI and package-release gates remain deferred.

## Progress

- [x] Ground: trace compiler byte validation, installer snapshots, pure catalog selection and storage semantics.
- [x] Sketch: compare exposed pipeline, Installer extension and complete catalog snapshots.
- [x] Agree: the instruction to complete the milestones authorizes this organization slice.
- [x] Implement: properties, checked model/proofs, independent vectors, TypeScript, then retained-byte runtime acceptance.
- [x] Scrap review: complete snapshots and the small manager interface survived mutation, concurrency and interruption checks; no redesign was required.
