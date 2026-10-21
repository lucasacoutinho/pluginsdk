# Alpha acceptance

The initial profile qualifies Linux, Node 24 or later, Claude Code 2.1.304 and Codex CLI 0.163.0. Native tests create temporary homes and use a loopback MCP fixture. They perform no model turns or provider authentication.

| Gate | Evidence |
| --- | --- |
| Lean | `npm run proof`: 41 checked proofs, axiom audit, strict oracle decoding, committed vectors, malformed inputs and independent combination checks. Includes seven assembly and eight repair-model properties; runtime repair is not yet implemented. |
| TypeScript conformance | [conformance.test.ts](../test/conformance.test.ts): 4,210 requests compared with the actual Lean executable, including generated traces, rendering permutations and bundle cases. |
| Expansion conformance | [assembly.test.ts](../test/assembly.test.ts) compares asset vectors and independent permutations with Lean; [repair.test.ts](../test/repair.test.ts) compares 18 repair vectors and 40 generated requests. [assets.test.ts](../test/assets.test.ts) checks actual supporting bytes, modes, reserved paths, metadata extensions, source containment, imported tampering and preserved v1 output. |
| Compiler and boundaries | [compiler.test.ts](../test/compiler.test.ts), [boundaries.test.ts](../test/boundaries.test.ts): exact binary content and executable bits, deterministic output, contained symlinks and escapes, skill/frontmatter validation, URL/header semantics, Unicode, JCS/SHA vectors, imported tampering and private snapshots including shared buffers. |
| Tooling | Strict native TypeScript 7.0.2 with Effect-tsgo 0.54.1; Effect diagnostics report zero errors, warnings and suggestions. Oxlint rejects switches, explicit `any` and non-null assertions. |
| Native lifecycle | [lifecycle.test.ts](../test/native/lifecycle.test.ts): Claude user/project and Codex user install, same-version replacement, removal, replay, no-op, stale plans, loaded-byte drift, foreign installs, path aliases and unrelated settings. |
| Crash recovery | [recovery.test.ts](../test/native/recovery.test.ts): 16 tests kill the caller around pending writes, execution-token persistence, native completion and journal acknowledgement. They check lock inheritance, not-applied replanning, removal settlement and partial replacement without replay. |
| Native discovery | [discovery.test.ts](../test/native/discovery.test.ts): fresh Claude processes list the skill and connect/list MCP tools; a fresh Codex app-server discovers the skill, supporting asset and MCP tool, then completes a loopback tool call. |
| Distribution | [package-smoke.mjs](../scripts/package-smoke.mjs): a fresh production-dependency consumer runs the installed CLI and SDK and compiles against public declarations. Its optional native pass installs, replays and removes through the compiled CLI and packaged execution worker on both hosts. |
| Real-plugin pilot | [lstack pilot](pilot.md): all 34 skills discovered after installation and update in Claude user/project and Codex user; complete payload bytes and executables, replay, removal, unchanged source and unrelated configuration checked. |

Run `npm run check` for the portable gate and `npm run test:native` for native acceptance, including the installed-package pass. The former contains 43 Vitest tests; native Vitest contains another 23. Native CLI commands require both exact qualified binaries. `npm run test:package` produces `.artifacts/pluginsdk-0.1.0-alpha.0.tgz` and its SHA-256 file. The lstack pilot is a separate compiled acceptance harness; its source-path-dependent invocation is in the pilot record.

## Limits

The Lean proofs cover pure policy. Filesystem truth, hash implementations, process quiescence and durable storage remain checked I/O assumptions. Process-kill tests do not simulate machine power loss. SDK locks coordinate SDK writers; arbitrary external host edits are outside that lock.

Claude's exposed inspection commands establish MCP connection and tool discovery. The harness does not claim a Claude model-driven tool call. Codex's direct app-server tool call needs no model turn. Neither fixture proves third-party OAuth or credential availability.

Other native versions, non-Linux capture/installation and Codex project scope are unqualified. Grok Bot and Meta Muse return `DestinationUnsupported`; [host research](host-research.md) records the missing contracts. A partial native recipe can remain pending and uncertain; automatic repair is outside the alpha.

PluginSDK is licensed under [MIT](../LICENSE) and kept in the [private repository](https://github.com/lucasacoutinho/pluginsdk). The package has `private: true`; public npm publication is deferred at the user's request.

The [baseline private CI run](https://github.com/lucasacoutinho/pluginsdk/actions/runs/39519037656) passed the full portable gate at commit `0472f66` using a repository-scoped ephemeral WSL runner, a fresh checkout and `npm ci`. That runner uses the installed Lean toolchain; the project's pinned version and complete axiom audit still run through `npm run check`. The runner deregisters after one job. Hosted jobs remain blocked before execution by GitHub's account billing/spending-limit diagnostic. Later expansion commits require their own run of the same gate; the [Actions history](https://github.com/lucasacoutinho/pluginsdk/actions/workflows/check.yml) records each checked commit.
