# Windows controller publication

## Outcome and current flow

A terminated controller must not let an old owner-file write replace a new controller's identity. The author's build, preview, and publish workflow stays unchanged. This qualification checks the existing installation lock before enabling Windows profiles.

`installationLock` acquires the file lock, then `retainLockOwner` reads and validates prior records. The proved prior-owner decision requires foreign owners to be complete. The function writes `owners/<pid>-<creation>.json` durably before returning the lock. Protected code runs after that return. Scope release removes the current record and flushes its directory before closing the file lock.

`writeJsonAtomically` creates a unique temporary file, writes and flushes it, closes it, renames it, and flushes the parent directory. An initial publication can therefore leave no file, an unpublished temporary file, or a published owner record. Temporary files do not admit work. A published record binds its complete body to its filename. These rules come from the existing [owner design](windows-writer-recovery-design.md#lock-owners) and [owner acceptance](windows-lock-owner-acceptance.md).

The earlier checks terminate controllers after publication. They do not interrupt the publication sequence itself. The [host integration](windows-host-integration-acceptance.md) qualifies real client command paths but leaves this runtime obligation open.

## Alternatives and synthesis

| Shape | Consequence | Decision |
| --- | --- | --- |
| Add publication callbacks or a phase service to production storage | Every lock caller gains testing machinery. The callbacks expose ordering that the storage module already owns. | Reject. There is no new domain policy to justify that API. |
| Run the real storage functions in disposable workers and observe filesystem boundaries | A worker can pause before or after actual file operations without changing product source. The parent can terminate it and recover through the same lock implementation. | Select. Qualification remains outside the production interface. |

The selected harness wraps Node's filesystem promise functions before importing product modules. `syncBuiltinESMExports` updates the builtin named exports. A local control verifies that this method replaces and restores the same export used by an importer. Each worker validates its settings and owned stage before installing the wrappers. [Node builtin export synchronization](https://nodejs.org/api/module.html#modulesyncbuiltinesmexports).

The parent opens an independent query, synchronization, and termination handle for each worker. It compares PID and creation time and observes the live process before termination. The original handle stays open through a fresh recovery process and must signal before closure. `TerminateProcess` initiates termination asynchronously, so its return value alone is not completion evidence. [Windows termination contract](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess).

## Boundary checks

The worker settings select one boundary. Publication workers stop at that boundary. Recovery workers run the ordinary lock acquisition, write controlled metadata, and hold the scope until the parent releases them.

| Boundary | Required snapshot before termination |
| --- | --- |
| Before temporary open | No current owner file or publication temporary exists. Protected metadata is unchanged. |
| After temporary open | An empty temporary file exists. No current owner file exists. |
| Partial temporary write | A controlled prefix exists only in the temporary file. No current owner file exists. |
| After temporary write | Complete temporary bytes exist before file flush. No current owner file exists. |
| After temporary flush | Complete temporary bytes exist after the file flush. No current owner file exists. |
| Before rename | The flushed temporary has closed. No current owner file exists. |
| After rename | The exact owner record exists before the parent-directory flush. Protected work has not run. |
| After owner-directory flush | The exact owner record exists after a successful directory flush. Protected work has not run. |
| Protected callback | The exact owner record and controlled protected metadata exist while the scope holds its lock. |

Every case terminates the publication worker, waits for its exact process, and starts a separate recovery worker. Recovery must publish its own identity, remove completed foreign records, preserve ignored temporary bytes, and update the controlled metadata. The original process handle remains held while those facts are checked. Ordinary scope release must then remove the recovery record and close its process.

The partial-write case deliberately splits the harness's underlying write. The other boundaries surround real Node operations. These checks qualify process termination at observable boundaries. They do not simulate machine power loss or arbitrary driver latency.

## LDD and acceptance

This work reuses the existing Z1-Z22 writer contracts and adds no new pure policy. Scoped Lean certificate checks and TypeScript conformance precede native qualification. Product sources remain unchanged unless a native counterexample disproves the implementation.

- [x] Ground the lock, owner decision, atomic writer, and prior native evidence.
- [x] Compare complete test-interface alternatives and select external observation.
- [x] Proceed under the active milestone authorization.
- [x] Verify scoped proofs and pure conformance before native work: 22 certificate checks and nineteen focused tests pass.
- [x] Qualify initial publication boundaries and separate-process recovery: all nine cases and eighteen independent process waits pass. See [acceptance](windows-owner-publication-acceptance.md).
- [x] Reassess the design against native evidence: the observed boundaries require no product change. Other metadata and filesystem boundaries remain separate obligations.

Full engine settlement, separate debug chains, remaining filesystem obligations, executable identity, and complete SDK client lifecycle remain separate qualification work. Windows profiles remain disabled. No macOS host is available.
