# Portable runtime and compiler integration

`Compiler.build` emits `claude_code_portable_v1` and `codex_plugin_portable_v1` from the existing plugin definition. Authors supply no launcher or SDK glue. Each bundle contains the SDK's runtime once, canonical process data for each local server and its executable POSIX sidecar. Empty and remote-only plugins carry no runtime. Existing format identifiers retain their encodings.

## Formal contract

[PR1–PR4](../../spec/PluginSdk/Compiler/Process/Portable/Runtime/Properties.lean) specify paired capture decoding, refinement of the existing launcher evaluator for arbitrary scripts, complete invocation preservation and refusal of missing sources. The [certificates](../../spec/PluginSdk/Compiler/Process/Portable/Runtime/Proofs.lean) pass the exact property and axiom audit: **277/277 properties checked**.

[Twenty-one authored vectors](../../spec/vectors/process-runtime.ndjson) and 52 generated cases compare Lean with TypeScript. Eleven malformed requests are rejected by both readers; five malformed response controls are rejected by Effect. The dictionary cases include absent and explicitly present `toString`, `constructor` and `__proto__` sources. Review found and corrected inherited-property lookup before runtime I/O began.

The two format identifiers also pass 30 explicit catalog, artifact, distribution-selection and profile-selection comparisons with Lean. Existing catalog and artifact conformance runs pass. The distribution suite covers all 4,096 declared-format subsets for each host, their reversals and duplicate controls. Its stale eight-format count assertions now derive their size from the format universe.

## Executable boundary

The SDK build bundles one self-contained module, including its dependency notices. The compiler reads those bytes through its filesystem service and includes them, process data, sidecars and executable intent in ordinary bundle identity. Installed plugins require Node 24.18 or later and no dependency installation.

The executable strictly decodes UTF-8 JSON and process data, snapshots paired captures, then evaluates the checked instructions. Linux replaces itself with the sidecar and final server. Windows uses its native environment object for replacements and a scoped child handle with inherited streams. The owner observes errors, waits for actual closure and terminates through its held handle during interruption. It makes no independent descendant-lifetime claim.

Bundle validation reconstructs a plan from instruction indices and requires exact equality with the checked portable launcher's output. It compares the native declaration and sidecar with that result, verifies canonical paths and packaged runtime/data/sidecar modes, and rejects inconsistent captures. Mutation controls rebuild the digest, native bindings and sidecar around malformed descriptors to test this boundary independently of stale hashes or files.

## Local evidence and limits

Main-thread checks pass **54 tests across 12 focused files**, including seven standalone-runtime tests and seven compiler integration tests. Both emitted bundle formats run in isolated Linux directories. Checks cover file and literal arguments, empty strings, Unicode, shell metacharacters, cwd, capture snapshots, stream passthrough, missing inputs, failure status and byte identity. The standalone runtime preserves its Linux PID through process replacement. A separate live-clock child-owner check confirms readiness before interruption and closure afterward.

Scoped TypeScript and Effect diagnostics pass for all 19 affected TypeScript entry files, with zero Effect errors, warnings or messages. Focused lint passes. Rebuilding the runtime produces identical bytes. An early bundle retained a parser's relative CommonJS import; standalone execution exposed it, and the build now selects that dependency's published ESM entry. The first interruption test stalled on its test clock; its corrected live-clock case passes. Earlier failures remain recorded separately from passing acceptance reports.

SDK production emission also passes into an isolated output directory. The compiled CLI builds both six-file portable bundles from one definition without starting its server. Its ordinary build still selects the existing qualified stdio formats, `claude_code_v3` and `agent_plugins_v3`. This checks the compiled command path without package-consumer or native installation claims.

No native client session ran in this checkpoint. The later [portable stdio native acceptance](portable-stdio-native-acceptance.md) records a corrected Codex root binding and SDK-built client sessions on Linux and Windows. SDK installer lifecycle qualification remains open. Enabled profiles and automatic project format selection are unchanged; four Windows basic profiles remain enabled. macOS qualification is deferred because no host is available. Windows hooks, agents and source symbolic-link qualification also remain open. CI, package-consumer, release-wide checks, publication and third-party authentication remain deferred.

The [design](portable-process-runtime-design.md) records the selected boundaries. Evidence is under `.audit/probes/portable-process-runtime/`, with exact predecessor bytes retained under `before/`. Its predecessor is `.audit/probes/portable-mcp/acceptance.json`, SHA-256 `32b1d2e8133a667451c281a48a69de799537bcc4ebdb638e94cdfebde86735ca`.
