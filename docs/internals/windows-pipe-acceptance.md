# Windows pipe and native memory acceptance

The private Windows launcher now uses stable native memory for startup attributes. Nine diagnostic pipe groups pass on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. This accepts the measured pipe premises and launcher correction. The Windows command channel and installation profiles remain unqualified.

## Product change and LDD order

[`windows-native.ts`](../../src/installer/windows/process/native.ts) allocates the startup attribute list, job-list value and inherited-handle value with `koffi.alloc`. JavaScript views initialize those allocations. Win32 receives their stable pointers. Both acquisition failure and session closure delete the attribute list before freeing its memory and retained values.

Koffi limits ordinary Buffer pointers to a native call. Windows retains startup attribute values until list deletion. Keeping a JavaScript reference alone does not satisfy both contracts. [Koffi pointer lifetime](https://koffi.dev/output), [Windows attribute lifetime](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).

Eleven scoped argument and writer conformance tests passed before this I/O change. The existing Q2 and Z1-Z22 policies are unchanged; the registry remains at 178 obligations. Scoped TypeScript, Effect diagnostics and lint pass. No command-stream model or product pipe implementation is added in this step. Its input limits, output limits and interruption policy still require the LDD sequence before implementation.

## Native pipe premises

The probe creates three kinds of owned resources: pipe endpoints, individual I/O requests with stable storage and events, and child processes with independently opened identity-bound handles. Its server endpoints use byte mode, overlapped I/O, one instance and remote-client rejection. Only the explicit child endpoints are inherited.

| Group | Observed result |
| --- | --- |
| Acquisition and binding | Client and server PID queries on the owned server handle identify the parent. Duplicate server creation fails with 231. An empty read reports pending 997, incomplete 996 and an unsignalled event. A forced inline read returns seven exact bytes through an immediate result query. |
| Already connected | A client opened before `ConnectNamedPipe` produces 535 and a usable connection. |
| Connect cancellation | The pending connect completes with 995 before its resources are released. |
| Read cancellation | The pending read completes with 995. Its native buffer remains unchanged through a subsequent successful read. |
| Blocked write cancellation | An 8 MiB write stays pending while a JavaScript heartbeat runs, then completes cancellation with 995. |
| Cancellation after completion | `CancelIoEx` returns 1168. The completed request still reports seven bytes with unchanged contents. |
| Peer closure | Closing the sole writer produces read error 109. Closing the sole reader produces write error 232, with no accepted-byte claim. |
| Inherited binary duplex | All three requests are pending before child resume. The child emits 128 KiB on each output before reading 512 KiB of input. Both output streams match independently calculated bytes. |
| Exclusion and live cancellation | An inheritable writer excluded from the handle list does not keep its pipe open. Input-write and output-read cancellation both finish while the child remains alive. Its exact handle then signals after termination. |

All 43 requests reach a terminal result before release. All 77 native allocations are freed and all 79 harness-owned handles close. Both independently opened child handles signal before release. The main-thread Python checker compares every captured byte: 655,360 stdout bytes and 131,144 stderr bytes. The stdout includes the echoed input; stderr includes its SHA-256 value. Heartbeats run during backpressure.

The first run failed two overly specific error assertions. It expected 5 for duplicate creation and 109 for the closed-reader write. The actual 231 and 232 mean busy pipe instances and a closing pipe. The corrected probe accepts those explicit outcomes. The original observation remains recorded. This establishes refusal of a second server with the selected flags and instance limit; it does not isolate which setting caused refusal. [Windows error definitions](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-).

## Launcher cleanup

All seven existing Windows execution scenarios pass with the allocation correction, including retention refusal and interruption. All fifteen independent process observations signal. The staged recipe is restored to its original hash.

The allocation observer records 21 allocations across those scenarios, all freed. Three repeated acquisition-failure groups then verify a missing executable and allocation failure after list initialization or after the job value is retained. Their six allocations are freed. A separate cold missing-executable case allocates and frees another three blocks.

The first whole-process handle-count assertion failed at 186 to 201, although all 24 allocations were freed and all execution scenarios completed. The follow-up records cold and repeated measurements separately and collects garbage before each sample. Cold acquisition changes the count from 178 to 194; its exact cause remains unattributed. Each of the three repeated failure groups leaves the count at 194. Acceptance covers those repeated measurements and explicit allocation ownership, not a claim that every cold-process handle is explained.

## Evidence and limits

The reproducible probe, captured streams, original failures, per-run staging hashes and main-thread validation are under `.audit/probes/windows-pipe-premises/`. `acceptance.json` binds the reviewed sources and artifacts. `validate.py` checks the native observations and independently rebuilds the expected binary streams. The isolated stage is removed after verification.

The probe has no debugger loop. Combining the pipe pump with creation gates, bounded product streams, caller interruption, early protocol return and actual client inspection remains open. It forces inline reads, not inline writes. It does not qualify arbitrary executables, other drivers, full engine settlement, Windows filesystem operations or client lifecycle. Windows profiles remain disabled. macOS remains unsupported because no host is available. CI, package-consumer and release-wide checks remain deferred.
