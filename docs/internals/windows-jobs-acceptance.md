# Windows job component acceptance

The private [`WindowsJobsLive`](../../src/installer/windows/process/jobs.ts) component passes 23 native checks on Windows 10.0.26200, x64, Node 24.18.0 and Koffi 3.3.3. These checks include the corrected rule that job emptiness and absence cannot prove completion. Windows plugin installation remains unavailable. The rejected job-name-only execution draft was removed from the runtime.

The [native check](../../test/native/windows-jobs.mjs) and [worker fixture](../../test/native/windows-job-worker.cjs) exercise the actual TypeScript implementation. The local harness ran them in an owned NTFS scratch directory with isolated environment, profile and temporary paths. An outer Job Object contained the complete experiment. It confirmed zero active members, successful handle close and root exit. No client CLI was invoked.

The checks cover:

- New global jobs, empty-job inspection, exact absence and active executors.
- A forced name collision, which returns error 183 without replacing the original handle.
- Actual process-open error 87 and wrong-object lookup error 6, both retained as typed failures.
- Gated executor assignment before spawning its descendant.
- Termination of both known processes when the owned scope closes.
- Graceful family exit, with the living owner able to observe an empty job.
- Caller disconnect preserving the owner and family, followed by owner death terminating both descendants.
- Sixty-four repeated recovery queries, with process handle count unchanged at 180.
- Closed capabilities rejecting further queries and process assignments.
- Empty and absent job observations returning unknown instead of authorizing settlement.

Process handles captured before termination establish the known processes' exits without relying on PID reuse or a negative-PID query. The post-exit lookup also verifies disappearance of each exact job.

The wire requires `Global\pluginsdk-` followed by 64 lowercase hexadecimal digits. Session-local names are rejected because Windows resolves them separately for each login session. Microsoft's [namespace contract](https://learn.microsoft.com/en-us/windows/win32/termserv/kernel-object-namespaces) establishes that distinction; a second login session was not exercised. Corrected I1-I4, 22 authored cases, 308 generated comparisons, 842 malformed requests and seven numeric cases pass.

The original 22-check snapshot is `.audit/probes/windows-binding/acceptance.json`. The current run is `.audit/probes/windows-execution/jobs-current.json`; the correction and hashes are recorded in `correction.json` in that directory. The [counterexample](windows-recovery-design.md#counterexample) is retained separately. Scoped TypeScript, Oxlint and Effect diagnostics pass. CI, package-consumer and release-wide checks remain deferred.

This acceptance does not cover a real client's descendants, a different launcher or architecture, access denial, a second login session, durable Windows file publication, or a complete install/recovery lifecycle. Those checks remain prerequisites for a Windows profile.
