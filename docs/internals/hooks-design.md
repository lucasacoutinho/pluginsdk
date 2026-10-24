# Portable command hooks

## Outcome and current flow

An author should keep one hook program and name it in the same JSON definition used for skills and MCP servers. The compiler owns native event registration, contained launchers, literal arguments and package identity. The installer retains its reviewed package lifecycle. This design starts with `SessionStart` and `UserPromptSubmit`; other events and agents remain roadmap work.

`Compiler.build` snapshots the definition, captures declared source files, renders native documents and materializes complete package bytes. Process normalization already checks executable/file references, arguments, directories and environment bindings. The launcher model preserves those values through a generated shell program. MCP composition assigns canonical ordinal paths before assembly checks collisions. Hooks reuse these contracts rather than asking authors to write another entrypoint or host adapter.

Native inspection and installation stay inside `Installer`. A native client's hook review is a separate decision from package installation. The current installer does not inspect or grant Codex hook trust. A successful package installation must not be described as a trusted or executed hook.

## Caller shape

The authoring extension is optional:

```json
{
  "id": "team-kit",
  "version": "0.2.0",
  "description": "Shared team automation",
  "skills": [],
  "assets": ["automation"],
  "mcp": {},
  "hooks": {
    "team-context": {
      "event": "SessionStart",
      "command": "node",
      "args": [{ "file": "automation/context.mjs" }]
    }
  }
}
```

The handler reads the shared event JSON from stdin. For `SessionStart`, it can return `hookSpecificOutput` with `hookEventName: "SessionStart"` and `additionalContext`. `UserPromptSubmit` additionally permits the shared `decision: "block"` and `reason` result. Event input and output schemas specify this common protocol. Native extension fields are outside it. The compiler does not prove an arbitrary application's behavior, just as packaging an MCP server does not prove its tools.

The shared invocation and event-specific output projections are defined in [Hooks.ts](../../contracts/Hooks.ts). `transcript_path` can be null for ephemeral Codex sessions. `permission_mode` is a host hint, not authorization evidence. Empty stdout permits normal processing. Backend tool access remains governed by the separate authorization contract.

The hook name identifies a declaration for diagnostics and canonical packaging. The record has no requested execution order. Native handlers may run concurrently; authors who need a sequence put that sequence inside their one program. The first slice has no native matcher, background handler, prompt/agent handler or failure-mode override.

Commands reuse the stdio process fields: `command`, `args`, `cwd` and `env`. Omitted timeout becomes 30 seconds; explicit integer timeouts range from 1 to 600 seconds. Hook environment references are initially rejected on both hosts because their native hook declarations cannot supply the existing launcher's paired captures. Literal environment values remain supported. Strings stay literal and file references must name captured package files.

## Candidates and synthesis decision

| Candidate | Interface and implementation consequences | Decision |
| --- | --- | --- |
| Put hooks in Agent Plugins extensions | Keeps the current Codex package shape, but the pinned loader discards those hooks. A valid document could have no runtime effect. | Reject for the pinned Codex profile. |
| Emit one Claude-compatible package for both hosts | Reduces file differences, but couples Codex package support to its Claude compatibility path. It also requires qualification of every existing component under that path. | Defer. |
| Select native package representations inside the compiler | Authors retain one definition. Claude uses its manifest; Codex uses its hook-capable `.codex-plugin/plugin.json` representation. Native document and process differences remain internal. | Select. |

The main thread selects per-client native representations. New rendering revisions must preserve the meaning of saved v1-v3 bundles. Codex's new representation needs its own format identity; it must not be labelled an Agent Plugins revision. Format integration follows the hook model and native controls, rather than changing the existing qualified formats first.

The native Codex MCP adapter uses `.mcp.json` with literal `http_headers`, without a transport discriminator or Agent Plugins schema. Environment-backed headers remain rejected. Bundled processes use `/bin/sh` with the contained launcher path and native `cwd: "."`; the pinned parser resolves that cwd to the installed package. The generated script obtains a physical absolute root from `/bin/pwd -P` before running the existing launcher body. It appends a dot during command substitution, checks it and removes that dot and exactly one newline. This preserves package names ending in newlines. Passing `.` to the original launcher would misresolve file arguments after a declared cwd change, so that candidate is rejected.

