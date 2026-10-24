# Windows lock owner acceptance

The private Windows lock-owner guard passes nine isolated native case groups on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. It publishes the controller's process identity before admitting protected work and refuses admission while a recorded foreign owner is active or unknown. A fresh process recovers a retained owner record after forced termination. Windows Installer profiles remain disabled; this accepts the ownership component.

## Contract and implementation

The [design](windows-writer-recovery-design.md#lock-owners) uses a separate record for each full process identity under the installation lock directory. Late publication from one owner cannot replace another owner's record. Strict record decoding binds each body to its filename.

The existing [process lookup](../../src/installer/windows/process/writers.ts) now supplies both current-process identity and prior-owner observations. It retains fixed query/synchronization rights, creation-time binding, direct process waits and scoped handle closure. The [lock implementation](../../src/installer/storage.ts) checks prior completion, durably publishes its own record, and then cleans completed foreign records. Scope release removes its own record and flushes the owners directory before closing the file lock.

Z18-Z20 [state](../../spec/PluginSdk/Installer/Writers/Properties.lean) exact completion, activity and unknown evidence for foreign owners. Z21-Z22 exempt only the current full identity. All 22 writer certificates pass the scoped exact-type and standard-axiom audit. Nineteen independent owner vectors, 14,135 generated TypeScript comparisons and 3,186 malformed-wire requests pass before the I/O changes. The focused writer suites pass twelve tests. Scoped TypeScript checking, Effect diagnostics and lint pass, with zero Effect errors, warnings or messages across nine checked files.

## Native checks

| Case group | Observed result |
| --- | --- |
| Ordinary scope | The exact owner record exists before the callback writes metadata. Scope release removes the record and closes the lock file descriptor. |
| Existing current owner | An actively observed exact self identity permits acquisition. The admitted scope still publishes its own record and removes it on release. |
| Active foreign owner | A real foreign process has a retained owner record but holds no file lock. Acquisition fails before the callback; its record bytes are unchanged and no metadata sentinel or new owner record appears. Independent handle waits bracket the attempt. |
| Unknown foreign owner | The PID-four observation is unknown. Acquisition fails before the callback, preserving the record and leaving the metadata sentinel absent. |
| Signalled foreign object | An original process handle stays open and signalled while a separate retry process acquires the production lock, publishes its own record and removes the completed owner's record before the callback. |
| Changed generation | A controlled different creation time on the current PID is treated as a foreign, terminated identity. Acquisition cleans that record. This does not demonstrate actual PID recycling. |
| Strict records | Malformed JSON, an extra body field, filename/body disagreement, an unexpected file and a directory entry all refuse admission. The five subcases preserve their bytes and create no metadata sentinels. |
| Unpublished temporary file | A file with the atomic-publication temporary naming shape is ignored and preserved byte-for-byte. The admitted owner record is removed on scope release. |
| Forced controller termination | `TerminateProcess` kills a process holding the production lock. Its owner record survives unchanged. An independent exact process handle signals before a fresh retry, remains held throughout recovery, and signals again before closure. The retry publishes its own record, removes the old record before the callback, and removes its own record on scope release. |

All three independently retained process handles signal before closure. All eleven raw file handles close, all five child processes are collected, and cleanup reports no errors. The outer process exits zero, its output is collected, and its containment job closes. Job accounting does not supply the guard's completion evidence.

The unchanged seven storage cases also pass against the new guard on this Windows host. Seven Linux repair-storage tests pass. A direct Linux lock control confirms a closed file descriptor and no owner-directory creation.

## Evidence and limits

Receipts, the reviewed harness, exact staged source hashes and the acceptance record are under `.audit/probes/windows-lock-owners/`. The first lifecycle run passed seven groups but timed out in two cooperative child shutdowns. `failed-release/` preserves that harness and its results. Closing the harness's stdin pipe after its release command corrected both timeouts. Only `probe.mjs` changed between those staged runs; the product sources were identical.

These checks establish ordinary owner publication, refusal and cleanup, plus recovery of an owner record after controller termination. They do not force a kill during initial publication or outstanding metadata I/O. The subsequent [retained-ledger checks](windows-ledger-integration-acceptance.md) connect complete pending records, cover creation/retention/continuation and interrupt a synthetic production metadata write. The later [publication checks](windows-owner-publication-acceptance.md) pass nine initial-publication termination cases and fresh-process recoveries. Other metadata boundaries, full engine settlement, separate debug chains, filesystem qualification and real Windows client lifecycle acceptance remain open. Process termination does not simulate machine power loss. No macOS host is available; CI, package-consumer and release-wide checks remain deferred.
