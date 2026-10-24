# Windows host and recipe integration

## Caller and acceptance

Authors keep the existing build, preview and publish commands. Installer keeps the same reviewed plans and outcomes. The private host functions still run Claude commands and read Codex configuration; Windows uses the accepted command owner for their process lifetime.

```ts
// Existing host calls keep their signatures.
yield* runHost(destination, ["--version"])
yield* readCodexConfig(destination)

// Inside executeOnce, while the transaction worker holds its locks.
yield* withWindowsCommands(host, retainWriters, executeChange(plan))
```

Acceptance requires actual Windows version and configuration reads, retained serial mutation commands, complete child cleanup, protected controller file writes and unchanged Linux behavior. Full filesystem and engine qualification still precede enabling a Windows profile.

## Grounded flow and rationale

`InstallerLive` starts a fresh transaction worker on Windows. Its engine resolves the target, acquires installation locks, publishes its controller identity and retains pending state. `executeOnce` then invokes `WindowsExecution.run`, which starts a second debugged recipe process. That process loads a retained plan through the private `--retained-plan` entry. Host functions still use the Node spawner.

The accepted command owner now contains the creation gate, debug dispatch, byte pump and exact completion waits. Keeping the old recipe debugger would split ownership or start nested debug chains. The [owner design](windows-command-owner-design.md) therefore moves recipe execution into the existing controller. Its file operations remain under the existing lock-owner guard, and CLI processes enter the retained writer ledger.

`host.ts` owns client arguments, environment selection and Codex message semantics. `execution.ts` owns platform dispatch and recovery. `WindowsExecution` has no independent policy after its event loop moves to the command owner. Its two remaining forwarding operations can move into the existing execution module.

## Candidates and synthesis decision

| Candidate | Interface and ownership cost | Decision |
| --- | --- | --- |
| Introduce a generic process-channel service for both Node and Windows | Centralizes transport selection, but rewrites the existing Linux stdin adapter and process lifetime to match a new abstraction. | Reject for this migration. The existing Node path has accepted behavior and does not need a replacement transport. |
| Keep client protocols in the host module and add its Windows transport branch | Extracts one shared Codex exchange, preserves the current Node launch behavior and routes Windows through the existing owner. | Select. Protocol content stays in one place; native ownership stays in the command component. |

Remove the old Windows execution service after moving its call sites into `execution.ts`. Keeping it would add forwarding methods without hiding a remaining invariant. The Windows-only retained-plan worker path and fixed native entry are removed with their callers. Linux continues sending the validated plan over IPC.

## Private shape

`host.ts` gains a private `withWindowsHostCommand(host, destination, args, inExecution, protocol)` function. It resolves the native executable and constructs the existing `CommandRequest`, with a 1 MiB input budget and an 8 MiB shared output budget. It supplies the existing channel to the protocol. It reuses a provided `WindowsCommands` service; an execution call without that service fails before launch. Standalone calls create an ephemeral owner. No author configuration is added.

The Codex exchange is shared by both transports. Node keeps its existing input queue, spawner options and stderr drain. Windows writes framed UTF-8 messages through `channel.input`. Both use the existing classifier, request IDs, response ordering and ten-second timeout. `runHost` keeps its existing Node branch; its Windows branch closes input, collects stdout and awaits exit concurrently.

`windows-executable.ts` owns Windows native executable discovery. It calls `SearchPathW` with the explicitly inherited PATH and the `.exe` extension, reads a bounded UTF-16 result and returns the existing native application-path type. A size change or failure refuses launch. It changes no process-wide search mode and invokes no shell. [SearchPathW](https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-searchpathw).

The first integration checks use official native Claude and Codex artifacts. npm command shims are not silently passed to the CRT argument codec; their routing remains unqualified. Executable identity and complete Windows installation routes remain part of compatibility acceptance.

## LDD and implementation checks

This migration reuses Q2-Q10 and Z1-Z22. It introduces no alternative quoting, stream, writer or lifecycle policy. Existing oracle-conformance and record-boundary checks precede its I/O edits. Existing Codex protocol and worker-entry behavior are captured before changing callers.

The native process regression script moves from the deleted recipe entry to `CommandRequest`. It must preserve creation-gate refusal, independent PID/creation-time waits, ordinary and detached descendants, interrupted retention and deliberate native breakpoint behavior without overwriting product source. Actual host and recipe integration are checked separately from those controlled processes.

- [x] Ground the current host, controller, recipe and recovery paths.
- [x] Compare the complete transport shapes and select protocol reuse with a Windows branch.
- [x] Proceed under the active milestone authorization.
- [x] Pass the existing pure and caller checks before I/O edits.
- [x] Migrate host calls and execution; remove the obsolete Windows path.
- [x] Qualify controlled process regressions and real native host inspection. See the [acceptance record](windows-host-integration-acceptance.md).
- [ ] Qualify complete engine recovery and client lifecycle before enabling Windows.
