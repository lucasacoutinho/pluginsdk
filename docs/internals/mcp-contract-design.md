# Reviewed MCP tool contracts

## Outcome and constraints

A company should retain an approved MCP service contract without inventing a plugin package. The contract must identify its organization and service, preserve complete reviewed tool metadata and reject duplicate names. A release must bind that exact contract identity. This prepares distribution and invocation-policy integration while the company continues to host its services.

Compiler owns plugin bundles and native semantics. ReleaseCatalog owns immutable qualified release keys and complete retained content. Its pure C1-C6 model represents both plugin and MCP releases. Another store would let plugin and MCP records disagree about the same qualified release key. Separate MCP methods for admission, import and acquisition would multiply operations around the same catalog rules.

The [MCP tools reference](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) and [versioned tool definitions](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts) describe named tools with input schemas and optional metadata. Tool discovery can depend on authorization. This snapshot is an explicitly reviewed toolset, not a claim that a live discovery response contains every service tool. Annotations remain metadata and confer no permission.

## Caller usage and selected shape

A manager supplies a contract document with schema version, organization, service, declared MCP protocol and complete tool definitions. Tool names remain case-sensitive. Supported protocol declarations are 2025-11-25 and 2026-07-28; input schemas require an object root, and legacy output schemas retain the object-root requirement. JSON Schema structure is checked locally without resolving references or evaluating instance formats. Complete JSON extension metadata is retained.

```sh
pluginsdk catalog pack-contract reviewed-contract.json \
  --integration billing --release approved-1 --version 1.0.0 \
  --location https://artifacts.example.com/billing/approved-1.json \
  --out approved-1.artifact.json --json > approved-1.release.json
pluginsdk catalog import approved-1.release.json --directory ./catalog
pluginsdk catalog acquire acme billing approved-1 --contract \
  --directory ./catalog --out approved-contract.json
```

Organization and service come from the contract. The release adds its integration/release IDs, human version and pinned provenance. Artifact and reviewed-contract digests are separate identities. The existing plugin build and CLI commands retain their author-facing behavior.

| Candidate | Interface depth and consequences | Decision |
| --- | --- | --- |
| Separate MCP contract store | Callers coordinate two histories and prevent cross-kind reuse of qualified release keys. | Reject: split ownership of immutable identity. |
| Add resource-specific catalog methods | Managers learn separate admission, import and acquisition methods for each content kind. | Reject: duplicate paths around one lifecycle. |
| Extend the existing catalog operations with typed content | One catalog owns both resource kinds, shared immutable admission, bounded artifact import and exact selection. | Select: both real content kinds justify the common interface. |

The main thread selects typed content on the existing four operations. Admission uses a tagged plugin or MCP request, with its release subtype tied to its complete content. Import accepts an artifact-backed release of either kind. Acquisition takes an explicit plugin-format or MCP target and returns a plugin package, MCP contract or blocked result. The new private-alpha library shape replaces the plugin-only request shape; CLI plugin usage stays the same. No per-kind catalog methods or source-provider framework are added.

Plugin archive schema 1 and its bytes remain unchanged. MCP archives have their own explicit kind and contain the complete contract. Catalog schema 2 stores both typed entry kinds in one atomic record. Readers validate existing schema-1 plugin records and adapt them in memory. Read, initialization and unchanged replay do not rewrite old records. A successful new admission writes the complete schema-2 record. Missing/corrupt stores still fail without reset; an older SDK cannot read schema 2.

## LDD obligations

| ID | Required claim |
| --- | --- |
| T1 | Accepted normalization preserves every complete tool descriptor exactly and orders distinct names by UTF-8. |
| T2 | Every list with distinct tool names succeeds, including an empty list. |
| T3 | Rejection names exactly the repeated tool names, once each in canonical order. |
| T4 | Enumerating the same tool descriptors differently cannot change the result. |
| T5 | Accepted release binding has the exact organization, service and reviewed-contract digest. |
| T6 | Every matching binding succeeds. |
| T7 | Binding diagnostics contain all and only mismatched identities, once each in canonical order. |

Descriptors commit to full private tool JSON through a metadata digest. The model preserves those opaque identities; hashing and faithful projection into descriptors remain I/O obligations. Normalization and binding are separate pure operations because a contract digest can be computed only after canonicalization succeeds. Duplicate-name errors precede binding checks. [Contract hashing](identity.md#reviewed-mcp-contract) includes schema version, organization, service, declared protocol and all canonical tool metadata. It never derives a permission from an annotation.

The owning module privately snapshots and validates contract JSON, applies the proved tool normalization, materializes the same complete tool definitions in that order and computes their canonical contract digest. It then applies the proved namespace/digest binding before C1-C4 admission. C5-C6 select only the requested kind and retained content. No mutable tag, endpoint URL or server display name stands in for service identity.

## Acceptance and limits

Use two application services with reader/admin tool definitions, complete schema/annotation/extension metadata, empty and reordered toolsets, duplicate names and cross-organization/service/digest mismatches. Check independent contract preimages, deep caller/output mutation, exact retained JSON after reopening, plugin/MCP conflicts under one key, legacy-store reads and atomic upgrade, mixed concurrent writers, strict archive import and both CLI paths. Capture the existing echo service's actual tool metadata for a compiled CLI pilot. Plugin archive bytes and existing plugin CLI behavior must remain unchanged.

T1-T7 pass the exact-type/axiom audit, bringing the checked total to 94. The strict wire passes 27 authored vectors, 1,467 permutations and 70 malformed requests. The TypeScript suite matches those vectors plus 42 normalization inputs and eight binding combinations. Seven retained-content tests cover the two applications, independent contract hashing, metadata/mutation, exact rejection, protocol/schema rules, schema-1 preservation and schema-2 upgrade, mixed separate-process writers and strict MCP imports. Eight focused suites pass 44 tests in total; the source build, typecheck, scoped lint and 98-file Effect diagnostics pass.

A bounded source probe obtained one complete `echo` definition from the existing server. The compiled CLI then passed twelve commands and six loopback requests: canonical contract packaging, import/replay, three-identity mismatch and tamper rejection, cross-kind immutable conflict, and offline acquisition of the contract plus both native automation bundles. The reviewed contract digest is `c20901ff75322a6d7cca564e3d459c7fcfa619a3af93594838a412bb291ad8c1`; its 334-byte archive has raw SHA-256 `90eec2e95cba376e93b8671559d195faf25d8b466147d1a2a9cf6dd4dbb332d0`. The plugin archive's 12,280 bytes and `05fdb252a37d63835189919e76b677a24680bf36865279143e06d27215ee8a08` pin are unchanged. Owned child processes exited and temporary resources were removed. No client installation or authentication claim follows from this metadata pilot.

This is reviewed metadata retention, not deployed RBAC, complete authenticated discovery, endpoint registration or client rollout. Source authentication, publisher credentials, policy enforcement, revocation latency and non-Linux storage qualification remain separate work. Full CI and release gates stay deferred.

## Progress

- [x] Ground: trace catalog identity, private package capture, artifact transport and service/tool authorization identities.
- [x] Sketch: compare separate stores, resource-specific methods and typed content on one catalog.
- [x] Agree: the active milestone instruction authorizes this extension.
- [x] Prove: T1-T7, strict wire and independent expectations before TypeScript behavior.
- [x] Implement: conforming normalization/binding, complete snapshot storage and CLI integration.
- [x] Scrap review: keep one catalog transition and typed content; share transport and CLI output instead of adding per-kind lifecycles.
