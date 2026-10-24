# Windows command ownership

## Caller and outcome

Authors keep the existing definition, build, preview and publish commands. The private host module keeps its Claude commands and Codex app-server protocol. A Windows command operation must supply stdin, stdout and exit status while owning creation gates, stderr drainage, cancellation and complete process-handle waits.

The selected end state runs the recipe in the existing transaction controller. That controller already owns the installation locks and publishes its exact process identity before protected work. Each CLI command uses the same command owner. Native children remain in the durable writer ledger; the controller's own file operations remain protected by the existing lock-owner guard.

```ts
// Inside the existing transaction worker, with installation locks held.
yield* withWindowsCommands(plan.target.destination.host, retainWriters, executeChange(plan))

// The host protocol consumes a private channel.
yield* commands.run(request, (channel) => Effect.all([
  channel.output.pipe(Stream.decodeText(), Stream.mkString),
  channel.exitCode
], { concurrency: "unbounded" }))
```

The command callback sees `input`, `endInput`, stdout-only `output`, and `exitCode`. It does not see jobs, debug events or handles. Finishing the callback closes its scope, stops remaining native processes and waits for their retained handles before returning. Codex config inspection can therefore finish after its response without leaving app-server running.

## Current flow and constraints

`InstallerEngineLive.apply` resolves and locks the target, publishes its own lock-owner record, retains the pending plan and calls `executeOnce`. On Windows, `WindowsExecution.run` currently launches `native-worker.ts` as a separate debugged recipe process. That process loads the retained plan and calls `executeChange`; host operations still use the Node spawner. The debugger retains births before continuing them and waits for each exact handle. It currently polls events with a 25 ms wait.

The [lock-owner checks](windows-lock-owner-acceptance.md) establish the controller ownership boundary. The [writer recovery design](windows-recovery-design.md) records why job accounting cannot replace exact process waits. Both native source files are untracked, so Git has no committed history for this implementation; these design records and their native receipts supply the rationale.

Adding `DEBUG_PROCESS` inside the current recipe would create another debug chain. Leaving that flag out would preserve the outer chain, but per-command cleanup would still need the outer controller's descendant handles. The nested caller cannot independently reconstruct that complete witness from job accounting. [Microsoft process flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

## Candidates and synthesis

| Candidate | Ownership and interface cost | Decision |
| --- | --- | --- |
| Keep the debugged recipe and add command requests, handle transfer and cleanup acknowledgements between it and its controller | Preserves the extra recipe process, but introduces a second lifetime protocol and divides pipe operations from the process handles needed to complete them. | Reject as the base. The caller would depend on coordination between two owners. |
| Run the recipe in its existing transaction controller and supply one private command owner | Keeps the lock owner, file operations, native launch gates, byte pump and exact waits in the same operation. Host protocols consume one channel. | Select. Reuse the existing writer gate and completion functions rather than adding another process policy. |

The command owner keeps one open writer gate for the complete recipe. Every command appends births to that same ordered ledger and acknowledges durable retention before continuation. Completed command observations remain available while later commands run. The gate closes only when the recipe finishes; a command finishing does not reopen a closed gate.

Each command has its own job and native session. Commands run serially under one owner because Windows debug events are received by the creating thread. The owner rejects concurrent command entry before launching another process. Standalone version and inspection calls use the same implementation with an ephemeral ledger; recipe calls supply the durable retention callback.

`InstallerLive` already selects `InstallerWorkerLive` on Windows. The worker admits one request, and the current engine performs its host calls sequentially. Migration must preserve that boundary and reuse the provided command owner for recipe calls. Independent owners running concurrently on the same native thread are outside this private component's contract; the per-owner admission check does not serialize separate owners.

## Implementation shape

- `windows-native.ts` owns one CreateProcess/debug-event implementation. A command launch supplies an explicit executable, arguments, directory, environment overrides and three borrowed standard handles. Startup attributes retain stable native memory. The existing fixed recipe entry remains only as a migration adapter until its callers move.
- `windows-environment.ts` copies the native parent environment, applies overrides using Windows ordinal case comparison, sorts names and returns a double-NUL-terminated UTF-16 block. It preserves special drive-directory entries, releases the native source block and does not mutate or log the parent environment.
- `windows-channel.ts` keeps its proved byte ledger and request ownership. Its pump reports progress for idle scheduling. A separate completion effect observes EOF from both stdout and stderr; zero-byte reads remain ordinary reads.
- `windows-commands.ts` owns the writer gate, process-event dispatch, byte pumping, protocol scope and cleanup. Its exit status waits for both exact process completion and output drainage. It uses zero-timeout debug polling and yields between active passes; an idle pass may sleep without blocking the native thread.
- `WindowsExecution.run` will supply this owner to `executeChange` inside the already locked transaction worker. Fresh-process writer completion stays in the existing observation component. The obsolete Windows retained-plan launch path is removed after migration acceptance. Linux keeps its IPC recipe path.

The native environment comparator is an external Windows obligation. The implementation must not replace it with locale-sensitive JavaScript sorting or Unicode uppercasing. A supplied environment block requires `CREATE_UNICODE_ENVIRONMENT`. [Environment ordering](https://learn.microsoft.com/en-us/windows/win32/procthread/changing-environment-variables), [ordinal comparison](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-comparestringordinal).

## LDD and acceptance

The owner reuses Q2-Q10 for argument encoding, byte admission and request release, and Z1-Z22 for retention, completion and controller owners. It adds no alternative pure policy. Eighteen focused argument, stream and writer conformance tests pass before these I/O changes. The baseline hashes and result are under `.audit/probes/windows-command-owner/`.

Native acceptance must establish zero-timeout idle polling on the pinned host, full argument/environment/directory transfer, explicit inheritance, binary duplex exchange while debug events advance, delayed and rejected retention, normal and exceptional exit, protocol completion before child exit, pending I/O interruption, detached descendants, acquisition failures and exact handle waits. Native source blocks and startup attribute storage must be released on every covered failure.

The component now passes twelve [native groups](windows-command-owner-acceptance.md), including 30 independent exact process waits and main-thread byte comparisons. The fixed recipe and byte-channel regressions also pass. Special drive-directory entries were absent from the native source block, so that branch remains unexercised.

After the component passes, migrate the Windows recipe and host functions together. Qualify multiple commands in one retained ledger, controller file writes under the production owner guard, interrupted recipes, fresh-process recovery, actual Claude/Codex inspection and unchanged Linux behavior. Filesystem, full engine and client lifecycle acceptance still precede enabling a Windows profile. Separate debug chains created by a child remain a distinct open obligation. macOS remains deferred without a host.

- [x] Ground the current controller, recipe, host and cleanup paths.
- [x] Compare the two complete ownership shapes and select one owner in the transaction controller.
- [x] Proceed under the existing milestone authorization.
- [x] Verify existing pure conformance before changing I/O.
- [x] Implement and qualify the reusable command owner for the recorded native cases.
- [ ] Migrate recipe and host calls; remove the obsolete Windows recipe path.
- [ ] Qualify engine recovery and real Windows client lifecycle.
