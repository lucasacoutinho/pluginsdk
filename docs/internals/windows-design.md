# Windows runtime design

Windows support must preserve the same author workflow: one definition, `pluginsdk build`, local `preview`, and `publish` to the configured destination. The existing `Compiler.build` and `Installer.plan/apply` interfaces remain the caller's interface. Worker ownership is selected. The job-name-only recovery draft was rejected after a native counterexample; the [replacement design](windows-recovery-design.md) records the next contract. No Windows installation profile is qualified.

The [project-file component](project-file-acceptance.md) now preserves native DACLs and admitted attributes through configuration replacement. Seven Lean properties and TypeScript conformance passed before the platform backends changed. The isolated Windows probe passes creation, replacement, protected-DACL preservation and refusals for stale edits, read-only files and extra streams. This removes the measured Linux-only file-reader barrier. The subsequent [Codex project pilot](windows-activation-acceptance.md#codex-project-scope) passes the normal v2 lifecycle, replay and A/B discovery. Interruption recovery, remaining feature formats and packaged CLI qualification remain open; production Windows profiles stay disabled.

## Grounding

The current runtime qualifies Linux only. [`capture`](../../src/compiler/source/capture.ts) binds reads to opened descriptors through `/proc/self/fd`. [`storage`](../../src/internal/storage.ts) syncs files, renames them and syncs their directories. [`Installer.apply`](../../src/installer/lifecycle/engine.ts) acquires locks, saves a pending record and hands the locks to [`native-worker`](../../src/installer/execution/native-worker.ts). [`execution`](../../src/installer/execution/execute.ts) requires the child's entire process group to be gone before settlement. Repair uses the same handoff and quiescence rule.

That structure protects a concrete case: a caller dies while a native command can still change client state. The live worker retains the Linux open-file-description lock. A fresh SDK writer cannot overlap it. Once the worker's process group is gone, recovery inspects the complete installation and settles the retained operation without repeating its native recipe. See [native execution](runtime.md) and lifecycle properties P7-P9 and P13.

The Windows backend of `fs-native-extensions@1.5.1` uses `LockFileEx`. Its ownership differs from Linux's `F_OFD_SETLK`: an inherited handle does not transfer the parent's lock, and process termination releases that process's locks. Reusing the Linux handoff would therefore lose serialization. [Microsoft documents the lock ownership rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex).

The available host is Windows NT 10.0.26200.0. An isolated, checksum-verified Node 24.18.0 runs there. Cursor IDE metadata reports 3.0.16. The available Windows Codex executable reports `0.163.0-alpha.10.2`; it is a different qualification target from Linux Codex 0.163.0. Version discovery alone grants no profile.

## Candidates

| Candidate | Ownership and interface | Assessment |
| --- | --- | --- |
| Add Windows replacements for each Linux primitive | Keep caller-owned locks and the existing parent-to-worker handoff. Replace `/proc`, process groups, modes and directory sync at their call sites. | Reject. The lock handoff itself is invalid on Windows. Reacquiring after releasing the caller's lock leaves another writer able to enter. Additional reservation and takeover states would spread one ownership rule across the caller, worker and recovery. |
| Make the operation worker own the Windows installation transaction | The worker resolves the target, acquires every required lock, validates the review, retains pending state, executes and observes. Its platform implementation owns descendant tracking and file operations. The caller sends one request and receives the existing result. | Select for the execution design. Lock ownership stays with the process that can mutate client state. Platform details remain inside Installer. File identity, publication durability and executable semantics still need their own qualification before implementation. |

The selected module owns the full invariant. It does not expose `acquire`, `release`, `spawn` and `takeOver` methods for callers to coordinate. It also avoids a second Windows lifecycle model: `decide`, `begin`, `settle` and reviewed repair remain authoritative.

## Selected execution shape

The private worker request contains the already snapshotted reviewed plan. Its response contains the existing apply outcome or a typed failure. IPC schemas are private implementation contracts, rather than additional author configuration. The implementation must use strict Effect Schema decoding, exhaustive `Match`, scoped resources and named Effects.

1. A fresh worker waits for a valid request. Disconnect before receipt permits no native mutation.
2. The worker establishes a process domain before starting any native command. It acquires the home lock and, where required, the project lock in the existing order.
3. Under those locks, it re-resolves the physical target, validates the exact client/profile and review, and loads retained state. Parent-side checks cannot substitute for these checks.
4. Before the first native mutation, it durably retains the full plan, pending journal and a witness for that process domain. It then executes the authorized recipe once.
5. After authorization, caller disconnect does not release the worker's locks or authorize another recipe. A retry of a pending plan performs inspection and settlement only.
6. Recovery requires evidence that no member of the retained process domain can still commit. Worker PID exit alone is insufficient.

A Windows Job Object provides containment. Use a unique `Global\pluginsdk-` name with 256 random bits, a non-inheritable job handle, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and no breakaway flags. A `Local\` name resolves within the observer's login session and cannot identify a retained job across sessions. The wire therefore rejects local names. Microsoft documents the [global and session namespaces](https://learn.microsoft.com/en-us/windows/win32/termserv/kernel-object-namespaces).

Job membership must precede permission to spawn native children. Neither a missing exact job nor zero active members establishes process termination. In two native probes, both facts occurred while a held handle for a verified member remained unsignalled. Those observations now classify as unknown. Temporary inspector handles must still be closed, since extra handles affect last-handle termination. [The counterexample](windows-recovery-design.md#counterexample) records the measurements and the resulting model correction.

The operation worker owns the locks and job handle **outside** that job. Caller disconnect leaves the operation worker running. Its death initiates job termination, but recovery still needs a complete record of the processes permitted to write and evidence that each has finished. The rejected draft assigned a gated executor, retained only the job name and waited for job absence. That runtime and its bootstrap protocol were removed from the product source. Read-only host invocations also need containment before Windows qualification.

The premise probe gates a cooperative Node child on stdin before it spawns a grandchild. Successful assignment followed by that signal tests membership and last-handle termination. It does not qualify assigning an arbitrary already-running native command after launch. Production must assign the gated executor before sending its recipe, or create a native child suspended and assign it before resuming.

## Native binding

Two implementations were considered for the required Windows calls. A dedicated C++ addon would keep a small native interface but introduce a separate compiler and binary distribution for this SDK. A pinned FFI binding can call the same OS functions from Node and keep platform ownership in TypeScript. The first implementation uses Koffi 3.3.3. Its main and Windows x64 registry archives passed their SHA-512 integrity checks. Koffi is MIT licensed and supplies separate platform prebuilds.

[`WindowsJobsLive`](../../src/installer/windows/process/jobs.ts) loads the binding only after checking Windows x64. It validates native return values as `unknown` through Effect schemas and captures `GetLastError` immediately after each synchronous call. Only a null handle with actual error 2 for the exact job name becomes absent. Other failures remain typed errors. Owned jobs, query handles and process handles use scoped release. Closed capabilities reject further queries and assignments. Name collisions fail before configuration. Native acceptance covers 22 checks on Node 24.18.0; see [job component acceptance](windows-jobs-acceptance.md). The [pinned source](https://github.com/Koromix/koffi) and [binding documentation](https://koffi.dev/load) remain the authority for marshaling behavior.

Existing Linux pending records must remain readable and retain their original execution interpretation. A Windows witness must have a distinct tagged representation. Do not reinterpret a Linux PID/boot pair as a Windows job name or migrate a pending operation between platforms.

## Filesystem obligations

These obligations are required before adding a Windows row to the profile table:

- Bind captured and inspected bytes to the opened file's physical identity and final path. `realpath` before `open` alone does not establish that binding. The candidate native primitives are [final path by handle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew) and [file information by handle](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex).
- Reject escapes through both path separators, other volumes, junctions and reparse points. Establish the comparison rules for case-sensitive directories and path aliases. The current `../` predicate must not be reused unchanged on Windows.
- Reject package paths that alias another file or have Windows device, alternate-stream or filename semantics. An authored package path is not automatically a safe Windows materialization path.
- Preserve executable intent without treating Windows `chmod(0755)` as evidence of a Unix executable bit. The selected [contract](executable-intent-design.md) binds retained artifact intent to observed paths and bytes. Its [native file component](windows-executable-intent-acceptance.md) qualifies both Boolean values. [Production inspection](windows-production-read-acceptance.md), [source capture](windows-source-capture-acceptance.md) and [materialization](windows-materialization-acceptance.md) now consume that contract.
- Retain exact physical identities. The native probe returned inode values larger than JavaScript's safe integer range; converting a rounded `number` to a string cannot recover the file identity. Use bigint statistics or the native volume/file ID.
- Preserve the retained-record ordering and atomic activation contract. A failed directory sync is not success. [Write-through moves](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) are a candidate to investigate, not an established substitute for Linux rename plus directory sync.
- Qualify sharing violations, antivirus interference, open destination files and interrupted replacement as observable outcomes. Do not erase a pending journal after an ambiguous write.

The [staged-file checks](windows-file-staging-acceptance.md) resolve one write/flush premise: exclusive creation, writing and flushing now use the same writable file handle. Eleven checks pass on each of Windows and Linux, including collision refusal and propagated flush failure. This does not discharge the containment, identity, executable and activation obligations above.

The [opened-file observation bridge](windows-file-observation-acceptance.md) passes seven native cases through Node's existing file descriptor. A named-stream counterexample shows why file identity alone cannot bind bytes. The [pure read-admission contract](file-read-acceptance.md) checks supplied observations. The [native-owned reader qualification](windows-file-read-acceptance.md) adds 17 native groups, repeated with release controls, and twelve comparisons against TypeScript and Lean. Native ownership is selected for complete reads. Pre-open package-path materialization, remaining source-link coverage and root-session integration remain prerequisites to integration.

The [lexical path contract](windows-package-path-acceptance.md) proves pre-open syntax, device and UTF-16 capacity admission with conforming TypeScript. The [native filename component](windows-filename-acceptance.md) qualifies eleven groups and 190 recorded-path comparisons. An ancestor-alias counterexample requires exact component and complete-tree observations before publication: `Tools/a.bin` and `tools/b.bin` can both be created under the stored `Tools` directory. Complete source-link coverage, complete-path budgets and integrated materialization remain open.

The [rooted-tree admission contract](tree-read-acceptance.md) adds thirteen proved properties, 93 authored cases and 7,944 generated comparisons. It checks exact entry binding, source/payload reparse policy, ancestor cycles and complete directory visits. The [native traversal component](windows-tree-read-acceptance.md) supplies those observations through retained directory/file handles for ordinary files and junctions. Twenty behavior cases and 310 TypeScript/Lean frames pass, with all 133 native file handles released. Windows symbolic-link creation is denied with error 1314 and remains unqualified. Full source-link coverage, root-session integration, complete-path budgets, materialization and production integration remain open.

## LDD sequence and acceptance

The [executable-intent contract](executable-intent-acceptance.md) preserves stable POSIX intent, supports exact source declarations and restores either retained Boolean only after payload binding. An unrepresented native bit is distinct from an unavailable observation. The [Linux integration](executable-intent-integration-acceptance.md) adds the public `executables` field, shared payload comparison and permission-preserving staging. Twenty certificates and 4,307 oracle comparisons pass before I/O integration; native Linux checks cover both intent values and five umasks.

The [Windows file component](windows-executable-intent-acceptance.md) passes nine cases and 44 recorded TypeScript/Lean frames over two SDK-built bundles. It preserves both flags after exact native path/read admission and rejects changed bytes, renamed paths and forged metadata. All 42 native file handles close; the accepted process-handle baseline is restored. Its duplicate-type counterexample requires shared immutable ABI binding and separate root ownership.

The [root-session component](windows-root-session-acceptance.md) qualifies that separation across sequential, overlapping and same-directory owners. Ten cases and 136 TypeScript/Lean frames pass across 37 successful owners, with all 74 acquired handles released and unchanged process counts. A reconstruction check preserves the original read/decoding/ownership implementation while moving anonymous ABI structures and frozen offsets into one lazy binding. Production scopes must hide raw acquisition after release. Complete-path budgets, source symbolic-link coverage, materialization and full reader integration remain open; Windows profiles stay disabled.

The [complete-name capacity investigation](windows-path-capacity-design.md) distinguishes requested-name creation, expanded NT normalization and final-name output buffers. Creation succeeds at 32,766 units while an expanded normalized name can fail with error 161; another final-name result reaches 32,792 units. The [accepted pure operation](windows-path-capacity-acceptance.md) takes the tightest capacity across all required native views and their own limits. Five new certificates and the strict wire and TypeScript checks pass. The [native boundary](windows-capacity-owner-acceptance.md) now derives those inputs from retained roots and enforces capacity before opening: eleven cases and 35 model frames pass, including the exact limit and pre-open overflow refusal.

The [production payload reader](windows-production-read-acceptance.md) now applies those operations inside a private Effect scope. It hides handles, requires an ordinary NTFS root, refreshes native capacity before each opening and consumes the accepted entry, directory and stable-read models. Sixteen native cases preserve captured bytes and retained executable intent, reject junctions and concurrent changes, and traverse the complete-path boundary. Independent decoding and handle cleanup pass.

The [compiler source reader](windows-source-capture-acceptance.md) reuses that native ownership beneath one shared capture pipeline. Eighteen Windows cases and 32 Linux regressions pass. One definition produces exact 11-file Claude and Codex bundles on both hosts. Source selection covers contained junctions, parent admission, escapes, cycles, source reuse, concurrent changes and the complete-path boundary. All 179 instrumented production handles close and process counts return to 202. File and directory symbolic-link fixture creation both fail with error 1314, leaving those traversal kinds unqualified.

[Bundle materialization](windows-materialization-acceptance.md) retains all destination ancestors, admits complete paths before creation and captures the output before publication. Twenty Windows cases, 27 Linux regressions and four native Linux lifecycles pass. Both client bundles preserve all 22 files and their retained executable flags. Alias, junction, collision, write and flush refusals pass. All 582 instrumented handles close, and each case restores the 202 process baseline after standard-stream initialization. Activation, engine settlement and complete client lifecycle remain open; Windows profiles stay disabled.

The existing lifecycle and repair proofs assume trustworthy observations and serialization. They do not prove a Windows syscall implementation. Before runtime edits, add the process-domain contract, its Lean model and proof certificates, independent vectors, strict wire and conforming TypeScript. Its obligations are:

- One authorized operation retains one process-domain witness; retries cannot create a new execution for it.
- The worker owns all required locks before retaining authorization and throughout native mutation.
- Every native command belongs to the process domain. Native mutation additionally requires the retained pending witness.
- Settlement requires complete, bound completion evidence. Job accounting and name absence alone do not supply it.
- Caller death does not authorize overlap; worker death cannot leave an untracked writer.
- Cross-platform or differently bound evidence cannot establish quiescence.

The first pure contract is [`Execution.ts`](../../contracts/Execution.ts), with its [Lean types](../../spec/PluginSdk/Installer/Execution/Types.lean) and [TypeScript model](../../src/installer/execution/model.ts). `executionDomainStatus(input)` classifies a retained domain against one observation. A process group is identified by its positive 32-bit ID and boot identity; a Windows job has a distinct, branded name. A boot observation from a different boot proves a prior process group quiescent. A group observation requires the exact ID and boot. An active job observation requires the exact name. Empty and absent jobs return unknown, as do mismatched and cross-platform observations. A matching boot alone does not prove activity or quiescence.

The Lean obligations are I1, quiescence exactly matches this bound evidence; I2, activity exactly matches a present matching group or active matching job; I3, every remaining observation is unknown; and I4, job accounting never proves completion. These laws classify supplied evidence. Acquiring truthful OS evidence and retaining it before mutation remain native implementation obligations.

The corrected I1-I4, strict wire and TypeScript conformance pass. [Premise acceptance](windows-premises.md) and [job component acceptance](windows-jobs-acceptance.md) record their separate checks, including the rejected premise. The [transaction-worker transport](worker-acceptance.md) reuses the Installer engine and previously passed 15 checks on Windows and Linux, including process-owned lock lifetime after caller death. A complete writer record, fresh-process recovery observation, read-only command containment and Windows filesystem operations still need implementation and acceptance.

Then implement the platform operations and run isolated Windows lifecycle checks for build, install, replacement, replay, removal, drift, concurrent writers, caller death, worker death and repair. Exact client discovery and a loopback MCP tool call remain separate acceptance checks. Keep all current Windows profiles unavailable until their complete acceptance passes.

## Evidence and status

Local qualification artifacts are under `.audit/probes/windows-qualification/`: source facts, the official Node archive/checksum, isolated runtime inventory and native premise probes. `.audit` is ignored; these artifacts are local evidence rather than files distributed with the SDK. Native observations and their limits are recorded in [Windows premise acceptance](windows-premises.md).

- [x] Ground: trace existing ownership, inspect Windows source/docs and verify the isolated runtime.
- [x] Sketch: compare complete ownership designs and select worker ownership.
- [x] Agree: the active milestone instruction authorizes continued work without another approval.
- [ ] Implement: complete process-domain LDD, filesystem qualification and the native adapter.
- [x] Scrap: reject job-name-only recovery after exact membership probes contradict its completion assumption. Continue with the [replacement sketch](windows-recovery-design.md).
