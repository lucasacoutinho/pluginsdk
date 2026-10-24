# Portable MCP package-plan acceptance

The pure renderer in [the design](portable-mcp-design.md) produces complete portable MCP package plans from the existing normalized compiler input. Authors keep one definition. Runtime byte materialization and native installation are still open.

## Package contract

[PM1–PM6](../../spec/PluginSdk/Compiler/Mcp/Portable/Properties.lean) establish exact admission, complete client declarations, the exact file inventory, contained distinct paths, enumeration independence and complete ordered diagnostics. [The certificates](../../spec/PluginSdk/Compiler/Mcp/Portable/Proofs.lean) pass the exact property and axiom audit: **273/273 properties checked**, including these six additions.

Every local server gets `.psdk/mcp/<ordinal>.json` and `.psdk/mcp/<ordinal>.sh`. The JSON data names its own sidecar and contains the same compiled instructions used for the native declaration. The renderer emits one `.psdk/runtime/process.mjs` plan when local servers exist. Remote-only and empty inputs emit no runtime files. Any rejected server rejects the complete package plan.

Canonical server order assigns ordinals independently of input-map order. Names do not enter generated paths. Remote records retain the existing client-specific representation, including Codex `http_headers` and the Agent Plugins schema field.

## Conformance

[Fourteen authored expectations](../../spec/vectors/portable-mcp.ndjson) cover all three existing base representations, remote-only plugins, successful local and mixed plugins, shared runtime cardinality, capture data, paired files and complete rejection. They compose independently authored instruction expectations; neither implementation generated their expected values.

[The focused test](../../test/portable-mcp.test.ts) adds 24 matrix requests and six enumeration pairs, for **36 generated comparisons** and **50 valid oracle comparisons** in total. Successful three-server cases run for every representation. Enumeration pairs cover both rendered packages and rejected results. Seven malformed requests are refused by both Effect and Lean; seven malformed output controls are refused by Effect.

Main-thread verification passes 14 tests across the portable MCP, legacy MCP, portable launcher and legacy launcher files. Scoped TypeScript, Effect diagnostics and lint pass. Effect reports zero errors, warnings or messages. All checks use Node 24.18.0 and pinned dependencies.

Review corrected raw string fixtures that failed the branded schema types. It also added successful Codex permutation and multi-server cases; the first test version exercised rejection before those outputs were produced.

## Integration boundary

The oracle reuses the existing strict MCP reader and portable instruction serializer. Their helper visibility changed without changing existing wire results. The TypeScript launcher now exports its existing runtime-path constant for the private renderer, so both emit the same path from one definition.

No compiler I/O, runtime asset, format identifier or compatibility profile changes in this checkpoint. The next step must supply the runtime bytes, materialize typed file plans through `Compiler.build`, and bind every file into the bundle digest. SDK-built Linux and Windows lifecycle checks must pass before profile promotion or automatic selection. macOS remains deferred without a host. CI, package-consumer and release-wide checks remain deferred.

Evidence is under `.audit/probes/portable-mcp/`. The predecessor is `.audit/probes/portable-launcher-model/acceptance.json`, SHA-256 `e106afa77b3019e3b44a0fa975e9b131e478c78ce134ff1c085f83d8c7934295`. Changed integration files and build artifacts were retained under `before/`; the unsealed legacy reader's original single-keyword declaration was reconstructed exactly and retained there as well.
