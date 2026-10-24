# Managed record storage on Windows

Catalog and Distribution need native Windows storage before their real Cursor lifecycle can be qualified. Both currently reject non-Linux storage. Their JSON schemas, release provenance, review identities and progress rules remain owned by their existing modules.

## Caller and behavior

Managers keep the same `ReleaseCatalog.initialize/admit/import/acquire` and `Distribution.plan/apply` interfaces. They supply physical store directories under existing physical parents. Opening an existing corrupt or incomplete store fails. It never initializes an empty replacement. Only a directory created by the current initialization permits its first record to be written.

Every writer holds the record directory's file lock. On Windows, it also retains its exact PID and process creation time before domain record mutation. A later owner must establish termination of every different retained owner. Active or unavailable evidence rejects admission. Only the exact current owner is exempt. Strict filename and schema checks prevent another process identity from being substituted.

The OS file lock is insufficient evidence of prior-process completion. Windows can release locks when a process closes the file or terminates. The [LockFileEx documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex) documents this distinction. The process observation obtains creation time from the same retained process handle using [GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes). The existing Installer owner guard already supplies this policy and its native observations.

Canonical JSON replacement retains the existing sequence: exclusive temporary file, complete write, file flush, rename and parent-directory flush. Errors stay errors, including a flush failure after publication. This does not claim power-loss recovery or atomic compare-and-swap against arbitrary external writers. Store parents are privately managed and stable. Existing physical-path checks reject links but do not prove race-free traversal under hostile directory replacement.

## Traced ownership

`ReleaseCatalogLive` captures an admission, takes the store lock, reads and validates the retained catalog, and applies its registration model before a synced replacement. Acquisition takes the same lock and validates the complete retained release and bundle set.

`DistributionLive.apply` snapshots the reviewed plan, takes the state-store lock, validates any retained plan and outcomes, and records pending progress before invoking Installer. It saves after each independent destination outcome. Its lock must remain held through those asynchronous child operations and all finalizers.

`Installer.installationLock` already retains Windows lock owners and uses the creation-time-aware writer model. The storage mechanism is shared knowledge. An installation key is not a catalog or rollout identity, so managers must not fabricate one to reuse the implementation.

The current initialization order can make a concurrent reader encounter a newly created directory before its first record exists. That reader fails closed. Source tracing does not establish the initially suspected overwrite race between SDK initializers. Preserve that rejection behavior.

## Alternatives and synthesis decision

| Candidate | Ownership and consequence | Decision |
| --- | --- | --- |
| Add Windows branches independently to Catalog and Distribution | Duplicates physical-directory, file-lock and process-owner decisions. Reusing Installer through a synthetic installation key would couple unrelated identities. | Reject. |
| Share record storage and process observation internally | One implementation owns physical record access, scoped locking and retained Windows owner admission. Domain modules keep their schemas and validation. Installer uses the same mechanism. | Select. |
| Replace the stores with a new remote catalog service | Could fit organization infrastructure later, but changes transport and deployment requirements before native manager callers can use today's interfaces. | Defer. |

The selected shape exposes no new public module or provider framework. It removes the duplicated lock paths. Shared process policy moves to `src/internal/process/model.ts`; native process observation lives beside it. Record files and locks live under `src/internal/records`. Feature directories gain no forwarding barrels.

The internal operations are `createRecordDirectory(directory)`, `readRecordBytes(directory, name)`, `writeRecordJson(directory, name, value)` and scoped `recordLock(directory)`. Domain adapters map storage failures to their existing typed errors. The returned lock handle remains available for Installer's inherited file-descriptor leases.

## LDD obligations and acceptance

This extraction changes no pure decision, wire schema or Lean model. Reuse the existing properties rather than introduce duplicate propositions.

| Required behavior | Existing checked contract | Production path |
| --- | --- | --- |
| Completion requires exact terminated evidence; activity and unknown evidence remain distinct | Writers Z6–Z8 | Shared `writerCompletion` |
| Observations remain bound to PID and creation time; reused PIDs do not identify a prior owner | Writers Z11–Z16 | Shared `observeWriter` and native lookup |
| Prior-owner admission requires complete evidence for all different owners | Writers Z18–Z20 | Shared record-lock owner guard |
| Only the exact current process identity is exempt | Writers Z21–Z22 | Shared `priorOwnerCompletion` |
| Native writer retention and completion preserve existing behavior | Writers Z1–Z5, Z9–Z10, Z17 | Existing execution callers after import rebasing |

Check the exact proposition types and transitive axioms in the current Lean build. Move the pure implementation without logic changes, then finish its authored and generated TypeScript oracle comparisons before changing I/O. Formal TypeScript refinement remains open.

Scoped source acceptance includes Catalog admission/acquisition, malformed and linked store rejection, concurrent admission, Distribution progress/replay and existing installation-lock behavior. Main reviews the extracted implementation and verifies the checks. Native qualification separately requires isolated Windows file/lock/owner cases and a real Catalog → Distribution → Installer multi-generation lifecycle with truthful release provenance. Linux tests and old Installer receipts cannot qualify those manager callers.

## Delivery state

The shared pure implementation passes twelve oracle-conformance tests after the extraction. All 22 existing property certificates pass a focused current Lean build, exact-type check and transitive axiom audit. The I/O integration passes 29 scoped runtime tests. Fifteen Catalog and Distribution tests also pass after the final regular-file admission check. Scoped TypeScript, lint and Effect diagnostics pass. The source receipts are under `.audit/probes/managed-windows-storage`.

Windows storage is integrated in source. Fresh native component qualification and the real manager lifecycle remain pending. The timed-out routed-preview candidate and all twenty protected native roots remain unchanged. CI, package-consumer, release-wide checks and publication remain deferred.

The fresh compiled CLI passes seven Linux Catalog commands with the real frozen lstack packages: packing, loopback artifact import, unchanged replay, acquisition of both formats and reopening. All 316 package files agree and the catalog bytes survive replay. The first qualification build failed because its bundled Undici chunk exposed only a default export to a caller that required `Agent`. A separate corrected build leaves pinned Undici8.12.3 external and binds its complete package. Both the failure and the passing workflow remain retained. This packaging correction changes no production storage policy.
