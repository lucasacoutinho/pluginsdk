# Staged-file write acceptance

The private `stageFile` helper passes eleven cases on Windows 10.0.26200 x64 and eleven on Linux under WSL, using Node 24.18.0. The Windows baseline reproduced four ordinary staging failures before the fix. The same reviewed harness passes after changing only the helper's file lifetime. Windows installation profiles remain disabled.

## Change and observations

The helper now exclusively creates, writes and flushes a file through one writable handle. It closes that handle before flushing the parent directory. The previous implementation wrote by path, then reopened the file read-only. Windows rejected that flush with `EPERM` after the bytes were already visible. The [design](windows-file-staging-design.md) compares both shapes.

| Case | Observed result |
| --- | --- |
| Read-only flush control | Windows returns `EPERM`; Linux succeeds. |
| Write-only and read/write controls | Both flush successfully on both hosts. |
| Binary, empty, nested Unicode and executable-intent payloads | All four Windows baseline calls fail at the read-only flush. All four pass after the fix on both hosts, preserving the exact bytes. Recorded operations bind each successful write and flush to the same handle. |
| Existing file and directory | Staging fails with `StateUnavailable` and preserves the existing contents. A file collision reports `EEXIST`. |
| Existing junction parent | Windows refuses the junction parent before attempting the target write. The physical destination's sentinel remains unchanged. Linux refuses the corresponding directory symlink. |
| Injected file-flush failure | A harness-injected `EIO` reaches `StateUnavailable`. The acquired handle closes, the written bytes remain, and a retry fails with `EEXIST` without overwriting them. |

Linux retains the requested executable and non-executable mode bits under the recorded umask. The Windows executable-intent case checks bytes and handle behavior; Windows executable semantics remain unqualified.

## Evidence and limits

The main-thread verifier compares snapshots, error tags, native error codes, open flags and operation ordering independently of the harness verdict. All 59 observed file handles close across the Windows baseline, Windows fixed run and Linux run. Neither Windows wrapper leaves active descendants. Cleanup removes both owned stages.

Twelve existing lifecycle and repair certificates pass exact-type and standard-axiom checks, and fourteen focused tests pass before the I/O edit. Seven repair-storage tests pass afterward. Scoped TypeScript, Effect diagnostics and lint pass. These proofs qualify the unchanged pure contracts; native evidence checks this filesystem premise. The other 122 staged product files remain unchanged.

The receipts, reviewed harness, isolated source manifests and acceptance seal are under `.audit/probes/windows-file-staging/`. The evidence retains the pre-fix failures. It does not establish power-loss durability, path-race safety, full reparse-point handling, Windows executable identity or complete SDK client lifecycle. Those obligations remain in the [Windows design](windows-design.md#filesystem-obligations). CI, package-consumer and release-wide checks remain deferred.
