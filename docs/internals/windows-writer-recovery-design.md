# Windows writer recovery

## Problem and callers

A controller can die after authorizing native code but before recording completion. The retained transaction must then distinguish an original writer that can still commit from one that has finished. Job accounting already failed this requirement on the real host. The [live execution component](windows-debug-runtime-acceptance.md) retains exact writer identities at creation and waits on their handles, but those handles disappear with their owner.

Authors keep one definition and the existing build, preview and publish commands. SDK callers keep `Installer.plan` and `Installer.apply`. The private transaction engine asks for completion of the retained writer ledger; it does not open processes, interpret error codes or decide whether a reused PID belongs to its operation.

## Grounding

`InstallerEngineLive.apply` saves a full pending record before `executeOnce`. Its retention callback replaces the execution witness under the same installation locks. A retry checks quiescence before inspection and settlement and never repeats the recipe. Repair follows the same execution rule. The Windows operation worker owns the locks itself because Windows process locks cannot use the Linux inherited-description handoff.

Microsoft's PID-lifetime explanation distinguishes process execution from the lifetime of its kernel object and identifier. Its delayed-I/O explanation says drivers can delay kernel cleanup. These facts support investigating direct process-object lookup; they do not turn a running-process list into a completion certificate. [PID lifetime](https://devblogs.microsoft.com/oldnewthing/20110107-00/?p=11803), [delayed cleanup](https://devblogs.microsoft.com/oldnewthing/20040723-00/?p=38363).

The Win32 `OpenProcess` reference documents error 87 for PID zero, but no general stale-PID mapping. Microsoft's `dotnet/runtime` implementation separately treats error 87 from a nonzero PID lookup with query and synchronization rights as not running. That is implementation evidence, rather than a broader API guarantee. Its other exit-code and enumeration shortcuts are not suitable substitutes for this SDK's handle waits. The source snapshot and fact table are under `.audit/probes/windows-recovery-witness/`.

## Candidates and synthesis

| Shape | What it owns and exposes | Decision |
| --- | --- | --- |
| Another watcher retains all process handles | Authorization requires a second process to acknowledge every new handle before continuation. That process can wait and persist completion after the controller dies. | Reject as the recovery foundation. If both owners die, the same lost-handle question remains. It also splits authorization, lock lifetime and retention across processes. |
| Retain a completed flag after the live controller finishes | A durable flag provides completion evidence on later retries. | Useful only after successful retention of that flag. It leaves the controller-death window unresolved and cannot be the complete design. |
| Recover each retained writer through process-object lookup | One private operation owns fixed lookup arguments, identity binding, handle waits, native error interpretation and aggregate completion. | Select for qualification. It can recover without another persistent actor or changes to the author's workflow. Every negative lookup interpretation needs its own evidence. |

The selected shape extends the existing writer module. It keeps identity resolution and ledger completion together, per boundary and type-system discipline. A separate public process manager would expose the mechanism without protecting the full recovery decision.

## Type sketch

```ts
type Lookup =
  | { readonly type: "opened"; readonly writer: Writer; readonly state: ProcessState }
  | { readonly type: "missing"; readonly pid: ProcessId }
  | { readonly type: "unavailable" }

interface ObservationInput {
  readonly writer: Writer
  readonly lookup: Lookup
}

declare function observeWriter(input: ObservationInput): Observation

interface WindowsExecution {
  readonly run: (
    plan: ReviewedPlan,
    retain: (writers: ReadonlyArray<Writer>) => Effect<void, StateUnavailable>
  ) => Effect<void, StateUnavailable>
  readonly completion: (
    key: InstallationKey,
    writers: ReadonlyArray<Writer>
  ) => Effect<Completion, StateUnavailable>
}
```

Effect schemas define these representations. `opened` reports the actual handle identity and wait result. A matching PID with a different creation time means the old PID was reused; it does not identify the newly opened process as an original writer. Equal creation times are not assumed globally unique. `missing` is a positive claim that this PID no longer identifies a process object, not a synonym for any failed API call. Access denial, failed native decoding and unsupported observations cannot produce it.

The pure observation always retains the original writer identity. Bound missing evidence, a different generation of the same PID, or a bound terminated handle permits a terminated observation. Only the same full identity with an active handle permits an active observation. Other evidence remains unknown. Existing ledger completion rules then apply, including duplicate-ledger rejection and active-evidence precedence.

## Proof and native checks

Z11-Z16 require original identity binding; exact termination, activity and unknown classification; rejection of unbound lookup evidence; and termination of the old writer when its PID has been reused. All 16 writer properties compile and pass the property-type and axiom audit. Strict wire checks pass 72 authored cases, 8,940 malformed requests and eight numeric cases. TypeScript matches the oracle on the independent observation vectors and 279 generated combinations. Native implementation follows that conformance.

A fresh observer process queries known root and detached-child PIDs before termination, during job termination, while signalled original handles remain open, and after those handles close. Independent held-handle waits bracket each query. The premise probe reports raw results and counterexamples; it does not classify absence as completion. PID-zero and protected-process controls separate invalid input and access denial from the ledger's positive original PIDs. Complete process enumeration is diagnostic evidence only.

