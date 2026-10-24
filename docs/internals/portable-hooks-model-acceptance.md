# Portable hook renderer acceptance

The [portable hook design](portable-hooks-design.md) passes its pure LDD gate. One call returns the complete Claude or Codex hook document with its process descriptors and POSIX sidecars. `PortableProcess` owns the shared file-plan and process-data schemas; the existing MCP exports and wire retain their shapes.

## Formal contract

The [properties](../../spec/PluginSdk/Compiler/Hooks/Portable/Properties.lean) and [proofs](../../spec/PluginSdk/Compiler/Hooks/Portable/Proofs.lean) establish PH1–PH8:

- Accept exactly the representable inputs. Reject ambient references for both hosts and environment-name collisions under ASCII folding.
- Preserve supported events, timeouts, synchronous execution and each native binding's exact fields.
- Emit one runtime and one descriptor/sidecar pair per canonical hook, with contained and distinct paths.
- Preserve results across hook-map enumeration; return every required diagnostic once in UTF-8 order.
- Preserve empty input and the compiled process semantics, with no captured environment values.

The exact-type and axiom audit checks **302/302 properties**. Existing MCP proofs still compile after the shared-type extraction.

## Oracle and TypeScript

The [20 frozen vectors](../../spec/vectors/portable-hooks.ndjson) reuse the accepted native bindings and an independently frozen process golden. They cover both hosts, both events, timeout boundaries, Unicode and numeric-looking names, ordinals 10/11, references in every process slot, collisions and combined diagnostics. Their SHA-256 is `255ea39bb83c213c4dbb25d10ca3b2d5c730fea7c82daae19cdb427431a3cfc0`. Lean matched all expectations before the TypeScript renderer existed.

The [TypeScript conformance suite](../../test/portable-hooks.test.ts) adds 96 process cases, 12 enumeration inputs and 40 paired malformed requests. The [renderer](../../src/compiler/hooks/portable.ts) uses exhaustive Effect Match and schema-derived equivalence. Nine scoped tests pass, including the five existing MCP compatibility tests. Scoped strict TypeScript, Effect diagnostics and lint also pass.

The machine-readable [acceptance record](../../.audit/probes/portable-hooks-model/acceptance.json) binds the predecessor, changed sources, preserved before-images and check logs. The local record also retains the corrected Lean elaboration failures and the verified recovery of one wire before-image; these corrections supply no native evidence.

## Qualification boundary

Compiler and Installer I/O, generated runtime bytes, format selection and public profiles are unchanged. This gate starts no native sessions. The runtime remains SHA-256 `9d1c4f65bd1329f9a9f9dd3679a74ce2b10478cf3182310e71b8ec655d91e0c2`.

The next pure gate must compose MCP and hook output with exactly one shared runtime while preserving every descriptor and sidecar. Compiler integration follows that gate. Complete hook install/update/replay/remove, startup context, prompt blocking, Codex trust and Windows companion ownership remain separate native obligations. macOS qualification remains deferred without a host; Grok native tests, third-party authentication, CI and package/release checks remain deferred.
