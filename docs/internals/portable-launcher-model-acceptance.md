# Portable launcher encoding acceptance

The pure encoding in [the design](portable-launcher-model-design.md) is checked. It produces process instructions, a native Node invocation and a POSIX sidecar. It adds no author-written entry point. Compiler integration and native execution remain open.

## Checked contract

[Properties.lean](../../spec/PluginSdk/Compiler/Process/Portable/Properties.lean) declares PL1–PL7. The certificates under [Proofs.lean](../../spec/PluginSdk/Compiler/Process/Portable/Proofs.lean) establish exact admission, complete process preservation, refusal on missing sources, Windows-safe capture names, exact native metadata, POSIX serialization and complete ordered diagnostics.

Capture names use canonical source ordinals, so references to `TOKEN` and `token` receive distinct generated bindings even on Windows. Destination names that alias under ASCII case folding are rejected. Codex references to inherited environment variables remain unsupported by its native launcher contract.

The exact proof audit reports **267/267 properties checked**, including the seven additions. It checks certificate types and dependencies against the existing three-axiom allowlist. The scoped Lean build completes without warnings.

## Conformance

The [nine authored vectors](../../spec/vectors/portable-launcher.ndjson) contain expectations written independently of both implementations. They cover both hosts, case-distinct sources, snapshotting before environment replacement, literal and file arguments, duplicate destinations and ordered diagnostics.

[The conformance test](../../test/portable-launcher.test.ts) compares those expectations with both Lean and TypeScript, then checks 100 generated requests. Eight malformed requests are rejected by both strict wire readers; the Effect result schema also refuses empty issue lists and excess fields. The related legacy launcher tests pass alongside them: six tests across two files.

The scoped TypeScript compiler, Effect diagnostics and lint pass. Effect reports zero errors, warnings or messages. Checks use Node 24.18.0 and the pinned project dependencies.

An initial import-time failure exposed eager schema-equivalence construction through the contract reexport. Moving that construction into the pure operation corrected the cycle. The final conformance run passes.

## Evidence and limits

Receipts are under `.audit/probes/portable-launcher-model/`. The predecessor is `.audit/probes/windows-stdio-premise/acceptance.json`, SHA-256 `23e8954d90c205df8fdf588da8d9da3f719ca51c9ec6d28e41147659044a24df`.

The previous oracle executable was rebuilt before its archive was taken. Rebuilding its archived source with the pinned toolchain recovered exactly SHA-256 `0ec3ba7d0f2e53bf9d60bd76e79e1b920d3d8ff18c67af108ed8249b509ef43f`. The same procedure recovered the predecessor `PluginSdk.olean` at its exact recorded hash. Both artifacts are retained separately; their current versions were then restored.

No runtime, compiler I/O, format or compatibility-profile change is accepted here. The next gate must package the shared runtime and process data into the bundle digest, then exercise SDK-built plugins on Linux and Windows. No native sessions ran for this encoding. macOS remains deferred because no host is available. CI, package-consumer and release-wide checks remain deferred.
