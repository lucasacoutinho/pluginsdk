# Windows inspection commands

## Problem and current flow

Authors keep one definition and the existing build, preview and publish commands. Windows support needs the same reviewed installation behavior, including inspection and recovery. The private command implementation must own containment and cleanup for every CLI invocation.

`InstallerEngineLive.apply` resolves the destination before acquiring its locks, resolves it again under those locks, loads the retained record, and checks completion before observation and settlement. `resolveTarget` calls `runHost` for version discovery. Inspection calls `runHost` and `readCodexConfig`; the latter exchanges framed JSON with Codex app-server. The mutation recipe calls the same host functions inside its creation-gated process domain.

Those host functions currently use Effect's Node child-process spawner. Their scoped handles drain output and request shutdown, but that path has no Windows process-tree completion evidence. Adding a Windows profile would expose this gap before full engine recovery could be qualified. The [worker design](windows-design.md) already requires command containment, and the [ledger acceptance](windows-ledger-integration-acceptance.md) qualifies only the mutation entry and bounded fresh-process observation.

## Usage and shape

The host module keeps version/inspection arguments and the Codex protocol. Its Windows process boundary supplies a byte channel to that protocol and owns every native resource:

```ts
interface CommandChannel {
	readonly input: (bytes: Uint8Array) => Effect<void, HostUnavailable>
	readonly endInput: Effect<void, HostUnavailable>
	readonly output: Stream<Uint8Array, HostUnavailable>
	readonly exitCode: Effect<number, HostUnavailable>
}

declare function withWindowsCommand<A, E, R>(
	destination: Destination,
	args: ReadonlyArray<ProcessText>,
	protocol: (channel: CommandChannel) => Effect<A, E, R>
): Effect<A, E | HostUnavailable, R>
```

`runHost` ends input, collects output and checks the exit status. `readCodexConfig` sends initialization, waits for its response, then reads configuration. Its protocol callback may finish while app-server still waits for input. In either case, the command boundary closes input, stops remaining processes and waits for their exact handles before releasing resources or returning. Interruption follows the same cleanup rule. Closing the input stream is a data-channel operation; it grants no process or job control.

`output` carries stdout only. The controller drains stderr separately and charges both streams against the same output budget. Stderr bytes never enter Codex's framed response stream. This preserves the current host protocol while bounding the complete exchange.

This is a private sketch, not an added authoring API. Callers cannot assign jobs, resume debug events, retain native handles or decide when cleanup is complete. Existing writer tracking owns creation and complete process observation. The command boundary adds byte transport and command lifetime; it must reuse that process ownership rather than implement a second completion policy.

