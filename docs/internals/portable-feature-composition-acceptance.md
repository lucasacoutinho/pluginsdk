# Shared portable rendering acceptance

The [composition design](portable-feature-composition-design.md) passes its pure LDD gate. `renderPortableFeatures` returns both native documents, one runtime and every MCP/hook process file through one interface. Existing component renderers retain their contracts.

## Proof and conformance

PC1–PC8 prove exact admission, document preservation, complete ordered files and count, exact runtime cardinality, safe distinct paths, enumeration invariance, complete combined diagnostics and MCP compatibility with empty hooks. The [properties](../../spec/PluginSdk/Compiler/Portable/Properties.lean) and [proofs](../../spec/PluginSdk/Compiler/Portable/Proofs.lean) pass the exact-type and axiom audit: **310/310 properties**.

The [27 frozen expectations](../../spec/vectors/portable-features.ndjson) reuse independently accepted MCP and hook outputs. They cover all three base formats, empty and remote-only inputs, either process component alone, both together, a server and hook sharing the name `app`, and every combination of component failure. Expected documents and payloads retain the frozen component bytes. The vector SHA-256 is `6dca05a5ac4c41d5ed54a68b665f0d9cd9c0df5a2ac5677481ba705c05603a84`. All expectations matched Lean before the TypeScript composer existed.

The [TypeScript suite](../../test/portable-features.test.ts) adds 120 mixed inputs, 12 enumeration inputs, 32 paired malformed requests and five Effect-only malformed responses. Seventeen scoped tests pass across the composer, existing portable hooks, portable MCP and legacy MCP. Scoped strict TypeScript, Effect diagnostics and lint pass.

The [composer](../../src/compiler/process/features.ts) uses exhaustive Effect Match and nonempty Effect array operations. It removes only tagged runtime plans; it does not deduplicate ordinary paths. MCP and hook paths remain separate by proof. The nested input schema retains MCP's existing remote/local-name constraint, and all three TypeScript renderers share MCP's format-to-host mapping.

## Preserved boundary

Compiler and Installer I/O, generated runtime bytes, public profiles and automatic format selection are unchanged. This gate starts no native sessions. The runtime remains SHA-256 `9d1c4f65bd1329f9a9f9dd3679a74ce2b10478cf3182310e71b8ec655d91e0c2`.

The local [acceptance record](../../.audit/probes/portable-feature-composition/acceptance.json) binds the predecessor, preserved before-images, proof/check logs and current source hashes. Main-thread review simplified the worker's list proofs and corrected property-name metadata without changing the frozen vectors. Failed elaboration attempts remain recorded separately from the passing build.

Compiler integration and native validation follow this gate. Versioned encodings must retain saved format meanings; profile promotion still requires complete SDK qualification. Hook events, trust, install/update/replay/remove and Windows agent companions remain open. macOS has no qualification host. Grok native tests, third-party authentication, CI and package/release checks remain deferred.
