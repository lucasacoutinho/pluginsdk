# Codex Windows project portable lifecycle

Both portable formats pass normal project lifecycles on Windows x64 with Codex 0.163.0 and Node 24.18.0. This gate qualified a private candidate. [Production admission](codex-project-portable-windows-admission.md) now enables both formats after the separate recovery and role-refusal gates.

The private change adds `codex_plugin_portable_v1` and `codex_plugin_portable_v2` to one Windows project profile. Before native I/O, 342 independent expectations agree with TypeScript and Lean. The 332 existing formal obligations remain unchanged. All 187 production source files and the shared Git index are preserved.

| Evidence | Portable v1 | Portable v2 |
| --- | --- | --- |
| SDK requests | 13 | 13 |
| Fresh native sessions | 9 | 9 |
| Sessions in project B | 5 | 5 |
| Native MCP tool calls | 2 | 2 |
| Native agent dispatches | 0 | 2 |
| Native prompt blocks | 0 | 2 |
| Payload files independently compared | 36 | 64 |
| Retained process identities | 321 | 390 |

Each lifecycle installs generation one, replays it, verifies a fixed point, reviews an installation in project B, replaces generation one with generation two, and removes the plugin. A and B share an ordinary Codex home. Fresh sessions in B remain free of the managed plugin throughout. Final sessions in both projects prove absence after removal.

Native checks call the packaged MCP server and compare literal arguments, working directories and environment values. Portable v2 additionally checks startup context, blocked prompts, agent model selection, denied shell access in generation one and available shell tools in generation two. Model protocol requests use a loopback provider fixture; no paid model or third-party authentication is involved.

Both cache and retained revision payloads match the complete bundle path set and bytes. Windows executable intent is retained as package data. Config comparisons use exact bytes plus native attributes and security digests. Only explicit native approval can update the reviewed user hook hashes. Removal restores the original project config and its Windows file basis.

All six replays preserve stored state and configuration, leave backend event logs unchanged and perform no inference request. The installer still performs its exact read-only client probes: version, feature listing and an app-server with plugins disabled. The check rejects other client commands and direct bundled-process execution. Project installation does not invoke native plugin registration commands.

The accepted cases are `attempt-003` and `attempt-004`. Their independent copies retain and verify 1,949 runtime files. All 711 retained process identities reach termination, and every retained process handle closes before inventory and cleanup. Both accepted temporary roots are removed after a final exact inventory check.

Two failed fixtures are preserved. The first rejected legitimate read-only replay probes; a captured counterexample now passes while five activation or wrong-context commands remain rejected. The second exposed an inherited five-minute job limit. The corrected caller, job and controller deadlines are 840, 900 and 960 seconds; individual commands retain their 60-second limit. Its unknown-ownership root was neither inventoried nor copied after the failure.

The raw [matrix receipt](../../.audit/probes/portable-project-codex-windows/matrix-acceptance.json) binds both cases, typed requests/replies, retained bytes, process proofs and cleanup receipts. The [sixteen-case recovery gate](codex-project-portable-windows-recovery.md) and [sixteen-case role gate](codex-project-portable-windows-refusals.md) now complete the private qualification.

macOS has no available host. Grok native testing, third-party authentication, CI, package-consumer checks, release checks and publication remain deferred.