The internal rendering format gains `codex_plugin_v1`; Claude's hook-capable package revision is `claude_code_v4`. Existing formats keep their exact document and launcher bytes. K1-K7 and B1-B8 extend to the new native representation. K7 states absolute-root frame recovery, the exact native process record, executable bytes and complete process meaning. Actual pwd execution and native process lifetime remain runtime checks. No author writes or configures this bootstrap.

The internal hook renderer takes a host and a record of normalized process plans, events and timeouts. It returns the complete hooks document and executable launcher files, or all unsupported-reference diagnostics. It performs no source I/O, execution, installation or trust mutation. It adds no public runtime module.

```ts
renderHooks(input: HooksInput): HooksResult
```

Hook files use `.psdk/hooks/<ordinal>.sh`, assigned after UTF-8 ordering by declaration name. MCP files retain `.psdk/mcp/<ordinal>.sh`. Both use the same ordinal-path proof. Each generated script is the existing proved launcher serialization. A native hook command invokes `/bin/sh` with the contained script and plugin root as separate shell words. It references the quoted, unbraced runtime variable `$CLAUDE_PLUGIN_ROOT` or `$PLUGIN_ROOT`; it never inserts a root value into command text through native `${...}` replacement. Actual shell and native behavior require the hostile-path control below.

## LDD obligations

| ID | Required claim |
| --- | --- |
| H1 | A successful document contains exactly the requested event groups and every requested handler, with no extra native fields. |
| H2 | Successful output contains exactly one executable file per declaration, with the complete existing launcher serialization. |
| H3 | Every native handler has the exact command, synchronous mode and timeout; its command contains no braced native substitution. |
| H4 | Generated paths are contained, injective and pairwise distinct. |
| H5 | A request succeeds exactly when every process is free of unsupported environment references; rejection reports every affected hook/source pair and nothing else. |
| H6 | Reordering declarations preserves accepted output and rejection diagnostics. |
| H7 | An empty request succeeds without a hooks document or launcher files. |
| H8 | Every accepted handler retains the proved complete process meaning for every package root and supplied environment. |

H5 includes positive acceptance, so rejecting every request cannot satisfy the contract. The properties quantify over normalized process plans; source capture and M1-M5 establish that normalization. H2 and H8 reuse L1-L7 rather than introducing a second shell implementation. H3 certifies the restricted command shape, not a complete shell interpreter.

The order is Effect schemas and Lean obligations, model and checked proofs, independently authored vectors and strict wire decoding, TypeScript conformance, then source/compiler integration and native lifecycle acceptance. The initial schemas stay internal until those conditions are met.

## Native evidence and acceptance