Commands inside the current recipe belong to its outer debugger and retained ledger. A nested `DEBUG_PROCESS` launch can start a separate debugging chain and invalidate that ownership assumption. The subsequent [ownership design](windows-command-owner-design.md) resolves this by running the recipe in its existing transaction controller and using one command owner there. The fixed recipe launch remains until host and execution migration complete. Standalone discovery and inspection use an ephemeral ledger. [Debugging-chain rules](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

## Alternatives and synthesis

| Shape | Caller complexity and hidden behavior | Decision |
| --- | --- | --- |
| Launch through Node, then assign the child to a job | Callers keep ordinary streams, but the child can execute before assignment. Cleanup still needs a complete descendant witness. | Reject. Post-launch assignment does not establish the required creation boundary. |
| Add a relay process and a second request protocol | The relay can keep Node streams while the operation worker coordinates relay ownership, readiness, disconnect and recovery. | Reject as the base. It adds another process protocol and another owner without removing native completion obligations. |
| Native process creation with one owned asynchronous channel | A single scoped operation hides executable resolution, argument serialization, inheritance, creation gates, output limits, cancellation and complete handle waits. | Select for qualification. Keep protocol content in the host module. |

The selected transport candidate uses overlapped named pipes. Anonymous pipes do not support overlapped I/O, and synchronous writes can block when their buffer fills. `PeekNamedPipe` can also block on a synchronous handle in a multithreaded application. A blocking call on the debugger's owning thread would prevent event continuation. [Anonymous pipe operations](https://learn.microsoft.com/en-us/windows/win32/ipc/anonymous-pipe-operations), [peek restrictions](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe).

Nine [native pipe premise groups](windows-pipe-acceptance.md) now qualify acquisition, cancellation, stable buffer lifetime and child-side inheritance on the pinned host. The requested pipe buffer size is advisory; it cannot supply an application memory bound. The command implementation must bound accepted input and retained output itself. The source fact table is `.audit/probes/windows-command-design/primary-facts.md`.

An initially successful read or write has completed. The selected path follows the API guidance to pass a null byte-count pointer, then queries the same OVERLAPPED for the actual count. An initially pending request enters nonblocking result polling. The current .NET pipe implementation uses this count-query pattern; the older pipe-server example describes a conflicting restriction. Native acceptance must force the inline path and compare its bytes. Cancellation requests do not complete pending I/O: the adapter must observe a terminal result before releasing the event, OVERLAPPED or data allocation. [Read API](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile), [current .NET source](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Diagnostics.Process/src/System/Diagnostics/Process.Multiplexing.Windows.cs), [cancellation lifetime](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelioex).

Koffi requires stable native allocations for pointers retained beyond one FFI call. Holding a JavaScript Buffer reference does not meet that contract. The selected transport therefore requires `koffi.alloc` for outstanding operations and their data. Startup attribute lists also retain pointers until deletion; the recipe launcher now uses the same allocation rule and passes its native execution and acquisition-failure checks. The diagnostic probe tracks allocation and handle release separately. [Koffi pointer lifetime](https://koffi.dev/output), [startup attribute lifetime](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute). The premise contract and case list are `.audit/probes/windows-pipe-premises/primary-facts.md`.

## Stream policy

The command boundary keeps one remaining input budget and one remaining output budget shared by stdout and stderr. The input state is open or closed and retains its remaining count. An accepted chunk subtracts exactly its byte length. A refused chunk leaves the state unchanged. Input closure occurs once and preserves both counters. Output can continue after input closes. A zero-byte chunk consumes no budget and does not establish EOF.

Each native request separately moves through `pending`, `cancelling`, `terminal` and `released`. Cancellation emits one cancel action and keeps the request owned. Only an observed completion permits a terminal request to release its resources. Releasing is irreversible and occurs at most once. Win32 result decoding supplies completion evidence; neither cancellation success nor error 1168 supplies it.

| Policy shape | Effect on the implementation | Decision |
| --- | --- | --- |
| One command state containing every request slot, queue, byte counter and process phase | Every new operation changes the combined state. It duplicates the existing process gate and couples byte accounting to native scheduling. | Reject. Process completion already belongs to writer tracking. |
| A byte ledger and a request lifecycle behind the same private command boundary | The ledger controls admitted bytes. Each owned request controls its own allocation lifetime. The boundary coordinates both with the existing process gate. | Select. Keep both pure policies in one private schema/model family and keep native handles out of it. |

The intended runtime serializes input calls and acknowledges them after the complete write. It allocates no queue entry for empty input. A bounded output queue applies backpressure while the controller continues polling debug events and request completion. Queue capacity and native chunk size bound retained memory; cumulative byte budgets bound the complete protocol exchange. The pipe's requested capacity supplies neither bound. A blocked byte admission fails the command and enters owned cleanup.

Q3-Q10 in `spec/PluginSdk/Installer/WindowsCommand/Streams.lean` state conservation over arbitrary traces, exact admission, input closure and request release rules before the concrete model. Native request storage and process completion remain external obligations. The model does not turn a cancel request or an exit code into completion evidence.

The private [request adapter](../../src/installer/windows/channels/overlapped.ts) implements the request lifetime with stable event, OVERLAPPED and data ownership. It borrows pipe handles from the command owner and caps each read/write chunk at 64 KiB. Writes copy the source before submission; completion uses that copy's length, so later caller mutation or detachment cannot change it. Read results survive native release. Requests enter the adapter's owned collection before submission, allowing cleanup to find a request even when submission throws.

The [pipe resource](../../src/installer/windows/channels/pipes.ts) owns the three endpoint pairs. It verifies both endpoint PIDs before making the child ends inheritable. Its scope drains every request before closing the corresponding parent pipe. Input closure refuses while any request still owns that input handle. The [byte channel](../../src/installer/windows/channels/channel.ts) applies the proved ledger, serializes writes and holds at most eight queued stdout chunks plus one completed chunk awaiting admission to that queue. Stderr drains independently against the same output budget. Both pass eight [native groups](windows-channel-acceptance.md), including backpressure, byte limits, interruption and acquisition failures. All 81 requests complete before release; 148 allocations and 144 handles are released.

The byte channel exposes one nonblocking pump effect to the command owner. An internal pump fiber would hide scheduling from the debugger owner; the selected shape lets that owner advance both native events and byte requests in one loop. Queue admission never waits in that loop. The current recipe debugger uses a 25 ms event wait. The combined [command owner](windows-command-owner-acceptance.md) now qualifies zero-timeout polling alongside byte pumping, retained births, interruption and exact waits. Host routing and recipe migration remain pending under the [selected ownership design](windows-command-owner-design.md).

Current Windows CLI routing also needs fresh qualification. PATH lookup finds neither client after loading the Windows user and machine search paths. The earlier WindowsApps Codex executable path now returns `ItemNotFoundException`; its recorded version remains historical evidence. This does not establish that neither client exists elsewhere. The lookup record is `.audit/probes/windows-channel/cli-routes.json`.

## Argument contract

The existing recipe command wraps each fixed path in double quotes and rejects embedded quotes and trailing separators. A general inspection command also needs empty arguments, literal quotes, trailing backslashes, Unicode and shell metacharacters to survive unchanged.

The selected codec always surrounds an argument with double quotes. Before a literal quote it emits twice the preceding backslash count plus one. At the closing delimiter it doubles the trailing backslashes. Other backslashes remain literal. Q2 requires an independent quoted-word reader to recover the original text. The reader is intentionally limited to a complete quoted word; it does not claim to parse arbitrary Windows command lines.

Microsoft documents these parity rules for its C runtime and treats `argv[0]` separately. Native acceptance must therefore check the actual target runtime. Executable selection uses the explicit `CreateProcessW` application parameter; a shell is not part of this codec. NUL and malformed Unicode are rejected at the schema boundary. [Microsoft argument parsing](https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments?view=msvc-170).

## Acceptance order

Q2's Lean property, proof, strict wire and independent vectors precede the pure TypeScript codec. Pure conformance passed before the native recipe command changed. The [argument acceptance](windows-argument-acceptance.md) compares 4,850 actual Node arguments and reruns all seven existing native execution scenarios. That accepts the codec on the pinned runtime, not arbitrary executables.

The pipe premises pass separately from the command transport. The stream policy now passes all eight Q3-Q10 proof certificates, 30 independent vectors, 110 malformed requests, 13 valid numeric forms and 67,012 generated TypeScript comparisons across 15,576 traces. The four stream tests and two existing argument tests pass with scoped TypeScript, Effect diagnostics and lint before new product I/O. The private request adapter then passes twelve [native groups](windows-stream-acceptance.md), including forced inline reads and writes. All 22 requests terminate before release; 34 allocations are freed and 23 owned events close. Native integration must combine the pump with process gates, preserve inline coverage, pass interruption checks, exercise actual inspection protocols and preserve Linux behavior. Full engine settlement and real Windows client lifecycle checks follow filesystem qualification. Windows profiles remain disabled throughout these intermediate steps.

- [x] Ground: trace version discovery, inspection, mutation and recovery callers.
- [x] Sketch: compare ownership shapes and select one scoped native command boundary.
- [x] Agree: the active milestone instruction authorizes continued implementation.
- [x] Prove arguments: establish Q2, strict wire and pure TypeScript conformance.
- [x] Qualify arguments: compare the codec with the actual Windows runtime.
- [x] Qualify pipe premises: establish the measured overlapped pipe, inheritance and cancellation behavior.
- [x] Prove stream policy: establish byte bounds, closure and interruption before product I/O.
- [x] Qualify request adapter: force inline, pending, cancellation, buffer ownership and failure paths on Windows.
- [x] Qualify byte channel: exercise bounded queues, independent stderr progress, limits, interruption and scoped pipe cleanup on Windows.
- [x] Qualify command owner: combine debug events and byte requests with retained births and exact process waits.
- [ ] Integrate commands: preserve the host protocols and prove complete cleanup.
- [ ] Complete recovery: qualify filesystem operations, engine settlement and client lifecycle.
