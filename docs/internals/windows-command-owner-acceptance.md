# Windows command owner acceptance

The private [command owner](../../src/installer/windows/commands.ts) passes twelve native groups on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. It combines process creation gates, exact process waits and bounded byte exchange behind one scoped channel. This record describes the original component snapshot. The subsequent [host integration](windows-host-integration-acceptance.md) migrates host calls and recipe execution, then repeats these twelve groups. Windows installation profiles remain disabled.

## Design and LDD

The [ownership design](windows-command-owner-design.md) selects one command owner inside the existing transaction controller. It keeps one append-only writer ledger across serial commands. Each birth must be retained before continuation. Completing a command preserves its observations; only completion of the enclosing program closes the writer gate.

The owner reuses Q2-Q10 and Z1-Z22. Eighteen focused argument, stream and writer conformance tests pass before the I/O changes. Their nine contract, model and test source files remain unchanged. No new pure policy replaces the existing gate or completion function.

The native launcher accepts an explicit executable, arguments, directory, environment overrides and three borrowed standard handles. This snapshot retains a fixed recipe entry as a migration adapter. The subsequent host integration removes that adapter. The environment adapter copies the native block, uses Windows ordinal case comparison for overrides and ordering, supplies UTF-16 data with the required flag, and releases the native source block.

The channel reports pump progress and exposes completion of both output streams. The command owner polls debug events with zero timeout, advances byte requests and yields between passes. Its exit status requires the complete process witness and both output EOFs. Returning from the protocol early or interrupting it enters owned cleanup before `run` returns.

## Native cases

| Group | Observed result |
| --- | --- |
| Binary duplex | All 262,281 input bytes return after a nine-byte stdout prefix. The 32,785 stderr bytes remain separate. Native writes and captured output match the fixture patterns. |
| Arguments, directory and environment | Ten arguments preserve empty values, quotes, backslashes, Unicode, tabs and shell metacharacters. The Unicode directory matches. A case-insensitive override replaces the inherited fixture value exactly once; empty and Unicode values survive. Native inspection confirms strict ordinal ordering, double termination and `CREATE_UNICODE_ENVIRONMENT`. |
| Backpressure and process births | Stdout reads stay at nine while consumption pauses. Stderr drains all 131,091 bytes. During that plateau, the controller performs 166 zero-timeout polls and retains a newly requested Node descendant before its startup marker. All 1,048,576 stdout bytes arrive after consumption resumes. |
| Serial commands | Two commands return their distinct outputs. Their retained ledger lengths progress through one, two, three and four entries; completing the first command does not discard its witnesses. |
| Rejected root retention | The root's startup marker remains absent. The operation fails and its independently held process handle signals before closure. |
| Rejected descendant retention | The root executes; a specific Node descendant is rejected before its marker appears. The console helper is retained separately. Every observed family process finishes before closure. |
| EOF and root exit | Stdout reaches EOF and the root exits with code 23 while a retained descendant still holds stderr. Exit status remains pending until that descendant is released and its process and stderr finish. |
| Early protocol completion | The root, ordinary child and detached child are independently observed alive inside the callback. Returning from it stops the family and waits for each exact process handle before returning to the caller. |
| Interrupted exchange | A native input write remains pending while nine stdout reads fill the queue. Interruption finishes cleanup, preserves interruption on the command fiber and leaves the enclosing owner stopped. The captured 589,824-byte stdout prefix matches its fixture. |
| Error exits | Exit code 37 and an uncaught Node exception's exit code 1 are preserved. The exception marker is observed on stderr. |
| Acquisition failures | Injected ordinal-comparison and CreateProcess failures produce `HostUnavailable`. Native environment blocks, startup attributes, requests and handles are released; no fixture starts. |
| Concurrent entry | A second command is refused before another CreateProcess call. The first command remains usable and completes its exchange. |

All 30 retained processes, including console helpers, have independently opened handles bound to PID and creation time. Each is unsignalled during retention and signalled before observer closure. Startup markers remain absent throughout each delayed retention callback. The final run has 30 process births and 30 exit notifications.

All 124 native requests reach terminal results before release. All 245 allocations, 1,052 owned handles, 15 native environment source blocks and 14 startup attribute lists are released. The 30 independent observer handles are also closed. No harness rescue termination is needed. The containment wrapper observes no remaining processes and closes its job after its root exits.

Main independently compares seven binary captures, totaling 2,330,944 bytes, including 2,064,566 output bytes. An eighth artifact preserves the controlled argument, directory and environment observation for separate comparison. All 123 staged product files match the checkout. The 4,531 zero-timeout debug polls include 3,232 no-event returns; each reports actual Win32 error 121 on this host.

## Regression and evidence

The refactored fixed recipe launcher passes all seven existing native scenarios with 15 exact process waits. The modified byte channel passes its eight native groups again, with all 81 requests, 148 allocations and 144 handles released. Main compares all sixteen channel artifacts, including 2,203,834 output bytes.

Scoped TypeScript, Effect diagnostics and lint pass. Effect checks eight files with zero errors, warnings or messages. The source snapshot stays fixed across native runs.

Receipts, source hashes, checked harnesses, captured bytes and independent comparison scripts are under `.audit/probes/windows-command-owner/`. `owner3-observation.json` and `owner3-validation.json` record the accepted combined run. `legacy-validation.json` and `channel-validation.json` record its regressions. `acceptance.json` binds the evidence and cleanup record to the source snapshot.

Two failed harness runs remain preserved. The first expected stdout EOF while the root remained alive after a CRT descriptor close; the fixture did not establish that condition. The corrected handshake observes actual EOF and root exit while a separately controlled descendant remains active. The second treated Effect 4's `Fiber.interrupt` result as an Exit; the corrected harness separately awaits the interrupted fiber. Both failed runs released every tracked resource. No product source changed between these runs.

## Limits

This accepts the private command component against controlled Node processes. The native source block contained no special drive-directory assignments, so their preservation was not exercised. The error-exit case covers a Node exception, rather than a new Win32 exception-disposition test.

The [host integration](windows-host-integration-acceptance.md) now routes native host calls and recipe execution through the shared owner. It removes the fixed recipe path and repeats deliberate native breakpoint coverage. Production controller writes, engine recovery, separate debugging chains, initial owner-publication kills, remaining filesystem obligations, and complete SDK client lifecycle remain open. No macOS host is available; its qualification stays deferred.
