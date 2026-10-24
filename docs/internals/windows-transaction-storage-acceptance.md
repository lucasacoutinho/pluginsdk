# Windows transaction storage acceptance

The existing transaction-storage helpers pass seven isolated checks on Windows 10.0.26200 x64, NTFS and Node 24.18.0. Two small boundary fixes make directory flushing and retention usable on that host. The subsequent [retained-ledger checks](windows-ledger-integration-acceptance.md) connect the transaction witness; Windows Installer profiles remain disabled.

`syncDirectory` now opens Windows directories with writable access. Its read-only handle previously made `fsync` fail with `EPERM`. Both native `FlushFileBuffers` and Node controls reproduced the difference between read-only and writable handles. The helper still flushes and closes the directory; a failed flush still fails retention.

Recursive `mkdir` returned its first-created path with the Windows namespace prefix. Parent traversal used an ordinary drive path, so the stopping comparison never matched. Canonicalizing the returned path before deriving the stop fixes that mismatch. The requested path must still pass the existing physical-path check.

| Product check | Before | After both fixes |
| --- | --- | --- |
| File write, flush and close | Passed | Passed |
| Directory flush | `EPERM` | Passed |
| Atomic JSON replacement | Exact bytes became visible, then directory flush failed | Passed with exact canonical bytes |
| Recursive durable directory creation | `EPERM` | Passed |
| Durable record write | `EPERM` | Passed with exact canonical bytes |
| Scoped installation lock | Failed before acquisition | Acquired and released |
| Strict record read | Passed | Passed |

The intermediate run with only the access fix passed four checks. It exposed the path mismatch by walking beyond the intended parent and failing to open `C:\Users`. A separate diagnostic recorded the raw and canonical paths without flushing ancestors. The final run used the same seven-case harness and changed only the two production storage files in its staged source manifest.

The integration also adds Z17: every process identity resumed during any finite gate trace remains in its final writer ledger. All 17 writer proof certificates pass the scoped type and axiom audit. Twelve independent traces pass 40 Lean oracle steps. Two TypeScript tests add 1,755 generated traces and 5,016 step comparisons, preserving inputs and every resumed identity. They use the existing step oracle and add no production trace API. Pure conformance passed before the storage edits.

Seven existing Linux repair-storage tests pass after the changes. Scoped TypeScript, Effect diagnostics and Oxlint pass. The exact pre-fix observations, native access controls, path diagnostic, final results, reviewed harnesses and source hashes are retained under `.audit/probes/windows-ledger-integration/`. Process resources were collected before the owned Windows stage was removed.

These checks qualify ordinary transaction-storage operations on this host. The later [retained-ledger checks](windows-ledger-integration-acceptance.md) interrupt one synthetic production metadata write and preserve a fresh owner's replacement after exact controller completion. The separate [staged-file checks](windows-file-staging-acceptance.md) reproduce and fix the payload helper's read-only flush failure; its eleven cases pass on Windows and Linux. Other metadata boundaries, power-loss recovery, complete Windows path containment and native client publication remain open in the [recovery design](windows-writer-recovery-design.md#transaction-integration). CI, package-consumer and release-wide checks remain deferred.
