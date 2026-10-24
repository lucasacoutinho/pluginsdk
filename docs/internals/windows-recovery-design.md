# Windows recovery redesign

The job-name-only execution draft was rejected. Its completion premise failed on the actual Windows host. The corrected Lean and TypeScript models deny settlement from empty or absent jobs, and that draft has been removed from product source. Windows installation remains unavailable.

## Caller's view

Authors keep the existing definition, `build`, `preview` and configured `publish` workflow. SDK consumers keep `Installer.plan` and `Installer.apply`. Process tracking is private to Installer; authors do not configure jobs, debugging flags or recovery witnesses.

## Counterexample

The probes held process handles before termination and verified both root and descendant membership with `IsProcessInJob` against the exact job handle. The descendant was detached, so Node's ordinary parent cleanup could not substitute for SDK containment.

| Observation | Held process handle at that point | Result |
| --- | --- | --- |
| `TerminateJobObject` followed by `ActiveProcesses = 0` | Descendant returned `WAIT_TIMEOUT`; it signalled about 10.4 ms later. | Zero accounting is insufficient. |
| Last job handle closed; `OpenJobObjectW` returned null and error 2 | Descendant still returned `WAIT_TIMEOUT`. | Name absence is insufficient. |

The reports are `.audit/probes/windows-execution/termination-membership.json` and `last-close-membership.json`. Both experiments subsequently waited for the known processes to terminate. These measurements disprove equivalence with process-handle completion; they do not demonstrate a late filesystem write.

Microsoft documents asynchronous termination and recommends waiting on the process handle. The process cannot exit until pending I/O has completed or been cancelled. [TerminateProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess).

The correction follows LDD: remove job emptiness and absence from `QuietEvidence`, prove I1-I4, update the two independent expectations, establish strict-wire and TypeScript conformance, then remove the rejected I/O path. I4 explicitly forbids using raw job accounting as completion evidence. Experimental `windows_running` records remain readable and pending; the runtime creates no new ones. Existing Linux records retain their encoding and behavior.

## Candidates and decision

| Shape | What the module owns | Decision |
| --- | --- | --- |
| One job name and accounting observation | Descendant containment and job lookup. | Reject. It loses the evidence needed to prove completion after controller death. |
| Explicit writers, each in a job limited to one process | Suspended launch, durable identity retention, execution and individual waits. Native commands cannot start their own helpers. | A native probe admitted Node and blocked ordinary/detached child creation. It requires moving every launch to the controller and can break clients that need helpers. Keep as an alternative. |
| Native preparation in an isolated directory; SDK alone publishes client state | Write containment, complete output capture and client-specific registration changes. | Requires a qualified filesystem sandbox and new publication adapters. A temporary home alone does not establish write containment. Keep as an alternative if tracing changes client behavior. |
| Record every writer at its OS creation gate | Launch the recipe under `DEBUG_PROCESS`, retain each process before continuing it, contain the family and wait on individual handles. | Select for the next LDD contract. It can preserve native helper behavior while keeping one owner for authorization and completion. |

The selected module hides process birth, handle duplication, event dispatch and cleanup behind the existing execution operation. A caller cannot coordinate `create`, `retain` and `continue` itself. This follows the existing worker ownership decision and keeps native wire details out of public configuration.

## Replacement sketch

The [pure writer schemas](../../contracts/Writers.ts), [protocol](../../src/installer/windows/process/model.ts) and private native `run` and `completion` components are implemented. Their interface keeps process tracking inside Installer:

```ts
import type { Completion, Writer } from "../../contracts/Writers.ts"

type WriterLedger = ReadonlyArray<Writer>

interface WindowsExecution {
  readonly run: (
    plan: ReviewedPlan,
    retain: (writers: WriterLedger) => Effect<void, StateUnavailable>
  ) => Effect<void, StateUnavailable>
  readonly completion: (
    key: InstallationKey,
    writers: WriterLedger
  ) => Effect<Completion, StateUnavailable>
}
```

`CreationTime` represents the exact 64-bit `FILETIME` as 16 lowercase hexadecimal digits, without a JavaScript number conversion. It is not a globally unique nonce. The full reviewed plan and journal remain in the existing retained record; the ledger does not duplicate their identity.

Integration keeps one controller in the accepted transaction worker, which owns the installation locks. The component owns the job, consumes debug events, interprets the proved gate actions and waits on its retained handles. A private Win32 boundary owns buffer layouts, raw handles and native return decoding. The [retained-ledger integration](windows-ledger-integration-acceptance.md) stores ordered writer identities in the full transaction record. These mechanisms do not become SDK exports.

