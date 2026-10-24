# Lean specification

The Lean model states pure contracts for compiler, catalog, distribution, compatibility, and installer decisions. It does not prove that the TypeScript implementation refines those models.

The current compiler format is the package-client identity: `claude_code` or `codex`. Claude packages use `.claude-plugin/plugin.json`; Codex packages use `.codex-plugin/plugin.json`. Both use `.mcp.json`, with Claude remote servers using `type`, `url`, and `headers`, and Codex remote servers using `url` and `http_headers`. The exact field relations are in [Compiler/Format.lean](PluginSdk/Compiler/Format.lean).

## Current contract registry

[`scripts/Check.lean`](scripts/Check.lean) is the authoritative list of model interfaces and property certificates. The table links the current contracts relevant to this package and client consolidation; it is not an acceptance receipt for the entire registry.

| Contract | Active properties | Lean model and proof | Independent cases |
| --- | --- | --- | --- |
| Compiler rendering and format | B1–B8 | [Properties](PluginSdk/Compiler/Properties.lean), [model](PluginSdk/Compiler/Model.lean), [proofs](PluginSdk/Compiler/Proofs.lean), [format rules](PluginSdk/Compiler/Format.lean) | [compiler](vectors/compiler.ndjson), [portable format](vectors/portable-feature-formats.ndjson) |
| Bundle validation | V1–V4 | [Properties](PluginSdk/Compiler/Bundle/Properties.lean), [model](PluginSdk/Compiler/Bundle/Model.lean), [proofs](PluginSdk/Compiler/Bundle/Proofs.lean) | [bundle](vectors/bundle.ndjson) |
| Package assembly | A1–A7 | [Properties](PluginSdk/Compiler/Assembly/Properties.lean), [model](PluginSdk/Compiler/Assembly/Model.lean), [proofs](PluginSdk/Compiler/Assembly/Proofs.lean) | [assembly](vectors/assembly.ndjson) |
| Logical client mapping | CB1–CB6 | [Properties](PluginSdk/Compatibility/ClientPackages/Properties.lean), [model](PluginSdk/Compatibility/ClientPackages/Model.lean), [proofs](PluginSdk/Compatibility/ClientPackages/Proofs.lean) | [client packages](vectors/client-packages.ndjson) |
| Portable MCP rendering | PM1–PM6 | [Properties](PluginSdk/Compiler/Mcp/Portable/Properties.lean), [model](PluginSdk/Compiler/Mcp/Portable/Model.lean), [proofs](PluginSdk/Compiler/Mcp/Portable/Proofs.lean), [wire](PluginSdk/Compiler/Mcp/Portable/Wire.lean) | [portable MCP](vectors/portable-mcp.ndjson) |
| Portable hook rendering | PH1–PH8 | [Properties](PluginSdk/Compiler/Hooks/Portable/Properties.lean), [model](PluginSdk/Compiler/Hooks/Portable/Model.lean), [proofs](PluginSdk/Compiler/Hooks/Portable/Proofs.lean), [wire](PluginSdk/Compiler/Hooks/Portable/Wire.lean) | [portable hooks](vectors/portable-hooks.ndjson) |
| Shared portable composition | PC1–PC8 | [Properties](PluginSdk/Compiler/Portable/Properties.lean), [model](PluginSdk/Compiler/Portable/Model.lean), [proofs](PluginSdk/Compiler/Portable/Proofs.lean), [wire](PluginSdk/Compiler/Portable/Wire.lean) | [portable features](vectors/portable-features.ndjson) |
| Distribution | S1–S5, D1–D4, X1–X9 | [selection](PluginSdk/Distribution/Selection/Properties.lean), [planning](PluginSdk/Distribution/Planning/Properties.lean), [execution](PluginSdk/Distribution/Execution/Properties.lean), [wire](PluginSdk/Distribution/Wire.lean) | [distribution](vectors/distribution.ndjson) |
| Native compatibility | N1–N6, N8–N10 | [Properties](PluginSdk/Compatibility/Properties.lean), [model](PluginSdk/Compatibility/Model.lean), [proofs](PluginSdk/Compatibility/Proofs.lean), [wire](PluginSdk/Compatibility/Wire.lean) | [compatibility](vectors/compatibility.ndjson), [Cursor compatibility](vectors/cursor-compatibility.ndjson) |
| Launcher runtime admission | NR1, NR3–NR5 | [Properties](PluginSdk/Installer/LauncherRuntime/Properties.lean), [model](PluginSdk/Installer/LauncherRuntime/Model.lean), [proofs](PluginSdk/Installer/LauncherRuntime/Proofs.lean), [wire](PluginSdk/Installer/LauncherRuntime/Wire.lean) | [launcher runtime](vectors/launcher-runtime.ndjson) |

The focused prelaunch consolidation receipt covers 58 obligations: 54 core and 4 launcher properties. It does not claim that every entry in `Check.lean`, the full Lean gate, CI, package-consumer, release, or native acceptance has passed. The full gate is [`scripts/gate.sh`](scripts/gate.sh) and remains deferred. The focused proof receipt is named `pure-main-checked.json`.

## Retired obligations

The feature-to-generation selector BF1–BF4 and its module are retired. The former K1–K7 `render_mcp` and H1–H8 `render_hooks` contracts are retired with those operations. Current MCP and hook rules are PM1–PM6 and PH1–PH8, composed by PC1–PC8. Launcher NR2 (`posix`) and compatibility N7 (version-based ownership) are also retired; they are not current properties or supported branches.

## Proof and conformance boundary

The checker requires each registered model to have the declared `Interface` type and each proof to have the exact type of its property applied to that model. It audits transitive dependencies for every registered proof and rejects `sorryAx` and custom axioms; Lean's standard `propext`, `Classical.choice`, and `Quot.sound` are allowed.

The current sequence is property, model and proof audit, independent oracle vectors, pure TypeScript conformance, then focused I/O and native checks. Strict wire and independent expectations live in [`Oracle.lean`](Oracle.lean) and `vectors/`. Effect schemas and TypeScript comparisons remain separate from Lean proof. Native observations, filesystem behavior, process outcomes, and durable writes require their own evidence.
