# Windows Codex project recovery

All seven interruption cases pass against real Codex 0.163.0 on Windows x64 using Node 24.18.0. They use the public compiler and installer worker with isolated homes and projects. The candidate enables only basic `agent_plugins_v2` project packages. Windows production profiles remain disabled.

| Controlled boundary | Recovery and replay | Execution entries |
| --- | --- | --- |
| Before install | `not_applied`; plugin remains absent | 0 |
| After install | Installed receipt retained | 1 |
| Before replacement | `not_applied`; original payload remains active | 0 |
| After replacement | New receipt and payload retained | 1 |
| Before removal | `not_applied`; installed payload remains active | 0 |
| After removal | Removed; journal retains the removal plan | 1 |
| Caller terminated after install execution; worker released | Worker settles while disconnected; fresh callers acknowledge the installed receipt | 1 |

Each count is unchanged by fresh recovery and replay. The before/after cases terminate the admitted caller and paused transaction worker. The final case terminates only the caller, verifies that the worker still holds both locks, then releases the worker and waits for its completion through the same native handle.

## Native evidence

The 358 recorded steps account for 36 callers and 36 transaction-worker births. Callers and controlled workers use admitted PID/creation/image identities and retained process handles. Every known worker has a separate completion record. Job emptiness supplies no substitute for these process facts.

Thirty-six fresh Codex app-server sessions verify discovery in projects A and B. Every session closes through stdin EOF with exit code zero. The checks compare 126 payload-file observations with approved bundle bytes, preserve unrelated user/project configuration, and retain Windows attributes and DACL digests. Independent final-inventory checks confirm removal of the previous owned cache after replacement and removal.

The controller verifies 5,101 immutable staged files and the unchanged 5,786-file original activation root. It requires an independent receipt before advancing to the next case. All 1,566 added case files are retained outside Windows. After the final exact inventory, the 6,667-file scratch root is removed.

The [design](windows-project-recovery-design.md) explains the controlled source overlays. Raw records, archived journals/configuration/RPC traffic, native inventories and independent Python/Effect-schema validators are under `.audit/probes/windows-project-recovery/client-cases-v4/`. The phase checkpoint is `.audit/probes/windows-project-recovery/acceptance.json`.

## Path correction and proof reuse

An earlier after-install attempt returned from execution without installing the plugin. The checkpoint trace exposed `ENAMETOOLONG` from `mkdtemp` for a 248-character template. That failed diagnostic's process completion was independently checked before cleanup.

Temporary project directories now use a [namespace-prefixed equivalent path](https://nodejs.org/download/release/v24.18.0/docs/api/path.html#pathtonamespacedpathpath) for creation. Later operations use the returned basename under the original canonical parent. Exclusive creation and device/inode cleanup checks remain in place. The exact corrected source bytes pass all seven cases before promotion to `src/installer/project/execute.ts`.

No pure model or public schema changes. Existing Lean WP17-WP20 govern recognized native path aliases; PF2/PF5-PF7 continue to govern Windows metadata and review. The predecessor's proofs, vectors and conforming model sources remain unchanged. The native checks establish the corrected creation premise; the proofs alone do not establish operating-system support for a path.

After promotion, scoped TypeScript checking passes. One focused Linux native v2 lifecycle test also passes in a separate network namespace, covering installation, replacement, stale review, removal and replay with the pinned Node and Codex binaries. No CI, package-consumer or release-wide gate runs.

Earlier completed diagnostics are retained in `client-cases/`, `client-cases-v2/` and `client-cases-v3/`. Their scratch roots are removed. Previously unqualified roots with unknown completion remain retained and untouched.

## Remaining qualification

This accepts the listed boundaries for Codex 0.163.0 project scope and basic v2 packages. It does not complete packaged Windows CLI qualification, other interruption boundaries/scopes, modern process/hook/agent formats, source symbolic links, third-party MCP authentication or remote tool calls. macOS remains deferred because no host is available. Grok native testing and CI/package/release-wide checks remain deferred.
