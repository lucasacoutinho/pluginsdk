# Portable packages in Claude Windows projects

Claude Code 2.1.304 project installations on Windows x64 accept bundled stdio MCP, hooks and agents. An ordinary `pluginsdk build` selects portable v1 for stdio-only definitions and portable v2 for hooks or agents. Consumers use the existing reviewed project installation workflow.

The [selected design](../../.audit/probes/portable-project-claude-windows/design.md) retains Claude's native project adapter and the Windows transaction worker. Both formats qualify with two projects sharing one client home. The second project remains unaffected by installation, replacement, removal and recovery in the first.

## Model and build evidence

The existing 318 proved properties carry forward. Compatibility N1–N8 already cover platform, version, scope and format membership. This change introduces no new model or public schema.

A private candidate adds both portable formats to the Windows Claude 2.1.304 project row. Compilation uses pinned Node 24.18.0. A fresh process checks the entire emitted profile table against independent expectations and 342 retained Lean oracle responses. The comparisons include reversed table order and twelve neighboring refusals. This pure gate finishes before native harness changes.

Four ordinary CLI builds discover definitions without target or format flags. They cover two versions of each portable format and produce eight complete Claude and Codex bundles. Main independently decodes the bundles and compares all 100 payload files, executable intent and bundle digests against retained fixtures. The shared 323,628-byte runtime is unchanged. These Codex build outputs do not qualify Codex project installation.

## Native project evidence

Each format passes one normal lifecycle and nine recovery or repair cases in fresh, explicitly owned Windows roots. The SDK installs, replays, replaces and removes the reviewed packages. Native sessions complete real MCP calls with literal arguments, environment values and package-relative working directories. Portable v2 additionally exercises startup context, prompt blocking and native agent dispatch with changed models and shell-tool policies.

The recovery cases interrupt installation, replacement and removal before and after native execution. Two cases per format terminate only the caller and let the transaction worker finish. Another removes the plugin before interrupting marketplace removal, then uses explicit repair. Both installation leases remain held while the worker survives. Recovery and replay add no native mutation, and repair rejects the superseded plan.

| Accepted matrix | Result |
| --- | --- |
| Native cases | 20: two normal lifecycles and eighteen recovery cases |
| SDK requests | 124: 106 typed replies and eighteen intentionally interrupted callers |
| Registration mutations | 56, confined to execution, setup or explicit repair |
| Mutation-free recovery and replay operations | 46 |
| Usable MCP generations | 18 |
| Complete payload observations | 225 files independently compared to frozen bundles |
| Fresh sessions in project B | 84, without the installed features |
| Retained process identities | All 5,902 terminal, observed and closed |
| Controlled caller and worker handles | All 36 terminal and closed |
| Direct command handles | All 348 closed |

User settings and project B settings remain byte-exact. Unrelated project A settings retain their values. Each accepted case closes its provider, transaction worker, command owners and wrapper job before guarded cleanup. A fresh inventory must match the accepted postflight inventory before the owned root is removed.

## Rejected fixture premises

The first replacement-recovery fixture asserted immediate MCP tool availability while Claude was still connecting. Main retained that failed attempt and changed the fixture to request Claude's bounded connection wait when offered, then require the actual echo tool and response. All accepted cases found the echo tool ready. The fallback wait branch was not exercised. The failed attempt's 228 retained process identities and both controlled handles close; its Windows root remains preserved.

A second fixture allowed ten seconds for an unfinished transaction worker after caller termination. Native installation completed, but the fixture terminated the worker before its final reply. Main retained the failure and gave a naturally resumed worker a sixty-second observation window. Exact process identity, completion and handle-closure checks remain required. The successor finishes naturally. The failed attempt's 102 retained process identities and both controlled handles close; its root remains preserved.

One later staging operation was interrupted before any native client started. Its Windows root remains preserved without another inventory, reuse or cleanup. Fresh roots supply the final two accepted cases. These three retained roots do not count as successfully cleaned fixtures.

## Production promotion

Production changes one source row in `src/installer/target/profiles.ts` and its two emitted artifacts. That row gains `claude_code_portable_v1` and `claude_code_portable_v2`. All 731 production candidate files match the pinned, uninstrumented private compile. A fresh production process agrees with the same 342 Lean vectors. Build selection, runtime and product I/O implementations retain their previous bytes.

Twenty-seven focused product tests across six suites, scoped test typechecking and changed-file lint pass. The [sealed acceptance record](../../.audit/probes/portable-project-claude-windows/acceptance.json) binds the predecessor, beforeimages, fixture builds, raw native records, independent main reviews, guarded cleanup and production checks. Scripts and receipts remain under `.audit/probes/portable-project-claude-windows/`.

Codex project agent ownership and revision-cache process admission require a separate design cycle. Windows source symbolic-link qualification also remains open. No macOS host is available. Grok native testing, third-party authentication, CI, package-consumer checks, release checks and publication remain deferred. This qualification does not complete the expansion roadmap.