Four isolated trials on Windows x64 10.0.26200 with Node 24.18.0 observed both active handles after termination was requested, then signalled handles, then error 87 after the last retained handles closed. The fresh observer reopened each signalled process while the original handles remained open. All 80 post-close target lookups returned error 87; PID zero also returned 87, while PID four returned access denied. No proposed termination observation contradicted an unsignalled original handle. All eight target handles and four observer handles subsequently signalled before cleanup. The raw reports are `.audit/probes/windows-recovery-witness/observation.json` and `wrapper.json`.

For this private component, select the same fixed `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, positivePid)` call used by the pinned .NET branch. A null handle with error 87 supplies `missing`; another open failure supplies `unavailable`. Successful opens bind their actual PID and creation time and use only a process-handle wait for activity. Decode, identity-query, wait or close failures fail the observation. The implementation owns and closes each opened handle in one operation. `WindowsExecution.completion` and the Windows lock-owner guard use this lookup; it introduces no public process API. This is a qualified implementation decision supported by the Microsoft source and these host observations, not a newly documented universal Win32 error guarantee. Windows profiles remain disabled.

## Remaining qualification

The diagnostic supports the selected lookup premise on this host. The product implementation independently passes four trials and 56 request groups, including active, terminated, missing, access-denied, changed-creation and duplicate/mixed ledger cases. All measured handle counts were unchanged. The [acceptance record](windows-writer-recovery-acceptance.md) distinguishes controlled generation comparisons from actual PID recycling and full recovery.

The [retained-ledger integration](windows-ledger-integration-acceptance.md) passes bounded controller-death checks. The complete milestone still requires full engine recovery, read-only command containment, filesystem qualification and real client lifecycle checks. A safe unknown result alone does not complete recovery.

## Transaction integration

`InstallerEngineLive.apply` and `applyRepair` retain the full pending plan while holding installation locks. Their execution callback rewrites that same record. `executeOnce` dispatches Windows execution through the creation-gated service; `executionQuiescent` keeps legacy job-only Windows records pending. The Windows transaction worker owns its locks until the operation ends. The native recipe does not inherit them.

The author's workflow and public Installer interface stay unchanged. The selected integration puts exact writer identities in the existing pending record. A retry must establish completion before inspection and settlement; it must never rerun the recipe. The same rule applies to repair and to another target sharing host state.

The caller already supplies the complete-state retention operation:

```ts
executeOnce(plan, leases, next => saveState(target, { ...pending, execution: next }))
executionQuiescent(target, pending.execution)
```

The private execution variant is `{ type: "windows_writers", writers: ReadonlyArray<Writer> }`. `executeOnce` adapts the creation-gated service's retention callback into that variant. Its layer remains inside the execution module, so neither the engine nor repair coordinates platform services. `executionQuiescent` accepts only `complete` from the same service's full-ledger observation on Windows. Other platforms cannot validate Windows evidence. Legacy `windows_running` records keep returning false; a job name cannot be upgraded into missing writer identities.

This integration reuses Z1-Z17 for retention and completion. It changes the record representation and connects existing behavior; it adds no new completion policy or proof obligations. Pure record-boundary conformance passed before execution I/O changed. Native checks use actual `executeOnce`, retained full records, production locks and a separate recovering process. A no-op repair plan exercises the original recipe without claiming a qualified Windows client. Controlled recipe fixtures are identified separately in the [acceptance record](windows-ledger-integration-acceptance.md).

| Shape | Consequence | Decision |
| --- | --- | --- |
| Store the ledger beside the transaction and retain a pointer | Every acknowledgement depends on two files and their publication order. Recovery must distinguish mismatched generations and collect obsolete ledgers. | Reject. It adds another authoritative record and crash boundary. |
| Extend the existing pending execution witness | The engine retains the reviewed plan, lifecycle journal and writer identities in one replacement while holding its locks. Native continuation waits for that callback. | Select. It preserves transaction ownership and reuses the existing retention protocol. |

Z17 adds the trace obligation needed for this integration: after any finite sequence of gate signals, every identity that received a resume action is still in the final ledger. A crash during another birth or failed retention cannot erase a previously authorized writer. This property concerns the protocol; native acceptance must establish actual retention and creation gates.

Transaction storage uses writable Windows directory handles and canonicalizes the first-created path before walking parents. The [ordinary storage checks](windows-transaction-storage-acceptance.md) pass on the isolated NTFS host. A later interrupted-write check captures a partial production metadata write and preserves a fresh owner's replacement after controller completion. Other metadata boundaries remain open; recipe-process waits alone do not establish controller completion. These are storage and lock-lifetime obligations for the integration, not new public configuration.

### Lock owners

The file lock serializes cooperating controllers. Its availability alone does not establish that a former owner's outstanding I/O has finished. Before modifying transaction metadata, a Windows lock owner must publish its exact process identity. A later controller must establish completion for every foreign recorded owner before admitting protected work.

