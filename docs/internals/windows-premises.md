# Windows premise acceptance

Native premise checks ran on Windows NT 10.0.26200.0, NTFS and Node 24.18.0. The official Windows Node archive was checked against Node's SHA-256 manifest. The installed native lock binding was `fs-native-extensions@1.5.1`. These results support the [Windows execution design](windows-design.md); Windows installation remains unavailable.

The original local record is `.audit/probes/windows-qualification/acceptance.json`: 23 checked premises and 18 artifact hashes. The later completion counterexamples and correction are under `.audit/probes/windows-execution/`. The Node probes ran inside separate Job Objects, with isolated profile and temporary directories. The original Job Object experiment separately confirmed both known process exits and disappearance of its exact named job. No client settings, real plugin installations or organization repositories were changed.

| Premise | Native observation | Consequence |
| --- | --- | --- |
| Inherited descriptor retains the writer lock | The child inherited a valid descriptor and survived its parent. A new descriptor acquired the lock after the parent exited. | Windows mutation must retain worker-owned locks; the Linux handoff cannot be reused. |
| Negative-PID query proves group absence | The query returned `ESRCH` while positive-PID queries confirmed the child alive immediately before and after it. | The Linux recovery predicate would misclassify a live Windows execution. |
| Node's Linux open flags are available | `O_NOFOLLOW`, `O_DIRECTORY` and `O_NONBLOCK` were absent. | Native file validation needs a different implementation. |
| Existing sync handles work | Node directory sync and read-only regular-file sync returned `EPERM`. Regular-file sync with read/write access succeeded. | Handle access is part of the durability implementation. |
| Unix modes preserve executable intent | Requested/chmod modes `0600`, `0644` and `0755` all read as `0666`, without executable bits. | Mode equality and executable preservation need an explicit platform contract. |
| Current containment predicate handles Windows separators | `..\outside` passed the existing predicate. | Do not enable Windows capture with the current path check. |
| Open-file identity can survive rename | Node bigint identities remained stable. Native volume/file IDs remained stable, the final handle path changed, and recreating the old path produced another file ID. | Native handle identity is a viable capture/inspection primitive. This does not establish complete containment or race handling. |
| Native directory flush is possible | A backup-semantics directory handle opened with read/write access flushed successfully. Read-only access returned error 5. | A native implementation can be investigated without pretending Node's existing helper succeeded. |
| Write-through move is callable | `MoveFileExW(MOVEFILE_WRITE_THROUGH)` succeeded on an owned file. | This single call does not establish crash ordering or power-loss durability. |
| Job membership and termination cover descendants | The complete member list contained both known Node PIDs and one additional member. Both known processes were alive before last-handle close, then exited; reopening the named job returned error 2. | A job can contain descendants. This post-exit absence check does not prove a general completion barrier. |
| Zero active job members proves completion | With exact membership verified, `ActiveProcesses` reached zero while the descendant's held process handle returned `WAIT_TIMEOUT`; it signalled about 10.4 ms later. | Zero membership cannot authorize settlement. |
| Job name absence proves completion | After last-handle close, reopening the exact job returned error 2 while the verified descendant's held process handle still returned `WAIT_TIMEOUT`. | Name absence cannot authorize settlement. |

The Job Object experiment used a cooperative child that waited on stdin before spawning. It does not qualify assigning an arbitrary running client after launch, nested jobs imposed by other launchers, or suspended production spawning. The extra member was retained in the report without guessing its identity.

Two harness assumptions were corrected before acceptance: clearing the process environment had removed PowerShell's process execution-policy setting, and the first job check expected exactly two members. The final run restored only the process setting and required exact membership instead. Main-thread review also corrected the native PID-list layout to two DWORD counts followed by pointer-sized PID entries.

Client inventory is separate: the original probe captured Cursor IDE metadata 3.0.16 and a Windows Codex executable reporting `0.163.0-alpha.10.2`. Neither client lifecycle was exercised here, and no profile was added. A later fresh lookup finds neither client through the Windows user and machine search paths; the recorded WindowsApps Codex path returns `ItemNotFoundException`. That version is historical evidence, and current invocation routes remain unqualified. The fresh lookup is `.audit/probes/windows-channel/cli-routes.json`.

## Execution contract

[`Execution.ts`](../../contracts/Execution.ts) and [`execution.ts`](../../src/installer/execution/model.ts) classify evidence for a retained process group or Windows job. Corrected I1-I4 have [Lean proof certificates](../../spec/PluginSdk/Installer/Execution/Proofs.lean), checked against the exact property types; their only axiom dependency is `propext`. Empty and absent Windows jobs now return unknown. I4 explicitly prevents raw job accounting from proving completion.

Scoped acceptance passed:

- 22 independently authored cases and 308 generated TypeScript/Lean comparisons.
- 842 malformed-wire rejections and seven numeric decoding cases, including trailing line separators in job names.
- Three focused tests, the scoped patched TypeScript compiler, scoped Oxlint and Effect diagnostics on all three TypeScript files with zero diagnostics.

The [counterexample record](windows-recovery-design.md) supersedes the original empty/absent interpretation. Its local source and reports are under `.audit/probes/windows-execution/`. The rejected runtime was archived there and removed from product source. Experimental `windows_running` records remain readable but cannot authorize settlement. Linux execution retains its existing interpretation. No Windows native adapter is enabled. CI, package-consumer and release-wide checks remain deferred.
