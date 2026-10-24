# Installer transaction worker

Authors still call `Installer.plan(request)` and `Installer.apply(reviewed)`. The platform layer chooses where the operation runs. No worker, lock or process options enter the author definition.

The existing Installer resolves the physical target, acquires home/project locks, checks retained state, applies the lifecycle decision and settles under those locks. Linux passes open-file-description locks to its executor. Windows `LockFileEx` cannot transfer that ownership. The [Windows design](windows-design.md) therefore assigns the entire transaction to a stable worker, with a separate executor inside an owned job.

Admitting an IPC request starts an Installer operation. The existing lifecycle and repair models remain the mutation authority.

## Candidates and selection

| Candidate | Ownership and interface | Decision |
| --- | --- | --- |
| Implement Windows plan/apply inside a new worker | Duplicate orchestration, locking, review and recovery code. | Reject. Lifecycle integration and physical validation would have two owners. |
| Reuse one Installer engine behind a private worker transport | Move the existing implementation intact into an engine layer. A worker supplies Node services to that engine. The caller sends one snapshotted request and receives the existing typed result. | Select. The engine retains all review and transaction rules. Transport owns IPC lifetime and wire validation. |

## Module sketch

- `engine.ts`: the existing Installer layer, executing in the process that acquires the locks.
- `worker-protocol.ts`: private versioned request/reply codecs, captured bytes and typed failures.
- `worker-client.ts`: one child exchange per call. Interruption disconnects and releases the caller's process reference.
- `worker-server.ts`: an Effect requiring Installer, with strict one-request admission and response encoding.
- `transaction-worker.ts`: the Node entry point supplying the engine and Node services. It imports the engine directly to avoid recursive transport.
- `index.ts`: the public layer, selecting the worker on Windows and the direct engine elsewhere.

`NodeRuntime.runMain` keeps accepted work alive until its Effect completes, including after caller disconnect. The worker replies after the engine's scoped finalizers finish. A caller that loses the reply retries through the retained lifecycle; transport never replays a recipe itself.

## Admission contract and acceptance

[`Worker.ts`](../../contracts/Worker.ts) defines waiting, accepted and stopped states. A first valid request starts work. Malformed input or disconnect while waiting stops it. Accepted and stopped workers ignore later signals. O1-O4 prove exact admission, exact stopping, preservation of accepted work and impossibility of another start. Their [Lean certificates](../../spec/PluginSdk/Installer/Worker/Proofs.lean), exhaustive nine-case [vectors](../../spec/vectors/worker.ndjson) and [TypeScript conformance](../../test/worker.test.ts) pass before transport implementation.

[Transport acceptance](worker-acceptance.md) passes strict decoding, byte/error round trips, duplicate requests, early disconnect and retained work after disconnect or actual caller death. Windows and Linux both establish worker-owned lock contention and release. A Windows installation profile still requires filesystem support, all native invocations contained in jobs, retained execution witnesses and full client lifecycle acceptance.

- [x] Ground and trace locking, authorization and recovery.
- [x] Compare ownership designs and select a shared engine.
- [x] Proceed under the active milestone instruction.
- [x] Implement and accept transport and stable-worker ownership.
- [ ] Revisit the shape if native ownership contradicts it.