The alternative was a second debugger process with retention acknowledgements over IPC. That separates native polling from the engine, but gives lock ownership and execution ownership different failure lifetimes. Keep the existing one-shot worker instead. Its admission protocol already prevents a second transaction from sharing the controller's debug thread. A generic process API would also expose launch flags and continuation ordering to callers; the selected operation accepts the reviewed plan.

The recipe entry reads the already-retained pending plan and checks its exact plan ID. It adds no temporary request format or second plan snapshot. Linux keeps its existing IPC entry. Returning from the Windows controller requires direct process-handle completion. Fresh-process completion checks now use the retained ledger; full engine inspection and settlement remain unqualified. The private component does not activate a Windows profile.

The controller creates the recipe process in its containment job at creation, using the job-list startup attribute, and enables descendant debugging. Every creation event gives it a process handle before that process executes user code. It duplicates that handle, extends the writer list and waits for the retention callback before continuing the event. Integration retains that ledger while keeping the installation locks. Retention failure never permits authorized continuation; cleanup requests termination before draining the pending event. The creating thread must own the debug-event loop. These are documented [debug creation gates](https://learn.microsoft.com/en-us/windows/win32/debug/debugging-events), [descendant tracing rules](https://learn.microsoft.com/en-us/windows/win32/debug/process-functions-for-debugging) and [thread restrictions](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent).

An exit notification is not completion. The controller continues it, then waits for the duplicated process handle to signal. Microsoft explicitly distinguishes the exit event from completed kernel shutdown. [Exit event semantics](https://learn.microsoft.com/en-us/windows/win32/debug/debugging-events).

On controller death, every writer already allowed to execute must be present in the durable ledger. A process whose creation was not retained must still be at its creation gate. Job termination and debugger-exit behavior provide containment; recovery must independently establish completion for the entire retained ledger. A root PID alone is insufficient for the existing recipe, which launches client commands and their descendants.

## Native premise checks

On Windows 10.0.26200, Node 24.18.0 and Koffi 3.3.3, the tracing probe:

- Paused the initial process for 100 ms and confirmed its startup marker was absent.
- Retained each identity with a read/write file flush before `ContinueDebugEvent`.
- Captured five process creations, including both known ordinary and detached Node children. `GetProcessId` verified each duplicated handle's identity.
- Allowed both child operations to succeed and waited for every duplicated handle to signal.

The report is `.audit/probes/windows-execution/debug-cohort.json`. This is a process-control premise check. It does not qualify journal-directory durability, controller-death recovery or any client lifecycle.

The separate one-process-job probe passed its positive control, blocked both child launches and terminated an unresumed process without running its script. The child-process token-policy experiment failed before Node's script began, with exit code `0xc0000142`. That failure remains recorded; it is not accepted as successful containment.

## Pure protocol

The [Lean properties](../../spec/PluginSdk/Installer/Writers/Properties.lean) state Z1-Z10 before the model and proof certificates. A fresh birth requests retention of the previous writer list with the new identity appended. Only an acknowledgement of that exact ordered list permits continuation. Duplicate identities, mismatched acknowledgements and retention failures stop the gate. Closed and stopped states absorb further signals.

Completion requires a unique ledger and exactly one matching terminated observation for each writer. Any matching active observation takes precedence. Missing, duplicate or conflicting evidence returns unknown. Unrelated observations are ignored. An empty ledger completes because it authorizes no writers. A retaining gate cannot close, including when its previous ledger is empty.

These properties govern supplied evidence. The adapter must report every writer birth, acknowledge retention only after its durability requirements pass, and produce termination evidence from the exact process it observed. The model does not establish those operating-system facts or permit using job accounting as termination evidence.

## Remaining native obligations

The runtime must conform to the proved protocol while preserving locks, owned handles and retained journal state. Its initial unretained process must remain at the creation gate until retention succeeds. Retention failure must terminate and wait for that process during cleanup.

Fresh-process observation now has a [proved contract](windows-writer-recovery-design.md) and [component acceptance](windows-writer-recovery-acceptance.md). Generic `OpenProcess` failure alone is not a completion certificate. An earlier diagnostic probe reopened the terminating process successfully while its original handle was unsignalled. Its process-snapshot sample ended after termination, so that sample does not qualify absence as a completion barrier.

A follow-up probe checked the held handles immediately after snapshot capture, before enumerating entries. All four trials verified exact root and detached-child membership. Capture took 12.5–13.6 ms; both handles were unsignalled before capture and signalled when it returned. No counterexample was observed, but the processes could have terminated during capture. This result does not qualify snapshot absence as completion evidence. The reports and isolated fixture are under `.audit/probes/recovery-snapshot/`.

The [NtOpenProcess reference](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddk/nf-ntddk-ntopenprocess) does not define `STATUS_INVALID_CID` as a termination result or explicitly specify the proposed PID-only client ID with a null thread ID. The retrieved contract therefore does not justify a new negative completion classifier. The primary-source comparison is `.audit/probes/windows-execution/recovery-process-facts.md`.

The [retained-ledger checks](windows-ledger-integration-acceptance.md) cover controller death at creation, retention and continuation. Full engine recovery and exact client checks remain open. The component checks cover one deliberate `DebugBreak`; they do not qualify every client exception behavior. Windows allows a descendant to start a separate debugging chain. The qualified recipe must account for that case or reject it.

The full Windows recovery milestone remains open. Returning unknown indefinitely is a safe interim result, not its acceptance criterion. Filesystem capture, publication, read-only command containment and complete client lifecycle checks remain required.

## Current acceptance

Corrected I1-I4 pass the exact property-type and axiom checks. The wire passes 22 authored cases, 842 malformed requests and seven numeric cases; TypeScript adds 308 generated comparisons. Eight focused tests and 23 native Windows job checks pass. The unchanged Linux recovery behavior passes all nine source Codex project recovery cases on pinned Codex 0.163.0 and Node 24.18.0.

Z1-Z16 pass the scoped exact property-type and axiom audit. The writer wire accepts 72 independent cases and eight JavaScript numeric equivalents and rejects 8,940 malformed requests. Eight TypeScript tests add 7,240 generated protocol comparisons and 279 observation comparisons, including input immutability. The scoped compiler, Effect diagnostics and Oxlint pass. This pure acceptance does not qualify a Windows client or recovery adapter.

The private [execution component](windows-debug-runtime-acceptance.md) passes seven isolated Windows checks, including the actual retained recipe entry, ordinary/detached descendants, failed retention, interruption and a deliberate breakpoint. All 15 independent process-handle observations signalled before return. Three worker-entry tests and all nine Linux project recovery cases pass after the shared entry change. That acceptance covers the execution component; retained transaction integration has separate checks below.

The private [completion component](windows-writer-recovery-acceptance.md) passes four isolated Windows trials and 56 request groups, with active and terminated handles, missing objects, changed creation identities, inaccessible processes and duplicate/mixed ledgers. All eight independent target handles and four observer handles signalled before cleanup. Handle counts were unchanged across every request group. The controlled generation checks do not demonstrate real PID recycling, and these observations do not complete transaction recovery.

The [transaction-storage slice](windows-transaction-storage-acceptance.md) adds Z17, proving coverage of every resumed identity over finite traces. Its two TypeScript tests conform on twelve authored traces and 1,755 generated traces. Seven Windows storage checks and seven Linux repair-storage tests pass after fixing writable directory access and canonicalizing the parent-flush boundary. The later integration checks add bounded controller metadata and lock-owner recovery evidence.

The [lock-owner component](windows-lock-owner-acceptance.md) adds Z18-Z22 and passes nine native case groups, including refusal for active/unknown foreign owners and a fresh-process retry after forced controller termination. All three independent process handles signal before closure. That slice qualifies owner-record recovery; initial-publication kills remain open.

The [retained-ledger integration](windows-ledger-integration-acceptance.md) stores ordered writer identities in full ordinary and repair records. Nine native completion checks and six execution/recovery groups pass, including the original no-op repair entry, controller death, actual detached-child retention refusal and a partial synthetic production metadata write. All 24 independent handles signal before closure and thirteen child processes are collected. The fresh observer loads state and checks quiescence under the production lock without replaying the recipe. Full engine inspection and settlement remain unqualified. All nine Linux Codex project recovery tests pass after this integration.

The rejected source snapshot, failed runs, premise probes and correction hashes are retained under `.audit/probes/windows-execution/`. Writer protocol evidence belongs under `.audit/probes/writer-protocol/`. CI, package-consumer and release-wide checks remain deferred.

- [x] Ground: verify the completion counterexample and trace all current recipe launches.
- [x] Sketch: compare complete alternatives and select a ledger retained at process creation gates.
- [x] Agree: the active milestone instruction authorizes continued work.
- [x] Prove: state Z1-Z10, audit the certificates and establish pure TypeScript conformance.
- [ ] Implement: connect the native adapter and qualify its remaining recovery obligations.
- [x] Scrap: remove the disproved job-name-only runtime and retain its evidence.
