# Windows owner publication acceptance

The installation lock passes nine native controller-termination cases on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. Each case uses the production storage implementation and a separate recovery process. This accepts the initial owner-publication boundaries in the [design](windows-owner-publication-design.md). Windows installation profiles remain disabled.

## Observed boundaries

| Termination point | Retained state and recovery |
| --- | --- |
| Before temporary open | No owner file exists. Recovery publishes its own identity. |
| After temporary open | An empty unpublished temporary file survives unchanged. |
| Partial temporary write | An invalid JSON prefix survives only in the unpublished temporary file. |
| After temporary write | Complete temporary bytes survive before file flush. |
| After temporary flush | Complete temporary bytes survive after file flush. |
| Before rename | The flushed temporary file has closed and remains unpublished. |
| After rename | The exact old owner record exists before the directory flush. Recovery removes it after establishing completion. |
| After owner-directory flush | The exact old owner record exists after the successful flush. Recovery removes it after establishing completion. |
| Protected callback | The owner record and controlled metadata exist. Recovery removes the completed record and replaces the controlled metadata. |

Protected metadata remains unchanged in all eight pre-admission cases. Every fresh recovery process publishes its own identity before its callback, writes its controlled metadata, and removes its own owner record on scope release. The five unpublished temporary files remain byte-for-byte unchanged through recovery and release. The three published old owner records are removed.

The parent independently opens each publication and recovery process, checks its PID and creation time, and observes it live. It terminates each publication process, waits for that exact process object, and holds the original handle throughout recovery. All eighteen independent process handles signal before closure. Recovery releases its scope normally and reports no open file handles. The wrapper collects the root process, reports no active descendants, and closes its containment job.

## Evidence and limits

The main-thread verifier checks operation ordering, filename/body identity, metadata generations and 1,266 snapshot file bytes independently of the probe's verdict. The existing 22 Lean certificate checks and nineteen focused tests pass before native work. All 123 staged product files match the checkout; this qualification changes no production interface or implementation.

Receipts, source hashes, reviewed harnesses and the acceptance seal are under `.audit/probes/windows-owner-publication/`. The owned Windows stage is removed after verification. The partial-write case deliberately splits the harness's underlying write; the other checkpoints surround actual filesystem operations. These observations cover process termination at those boundaries. They do not simulate power loss or arbitrary driver latency.

Production pending-record boundaries, separate debug chains, remaining filesystem behavior, executable identity, full engine settlement and complete SDK client lifecycle remain open. No macOS host is available. CI, package-consumer and release-wide checks remain deferred.
