# Windows stream and request acceptance

The byte-accounting and request-lifetime policies pass their LDD cycle. The private [overlapped request adapter](../../src/installer/windows/channels/overlapped.ts) also passes twelve native groups on Windows 10.0.26200 x64 with Node 24.18.0 and Koffi 3.3.3. The controller, complete command transport and Windows client profiles remain unqualified.

## Policies and conformance

Q3-Q10 in [Streams.lean](../../spec/PluginSdk/Installer/WindowsCommand/Streams.lean) state the properties before the concrete model. The property prefix remains unchanged from the recorded design input. All eight certificates pass the scoped exact-type and standard-axiom audit.

The stream ledger conserves accepted input and combined output bytes across arbitrary finite traces. It admits input only while open and within budget, admits output within budget, preserves state on refusal and closes input without replenishing either budget. Closed input never reopens. Zero-byte output grants no EOF evidence.

The request policy permits release only after observed completion. Cancellation leaves the request owned, emits at most one cancel action and cannot establish completion. Release occurs at most once and remains final.

Thirty independent vectors, 110 rejected malformed requests and 13 accepted numeric forms pass the strict Lean wire. Four [TypeScript tests](../../test/windows-streams.test.ts) compare 42,952 stream steps across 11,204 traces and 24,060 request steps across 4,372 traces. They check byte conservation, closure, request ownership and input immutability against the Lean executable. These four tests and the two existing argument tests pass before new product I/O.

The registered proof count is 186. The combined gate remains deferred. Scoped TypeScript, Effect diagnostics and lint pass; the final diagnostics check covers five files with no errors, warnings or messages.

## Native adapter

The adapter implements connect, read and write requests. It owns a manual-reset event and a stable OVERLAPPED allocation per request. Read and write data use separate stable allocations with a 64 KiB chunk limit. Writes copy caller data before submission. Reads return a separate byte copy that survives native resource release.

The command owner lends the pipe handle and must retain it until its requests finish. The adapter registers each request before submission, including a submission that later throws. Its `owned()` snapshot lets the controller find and drain those requests during cleanup. The adapter releases neither the borrowed pipe nor process handles.

Pending polling first checks the request's event without waiting, then queries its result without waiting. Inline read/write success queries the actual byte count immediately. A cancel request keeps all resources until completion is observed, including when cancellation reports error 1168. [GetOverlappedResult](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-getoverlappedresult), [CancelIoEx](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelioex), [Koffi allocation lifetime](https://koffi.dev/output).

| Native group | Observed result |
| --- | --- |
| Boundary limits | Seven invalid sizes and three invalid handles fail before allocation. |
| Pending connect cancellation | One cancel call; early release refuses; result 995 precedes release. |
| Already connected | Initial error 535 becomes a connected result. |
| Pending read cancellation | One cancel call; result 995; cancelled storage stays unchanged through a fresh read. |
| Inline read | Initial ReadFile succeeds; result query reports seven exact binary bytes, retained after release. |
| Inline write | Initial WriteFile succeeds; result query and peer read agree on seven bytes. |
| Pending write ownership | All 65,536 bytes match after the caller mutates and detaches its original array. |
| Blocked write cancellation | A 64 KiB write remains pending without a reader; result 995 precedes release. |
| Completion wins cancellation | Cancel reports 1168; release still refuses until polling returns the seven completed bytes. |
| Peer closure | Read reports 109 and write reports 232. |
| Acquisition failures | Both allocation failure points and event creation failure release every acquired resource. |
| Submission throws | An injected exception after native ReadFile leaves the request discoverable; polling and release complete safely. |

All 22 submitted requests have observed terminal results before release. All 34 native allocations are freed and all 23 owned events close. Each group ends with no owned request, allocation, event or fixture pipe. The probe process exits and its wrapper releases its job.

Validation separately compares every captured byte: seven retained read bytes and 65,536 write bytes. It checks the recorded request results, per-group resource balances, runtime and binding binaries, and staged product hashes against the checkout. The owned Windows stage is removed after acceptance.

The receipts and captures are under `.audit/probes/windows-stream-design/`: `property-acceptance.json`, `proof-acceptance.json`, `pure-acceptance.json`, `requests-observation.json`, `acceptance.json`, `retained-read.bin` and `detached-source-write.bin`. `validate-native.py` records the acceptance hashes and removes the stage only after its checks pass.

## Remaining work

This request adapter does not implement cumulative budgets or output backpressure. The separate [byte channel](windows-channel-acceptance.md) now qualifies that composition in eight native groups, with all 81 requests completed before release. Neither component creates a CLI process, continues debug events or establishes complete descendant cleanup.

The next step joins the bounded byte pump with the existing writer tracking and preserves the recipe's outer debugger. Complete inspection, interruption, engine settlement and Windows client lifecycle checks remain open. Windows profiles stay disabled. macOS qualification remains deferred because no host is available.
