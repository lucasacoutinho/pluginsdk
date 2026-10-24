# Codex project role refusals on Windows

Sixteen accepted cases qualify role conflicts, incomplete inventories, drift and coexistence on isolated Windows x64 Codex 0.163.0 hosts. They use the identical private SDK that passed the [normal lifecycle gate](codex-project-portable-windows-normal.md). The [recovery gate](codex-project-portable-windows-recovery.md) retains its separate execution instrumentation. [Production profile admission](codex-project-portable-windows-admission.md) now enables both formats through the ordinary SDK and CLI.

## Refusal behavior

| Condition | Public result |
| --- | --- |
| A user declaration, project alias or recursively discovered file claims the requested qualified role | Fresh plan reports `blocked/drift` |
| A discovered role lacks an identity, has malformed TOML or is reached through a junction | Fresh agent installation fails with `StateUnavailable` |
| A role, project config, Windows file attribute or named stream changes after review | Saved plan rejects with `PlanRejected/stale_plan` |
| An installed declaration or cached role file changes | Fresh replacement and removal plans report `blocked/drift`; saved plans reject as stale |
| An installed plugin has an incomplete role inventory | Fresh replacement and removal plans report `blocked/unknown`; saved plans reject as stale |

Every accepted refusal preserves complete watched config, foreign-role and cache trees, including bytes, native file attributes, security digests and stream classification. The named-stream case also compares that stream's bytes independently. Installation state remains unchanged across the refused calls. Directories are compared by their complete entries; this gate makes no directory-DACL preservation claim.

Fresh native sessions remain usable in both projects before and after refusal. Installed plugins make real calls to their cached MCP server while the SDK blocks replacement and removal. Read-only client probes and pinned SDK workers are allowed; refused operations do not activate a plugin or directly execute its bundled programs.

Two positive controls qualify installation and removal. Portable v2 coexists with unrelated user-declared and recursively discovered roles. Agent-free portable v1 coexists with an unrelated malformed role file. Both preserve foreign files, make a real MCP call and prove the second project remains free of the managed plugin.

## Evidence

| Check | Result |
| --- | --- |
| Accepted native cases | 16 |
| Public SDK requests | 48 |
| Public refusals | 7 drift, 2 unknown, 3 unavailable, 11 stale-plan |
| Fresh native sessions | 68 |
| Second-project absence sessions | 34 |
| Real MCP calls | 8 |
| Original payload-copy files independently compared | 146 |
| Retained runtime files independently rehashed | 2,320 |
| Retained process identities terminal and handles closed | 1,421 |

The private profile repeats 342 Lean/TypeScript comparisons before each I/O phase. The 332 existing formal obligations carry forward. All 187 production source files and the shared Git index remain unchanged.

Main acceptance independently checks strict public wires, canonical plan commitments, raw process births and command journals, native config layers, inventories, completed control turns, actual tool-call events, complete payload bytes and retained runtime copies. Every accepted root is removed only after complete retention and a final exact native inventory check. The fixture-owned junction and stream are removed after their behavior proofs; the foreign target and ordinary config file remain intact.

The [matrix receipt](../../.audit/probes/portable-project-codex-windows-refusals/matrix-acceptance.json) binds all accepted cases and cleanups. The [checkpoint](../../.audit/probes/portable-project-codex-windows-refusals/acceptance.json) binds the predecessor, both probe phases and their retained evidence.

## Counterexamples and limits

The local verifier initially applied Linux revision-path rules to a saved Windows plan. It now checks host-independent canonical commitments; the original SDK performs physical plan validation on Windows. The failing verifier and diagnostic are retained.

The first v2 coexistence run returned `completed/not_applied` during removal after a read-only Codex app-server command failed. Its exact startup, transport, protocol or timeout cause was not recorded. All 124 retained identities closed, and that failed physical root was preserved without postfailure runtime inventory or copying. A fresh root completed the same control with the identical SDK. No SDK fix or definite failure cause is claimed.

The first stream fixture incorrectly expected `StateUnavailable`. Windows correctly returned `PlanRejected/stale_plan`. Its root and all 44 closed process identities remain recorded. A separate phase repeats the corrected expectation, proves preservation and completes cleanup with unchanged SDK and native helpers.

The actual directory junction qualifies the inventory's reparse-point refusal branch. File and directory symbolic-link qualification remains unproved. macOS has no available host. CI, package-consumer checks, release-wide checks, publication and third-party authentication remain deferred.
