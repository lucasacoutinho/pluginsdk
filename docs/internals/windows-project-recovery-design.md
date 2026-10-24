# Windows project interruption checks

Seven real Codex project interruption cases are [accepted](windows-project-recovery-acceptance.md), extending the [normal lifecycle](windows-activation-acceptance.md#codex-project-scope). Windows production profiles remain disabled. The public interface is unchanged. Qualification found and fixed temporary-directory creation for long Windows installation paths.

## Grounded flow

`InstallerLive` selects `InstallerWorkerLive` on Windows. The caller snapshots and encodes one request, then starts a detached `transaction-worker`. That worker accepts one request before running `InstallerEngineLive`. After admission, caller disconnection does not cancel the accepted operation; it only prevents delivery of its reply.

The engine resolves the physical target, acquires the home and project locks, and validates the reviewed state. Its start branch durably writes a pending journal with `execution: prepared`, calls `executeOnce`, observes the resulting installation, and saves the settled journal. Windows execution retains native process births before resuming those processes. Recovery checks the retained writers and inspects state instead of executing the recipe again.

The transaction worker can also write files itself, including the project configuration and journal. A test must therefore distinguish its process from its native-command writers. Caller death alone is not worker death. Job membership counts and job-name absence do not prove process termination.

The source anchors are `worker-client.ts`, `worker-server.ts`, `engine.ts`, `execution.ts`, `windows-commands.ts`, `storage.ts`, and `project-execute.ts` under `src/installer/`. Existing lifecycle, worker-admission, writer-completion and project-file models remain authoritative. This gate changes no pure model.

## Alternatives

| Shape | Evidence obtained | Decision |
| --- | --- | --- |
| Poll files and race termination against an unmodified operation | Black-box interruption, but the exact cut and complete process identity set can be missed. | Reject for the initial controlled cases. The prior timed-out target remains unqualified because descendant completion was not established. |
| Manufacture a pending journal from a completed installation | Deterministic settlement input without exercising actual pending publication, worker ownership or termination. | Reject as native recovery evidence. It can only exercise supplied model facts. |
| Add deterministic pauses to an isolated source copy and hold independent process witnesses | A known pending boundary, a real operation, exact caller/worker termination and fresh public SDK recovery. | Select. Instrumentation is explicit and independently reversible to the accepted source bytes. |

## Selected usage and module boundaries

The author continues to use `Installer.plan` and `Installer.apply`. The maintainer runs a private harness:

```text
qualify.py stage EXPECTED_ACCEPTANCE_SHA256
qualify.py run before-install
qualify.py run after-install
qualify.py run before-replace
qualify.py run after-replace
qualify.py run before-remove
qualify.py run after-remove
qualify.py run worker-survives-after-install
qualify.py cleanup
```

One immutable staged runtime serves serial cases. Each case has its own home, projects A/B, source, process environment and control artifacts. A new case cannot change an earlier case's workspace. Each case runs in a fresh bounded outer job. Failure with unknown completion prevents another case or cleanup in that stage.

Only the isolated source copy receives three exact overlays: the candidate profile row, two engine pause calls around `executeOnce`, and standard Effect tracing inside `transaction-worker`. Removing those additions must recover the accepted original bytes exactly. Test support files are immutable staged inputs. They do not replace syscalls, observations, installer results or model decisions.

The accepted run additionally stages the temporary-directory correction recorded in `client-cases-v4/io-overlay.json`. That exact correction is promoted to the runtime after all seven cases pass and their scratch is removed. The profile, pause and tracer overlays remain private. Each case needs independent validation before the controller permits the next case.

The private support contracts are:

```ts
type Cut = "before_execution" | "after_execution" | "observe"

beforeExecution(plan: ReadyPlan): Promise<void> // record authorization; pause if armed; record execution entry
afterExecution(plan: ReadyPlan): Promise<void>  // record return; pause if armed

type ProcessWitness = {
  writer: Writer
  image: string
  state: "active" | "terminated"
}

// The controller owns the underlying process handle through termination.
openOwnedProcess(expected: Writer, expectedImage: string): OwnedProcess
OwnedProcess.observe(): ProcessWitness
OwnedProcess.terminate(): void
OwnedProcess.wait(milliseconds: number): "terminated" | "active"
OwnedProcess.close(): void // requires a signalled process
```

`Writer` and plan types come from the existing Effect schemas. The controller validates the process ID, creation time and exact staged Node image before termination. It holds the same handle while requesting termination and waiting for a signalled result. An unavailable observation is not termination. Microsoft documents the asynchronous termination rule in [TerminateProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess), timing identity in [GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes), and signalled process waits in [WaitForSingleObject](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject).

Image and birth identity are admission evidence. Later observations through the owned capability retain that evidence and query the same handle for its signalled state. They do not require fresh image metadata after exit. Microsoft specifies that [process handles remain valid until closed](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers), including after termination. A separate read-only lookup checks creation identity and waits on its newly opened handle; it checks the image only if that process is still active.

The pause publishes its complete checkpoint before a ready marker. It is armed for one exact plan ID and nonce. At the before cut, pending state is durable and execution has not entered. At the after cut, `executeOnce` has returned; the retained process ledger and actual filesystem state still decide whether it completed. The test does not assume that return means successful mutation.

The controller kills the caller, confirms its termination, and checks that the paused worker remains live and both SDK locks remain held. It then either terminates the exact worker or releases it so the worker can settle after caller termination. Fresh recovery uses the public `InstallerLive`; the observer mode records any accidental new execution entry without pausing it.

Worker tracing uses a standard `Tracer` and `NativeSpan`. It records internal caught failures in the worker process, addressing the caller-only trace limit from normal acceptance. Trace collection must preserve the operation and its error propagation.

Armed checkpoints write a closed span snapshot before their ready marker. Exit-only tracing loses the terminated worker's diagnostics. This snapshot exposed the `mkdtemp` path failure before payload preparation; namespace path creation fixes it while canonical parent spelling and ownership checks remain intact.

## Acceptance matrix

| Cut | Required recovery result |
| --- | --- |
| Before execution, install/replace/remove | Complete as `not_applied`, preserve the previously active configuration and payload, and replay the same result without execution. |
| After execution, install/replace | Settle the installed identity and exact new payload, then replay without execution. |
| After execution, remove | Settle removal, retain its journal revision, and replay without execution. |
| Caller dies while worker is paused after install execution | Worker retains both locks, resumes after release, settles despite disconnected IPC, and permits fresh completed replay. |

Every case checks plan commitments, retained pending state, execution-entry counts, exact process witnesses, lock lifetime, completed/replayed journals, protected artifacts, foreign configuration, A/B skill discovery and payload bytes. Any partial or unknown native result remains a failed diagnostic case. Full inventories run only after case writers have completed; the final root inventory and cleanup follow outer-job completion.

No macOS host is available. Grok native tests, third-party authentication, CI and package/release-wide checks remain deferred.

## Process-control premise

The isolated Windows process-control check passed 11 steps. It captured a child birth, refused changed creation and image expectations, admitted the exact process, refused closing its active handle, requested termination, observed a signalled wait on the retained handle, refused use after close, and obtained a fresh signalled observation of the same birth. Independent validation decoded the witnesses with the authoritative schemas and checked writer completion and native path matching with the existing proved models.

The selected support module is `process-control-retained.ts` under `.audit/probes/windows-project-recovery/candidate/`. The older modules remain as failed-attempt inputs. The first attempt produced no boot evidence and remains unqualified. A second attempt failed before spawning a child because Koffi's library method lost its receiver; its failed diagnostic was validated and its scratch removed. A third attempt reached the active-handle checks but failed while querying image metadata during termination checking; its completion remains unknown. The successful attempt records termination and wait results before further diagnostics and retains admission metadata through the handle's lifetime.

The support modules and reversible source overlays pass the scoped patched TypeScript compiler without diagnostics. The caller codec check covers one request and three response cases, including a typed failure. The subsequent native matrix passes 358 recorded steps, with independent schema and process validation for all seven cases. [Acceptance](windows-project-recovery-acceptance.md) records the exact scope, retained evidence and remaining gates.

## Work phases

- [x] Ground the worker, journal and native writer flow.
- [x] Compare complete harness alternatives and select controlled source overlays.
- [x] Proceed under the active milestone instruction.
- [x] Implement and independently review the support modules and overlays.
- [x] Qualify exact process controls before client interruption cases.
- [x] Execute, validate and record each interruption case.
- [x] Revisit the design if a native counterexample contradicts a boundary.
