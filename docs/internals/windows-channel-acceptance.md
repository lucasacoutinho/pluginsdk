# Windows byte-channel acceptance

The private [pipe resource](../../src/installer/windows/channels/pipes.ts) and [byte channel](../../src/installer/windows/channels/channel.ts) pass eight native groups on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. They implement bounded stdin/stdout/stderr exchange using the proved stream ledger and qualified request adapter. The subsequent [command-owner record](windows-command-owner-acceptance.md) accepts combined process and byte ownership. Actual host routing and Windows client profiles remain unqualified.

## Design and LDD

The existing Q3-Q10 properties, Lean certificates, strict oracle and 67,012 generated TypeScript comparisons preceded these I/O modules. At channel acceptance, thirteen recorded source inputs were unchanged, including the recipe debugger. The request interface adds its borrowed file handle so the pipe owner can refuse closure while a request still owns that file. All twelve request-adapter native groups pass again after that addition. The subsequent command-owner change updates the launcher and channel, then reruns these eight channel groups and the seven launcher scenarios.

The pipe scope owns all six endpoints. It checks server and client process identities before making the child ends inheritable. Cleanup cancels outstanding requests, observes terminal results, releases request storage and then closes the pipes.

The channel serializes input, copies admitted bytes and acknowledges complete writes. Empty input submits no WriteFile operation. Input closure waits for the writer and remains idempotent. Output uses eight queued stdout chunks and at most one completed chunk awaiting queue admission. Each native chunk is at most 64 KiB. Stderr drains separately, and both output streams share one cumulative budget.

The caller drives a nonblocking pump. A full stdout queue withholds further stdout reads while the pump continues advancing input and stderr. A refused admission fails the channel and wakes pending input and output consumers. Scope cleanup retains native storage until completion.

## Native cases

| Group | Observed result |
| --- | --- |
| Pipe ownership | All parent ends are noninheritable, all child ends are inheritable, and both peer PIDs match the creator. Closing input with an owned pending write refuses. Scope cleanup cancels and releases that request. |
| Binary exchange | A 262,281-byte input containing every byte value returns intact after a nine-byte stdout prefix. The 8,192 stderr bytes stay separate. |
| Empty input and closure | Empty input submits no write; repeated closure succeeds; even empty input after closure fails with `input_closed`. |
| Input limit | A seventeen-byte input against a sixteen-byte limit fails with `input_limit` before WriteFile. |
| Backpressure | Stdout submissions remain at nine during a 100 ms pause. Stderr drains all 131,091 bytes, including its readiness marker, while the pump advances 26,046 times. After consumption resumes, all 1,048,576 stdout bytes arrive unchanged. |
| Shared output budget | Stdout and stderr together exceed the 96 KiB limit. The pump fails with `output_limit`, waking both a pending input writer and the output consumer. |
| Interrupted input | A native write remains pending while stdout is full. Interrupting the input fiber aborts the channel; all requests complete before release. |
| Acquisition failures | Injected failure on the third pipe and a mismatched client PID both refuse acquisition and release every acquired resource. |

All 81 requests reach terminal results before release. All 148 native allocations are freed and all 144 owned handles close. Five children are identified by PID and creation time through independently opened process handles. Both the original and independent handles signal before closure. The wrapper also observes zero active processes before releasing its job.

Main independently compares all sixteen retained artifacts with the fixture byte patterns: 2,926,932 bytes in total, including 2,203,834 captured output bytes. Runtime and binding binaries match the pinned archives. All 121 staged product files match the checkout. Scoped TypeScript, Effect diagnostics and lint pass; diagnostics cover seven files with no errors, warnings or messages. The owned Windows stage is removed after these checks.

The backpressure fixture writes stdout from a worker thread so it can produce stderr independently. Node's Windows pipe writes can block the calling thread; wrapping them in a Promise does not provide concurrent production. [Pinned Node process I/O](https://nodejs.org/download/release/v24.18.0/docs/api/process.html#a-note-on-process-io).

## Evidence and limits

The receipts are under `.audit/probes/windows-channel/`: `acceptance.json`, `channel4-observation.json`, `channel4-validation.json`, `runtime-check.json`, `product-staged-files.json` and the binary captures. `verify.py` performs independent comparisons; `accept.py` records source and artifact hashes and removes only the marked stage. Earlier failed harness receipts and captures remain preserved. The failures concerned result decoding and a fixture whose stdout write prevented it from reaching stderr.

These checks qualify the byte channel against controlled child processes. The subsequent command-owner checks combine it with writer retention, complete process waits and zero-timeout debug polling. Actual Codex/Claude inspection, engine settlement and Windows client lifecycle remain unqualified. The [ownership design](windows-command-owner-design.md) selects recipe execution inside the existing transaction controller and removes the nested recipe debugger during migration. Windows profiles remain disabled. macOS qualification remains deferred because no host is available.