Claude Code 2.1.304 accepts the static plugin-hook shape. Its [command-hook reference](https://code.claude.com/docs/en/hooks#command-hook-fields) distinguishes direct-exec arguments from shell commands. The latter can use runtime environment expansion. Static validation alone does not establish event execution.

Codex 0.163.0's [pinned loader](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core-plugins/src/loader.rs) skips hook sources for Agent Plugins packages. Its [native plugin manifest](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core-plugins/src/manifest.rs) admits the hook-capable legacy representation. The [command discovery code](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/hooks/src/engine/discovery.rs) supplies runtime root variables and also performs raw braced substitutions. The selected invocation avoids that substitution path.

Codex requires review of the current hook definition. Its [TUI implementation](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/tui/src/hooks_rpc.rs) reads the native hook hash and records trust through `config/batchWrite`. The SDK must preserve that review requirement. A bypass flag cannot establish persisted-trust behavior.

Acceptance must inspect actual native event input, complete stdout, exit behavior and timeout. Root paths include spaces, quotes, backticks and dollar command-substitution text. A sentinel detects accidental evaluation. The lifecycle must distinguish installed, untrusted, trusted and modified hooks; updates require fresh native review when the client requires it. Logs stay outside package contents. Fresh sessions and shutdown checks precede replacement or removal.

The native controls have exercised both events on the pinned clients. Claude ran startup context, advisory exit 2 and a five-second timeout. Each client then ran a local provider fixture control, followed by a prompt-blocking run that made no additional provider request. Codex exposed untrusted and trusted hooks, then marked a changed definition modified. Literal root-path controls passed. These hand-built fixture packages establish native primitives; the separate SDK evidence follows below.

The Codex MCP compatibility control retained a concrete counterexample: the existing Agent Plugins stdio record failed to start under `.codex-plugin/plugin.json`, and its remote `headers` values never reached the fixture. The compiler must render the native representation explicitly before combining MCP with hooks. Installing a valid manifest does not establish that its requested contents work.

`SessionStart` must execute before a provider request. Its exit 2 behavior is advisory, rather than a prompt block. `UserPromptSubmit` acceptance must prove that a blocked prompt never reaches a provider. Other events need their own qualification before the feature milestone is complete. Codex's standalone custom-agent configuration is not plugin agent support; agents need a separate design.

## SDK lifecycle qualification

The [automation definition](../../test/fixtures/plugins/automation.json) builds both native bundles with one command:

```sh
node dist/src/cli.js build test/fixtures/plugins/automation.json --out .pluginsdk/automation/build
```

Each bundle has ten files. Both contain the same skill, checklist, application server, policy program and hook launchers. The Claude bundle digest is `9b61c05ff22131f0827ad9b807536c0b4fb872c3b5a262e0b9efd0033b495de3`; the Codex digest is `5c4fd2619768869ad83dfc9c2c4bc9cd42964245e62d94f58a4dccad50677b89`. Generated metadata and the MCP bootstrap differ between hosts. Six compiler checks exercise complete packages, legacy preservation, source failures, collisions and native import rejection; the CLI also checks automatic format selection and rejection before either output is written.

Isolated Linux user-scope probes built instrumented fixtures derived from this example through the SDK CLI, then used its plan/show/apply/remove lifecycle. The policy outputs retain the example's behavior while recording observations outside the package. These fixture bundles have their own digests. Both clients executed startup context and prompt blocking at versions 1.0.0 and 2.0.0, with a changed context in v2. Blocked prompts made no additional request to the static loopback provider. Installed cache bytes and executable bits matched their fixture bundles; no package program started during build, plan or apply. Native inventory no longer exposed the plugin after removal, all observed fixture PIDs were gone, and literal hostile-root sentinels remained absent.

Claude Code 2.1.304 supplied the startup context in the local Messages control request and acknowledged a repeated apply of the completed v2 plan with unchanged native-state snapshots. Hooks ran from its installed marketplace payload, with event JSON `cwd` pointing to the repository from which the probe launched Claude. The fixture contained twelve files because instrumentation added a server wrapper and retained an unused policy copy. The wrapper observed initialization and `tools/list` requests, but captured neither a tool-list response nor a tool call. Its original final analyzer failed on incorrect expectations; main-thread review checked the retained raw events, requests, cache comparisons, replay snapshots, removal and cleanup separately. This is qualified observed behavior, not a passing automated native regression suite.

Codex 0.163.0 discovered the skill and actual example MCP server and completed direct `echo` calls at both versions. New hooks began untrusted and ran only after the probe recorded their exact listed keys and current hashes through native review. Replanning the v2 bundle reported unchanged; this probe did not reapply its completed update plan. Runtime shutdown required process-group SIGTERM followed by SIGKILL before update or removal. The probe disabled shell snapshots because a separate native path-handling failure prevents qualification of hostile roots with that feature enabled.

Codex retained hook trust across the v2 update: the referenced policy module changed, while the hook command definition and native hashes stayed the same. Native trust therefore does not establish review of every referenced program byte. PluginSDK's reviewed installation plan commits the whole bundle, but it neither resets nor grants native hook trust. This observation is a material limit of the pinned client's review mechanism.

Local records are retained under `.audit/probes/sdk-hooks/claude/` and `.audit/probes/sdk-hooks/codex/`; the main acceptance record is `.audit/evidence/hooks-sdk-review.md`. No third-party authentication, model inference, project-scope hook lifecycle, other native version or broader event support is qualified by these probes.

## Progress

- [x] Ground: trace the current compiler/installer and retrieve pinned native contracts.
- [x] Sketch: compare complete package representations and select the internal renderer.
- [x] Agree: the existing milestone instruction authorizes implementation.
- [x] Prove: establish H1-H8 and strict oracle conformance. The audit checks 87 properties, including H1-H8; 14 authored hook vectors, 14 enumeration cases, 26 malformed inputs and two actual shell controls pass. TypeScript also agrees on 64 generated hook requests.
- [x] Implement: integrate the selected native formats, compiler/CLI checks and the qualified SDK fixture lifecycle above.
- [x] Reassess: preserve the failed Codex MCP representation and replace it with the native adapter certified by K7. Record native trust and probe limitations separately.

CI and package-release work remain deferred at the user's request.
