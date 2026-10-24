# Codex project role refusals on Linux

Fourteen cases qualify role conflicts, incomplete inventory, drift and coexistence on isolated Linux Codex 0.163.0 hosts. They use the identical private SDK that passed [normal lifecycles](codex-project-portable-linux-normal.md) and [interruption and repair](codex-project-portable-linux-recovery.md). The [qualified Linux profile is enabled](codex-project-portable-linux-admission.md); Windows portable project qualification remains separate.

## Refusal behavior

| Case | Public result |
| --- | --- |
| A user declaration claims the requested qualified role | Plan reports `blocked/drift` |
| A project declaration uses another key but its file names the requested role | Plan reports `blocked/drift` |
| A recursively discovered file names the requested role | Plan reports `blocked/drift` |
| A discovered file lacks an identity, has malformed TOML or is a symlink | Fresh agent installation fails with `StateUnavailable` |
| A role or project config changes after review | Applying the saved plan rejects with `PlanRejected/stale_plan` |
| An installed role declaration or cached role file changes | New replacement and removal plans report `blocked/drift`; saved plans reject as stale |
| An installed plugin has an incomplete role inventory | New replacement and removal plans report `blocked/unknown`; saved plans reject as stale |

Every refusal preserves complete watched config, foreign-role and cache trees, including bytes, modes and symlink targets. Existing installation state also remains unchanged. No refused request starts an installation worker. Fresh native sessions remain usable in both projects before and after each refusal. An installed plugin's MCP tool remains usable while its changed ownership blocks SDK replacement or removal.

Two positive controls prevent an overly broad refusal policy. Portable v2 installs and removes alongside unrelated user-declared and recursively discovered roles, preserving those files. Portable v1 contains no agents and installs and removes despite an unrelated malformed role inventory. Both controls make a real MCP call from the native cache and preserve the other project's configuration and plugin absence.

## Native boundary and evidence

The probe records actual config layers and file-defined role identities. It permits legitimate foreign roles in native control sessions. Plugin absence is checked through the skill and MCP inventories. Each session also completes a turn through the isolated loopback provider. Hook approval and foreign-agent dispatch are outside this gate.

| Check | Result |
| --- | --- |
| Accepted native cases | 14 |
| Public SDK requests | 44 |
| Refusals | 7 drift, 2 unknown, 3 unavailable, 9 stale-plan |
| Installation workers started by refusals | 0 |
| Fresh native sessions | 60 |
| Second-project absence sessions | 30 |
| Real MCP calls | 8 |
| Complete original payload-copy files independently rehashed | 146 |
| Retained runtime files copied and independently rehashed | 1,214 |
| Direct commands exited and closed | 132 |

The first native control failed before any SDK request because the probe used Installer's selected config view as a complete native wire schema. Codex also returns a version string on each layer. The corrected probe derives its fields from the SDK schemas and includes that native metadata explicitly. Strict decoding then passes. The failed root and original evidence remain intact; the SDK required no correction.

Main acceptance independently decodes public requests, replies and plan commitments, checks the refusal causes, compares complete watched trees, verifies native inventories and tool calls, and rehashes payload and runtime copies. All accepted namespaces close without timeout, unexpected termination or surviving processes. Native descendant exit statuses remain recorded. The [matrix receipt](../../.audit/probes/portable-project-codex-linux-refusals/matrix-acceptance.json) links every accepted case and cleanup; the [checkpoint](../../.audit/probes/portable-project-codex-linux-refusals/acceptance.json) binds the full predecessor and successor evidence.

This gate changes no production source, profiles or public schemas. The 332 registered proof obligations and 342 private profile comparisons carry forward. The separate admission gate promotes the qualified Linux row. Windows needs its own project portable lifecycle, recovery and refusal evidence. macOS has no available host. CI, package-consumer checks, release, publication and third-party authentication remain deferred.