| Shape | Controller-death behavior | Decision |
| --- | --- | --- |
| Store a single current-owner record | A late publication from the old process could replace the next owner's record. | Reject. The ownership record itself needs protection against late writes. |
| Publish a separate record for each process identity | Late publication can affect only that process's record. Another owner's record remains independent. | Select. Use `owners/<pid>-<creation>.json` under each installation lock directory. |

After acquiring the file lock, read the published records strictly and bind each body to its filename. Observe each owner using the existing process-object lookup. Z18-Z20 require complete evidence for every foreign identity; Z21-Z22 exempt only the exact current process. Windows operation workers accept one operation, and their scoped I/O must finish before releasing a lock. This exemption does not authorize concurrent operations in the same worker.

When foreign owners are complete, durably publish the current process's record before cleaning old records or returning the lock to the caller. Keep that record until the protected work and its outstanding I/O have finished. Remove it and flush the owners directory before closing the file lock. A killed controller leaves its record for a fresh process to check. Unknown or active foreign owners fail acquisition; the caller may retry after completion.

Creating missing storage directories and opening an existing lock without truncation precede publication. A process killed during initial publication has not been admitted to protected work; its late write can only create its own record. Unpublished atomic-write temporary files cannot authorize protected work and may be ignored. Other unexpected entries, malformed records, missing records during the scan and mismatched filenames fail acquisition. Completed records are cleaned only after the current owner is published. The Linux lock path remains unchanged.

The 22 writer proofs pass the scoped exact-type and axiom audit. Pure TypeScript conformance passes before this I/O change: 19 independent prior-owner vectors, 14,135 generated comparisons and 3,186 malformed-wire requests supplement the existing writer checks. The [native owner checks](windows-lock-owner-acceptance.md) pass nine case groups, including ordinary publication/cleanup, refusal while a foreign owner is live or unknown, and a fresh retry after forced controller termination. A later [ledger check](windows-ledger-integration-acceptance.md) interrupts an outstanding production metadata write. The [publication qualification](windows-owner-publication-acceptance.md) passes nine termination boundaries and separate-process recoveries without changing product code. Other metadata boundaries remain open.

### Directory-flush boundary

The exact helper failed five of seven isolated Windows storage checks. Its directory `fsync` returned `EPERM`; atomic replacement left the expected record visible before that failure. File flushing and ordinary record reads passed. A native comparison then opened the same owned directory with writable access: `FlushFileBuffers` succeeded, while a read-only handle returned access denied. Node's directory `sync()` likewise succeeded with `O_RDWR` and `O_WRONLY` and failed with `O_RDONLY`. These observations match the documented [writable-handle requirement](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers). The docs do not explicitly qualify every directory-handle use; the native results apply to this NTFS host.

| Candidate | Interface and result | Decision |
| --- | --- | --- |
| Ignore the Windows directory-flush error | The helper could acknowledge visible bytes without a successful flush. | Reject. It removes the retention barrier. |
| Open the directory with writable access through Node | Keep `syncDirectory(path): Promise<void>`, file flushing, replacement and close behavior. Change only the Windows access request. | Select. Both native and Node controls support it, and callers keep the same durability operation. |
| Add a dedicated Win32 directory-flush module | Bind directory handles, attribute checks, flushes and close operations through Koffi. | Unnecessary for this failure. Node can perform the required operation on the qualified host. |

The selected implementation uses `O_RDWR` on Windows and preserves `O_RDONLY` elsewhere. A flush or close failure still fails retention. The same seven storage checks pass against the product implementation after both fixes. This does not qualify Windows path containment, filesystem publication or controller-death recovery.

The writable-handle change exposed another representation mismatch. On this host, recursive `mkdir` returns its first-created path with the Windows namespace prefix, while `realpath` and parent traversal use the ordinary drive path. Comparing those strings made the flush walk miss its stopping directory and continue toward the volume root. Canonicalize the returned created path before deriving the stop. Keep the existing canonical-path and symbolic-link check on the requested directory. The diagnostic records the raw and canonical paths without flushing ancestors.

Z17, independent trace conformance and the ordinary storage checks pass. The retained witness is connected, with six execution/recovery case groups covering creation, retention, continuation and a partial metadata write. A fresh process loads the unchanged full record and checks completion under the production lock. Full engine inspection and settlement still need acceptance.

- [x] Ground: trace transaction ownership and distinguish API documentation from implementation evidence.
- [x] Sketch: compare complete alternatives and select direct process-object lookup for qualification.
- [x] Agree: the active milestone instruction authorizes continued implementation.
- [x] Prove: add Z11-Z16, strict wire and TypeScript conformance.
- [x] Prove integration: establish Z17 and TypeScript trace conformance.
- [x] Qualify storage operations: correct Windows directory access and canonicalize the flush boundary.
- [x] Implement: qualify the private native completion operation on the isolated Windows host.
- [x] Integrate: connect the retained ledger and qualify the bounded controller-death cases.
- [ ] Complete recovery: qualify full engine settlement and the remaining native obligations.
- [ ] Scrap: revise the selected shape if the native observations contradict it.
