# Windows host integration acceptance

The private host functions now use the command owner on Windows. Nine native groups pass with Claude Code 2.1.304 and Codex 0.163.0 on Windows 10.0.26200 x64, Node 24.18.0, and Koffi 3.3.3. Windows installation profiles remain disabled while full installer qualification continues.

## Accepted behavior

| Group | Observed result |
| --- | --- |
| Required owner | Transaction calls without a retained owner fail before executable discovery or process creation. Both host commands and Codex configuration reads enforce this condition. |
| Executable discovery | `SearchPathW` receives the explicit PATH and `.exe` extension. It resolves both pinned vendor binaries through a bounded UTF-16 buffer. |
| Discovery failures | A directory containing only `codex.cmd`, an empty PATH, and an injected size change all produce `HostUnavailable` before process creation. |
| Claude version | A standalone call creates an ephemeral owner and returns `2.1.304 (Claude Code)`. |
| Codex version | A standalone call creates an ephemeral owner and returns `codex-cli 0.163.0`. |
| Claude inspection | A fresh isolated home returns an empty plugin inventory. |
| Codex configuration | User and project calls read the controlled agent description through `initialize`, `initialized`, and `config/read`. Both calls return three configuration layers. The fixture retains no complete configuration response. |
| Retained Claude commands | One owner runs six commands: add a local marketplace, install its plugin, list it, uninstall it, remove the marketplace, and list again. The installed inventory contains the expected enabled version. The final inventory is empty. |
| Retained Codex commands | The same six operations run through one owner with Codex's native commands. The expected enabled plugin appears, then both installed and available inventories are empty. |

The serial cases flush a fixture writer ledger before acknowledging each process birth. The complete ledger matches after every command. Claude retains 36 writers across its six commands; Codex retains 12. Each ledger preserves earlier witnesses.

All 62 independently observed processes match their PID and creation time before continuation. Every held process handle signals before closure. The observations cover eight Claude processes, nine Codex processes, fourteen registry-query processes, and 31 console helpers. The two configuration servers finish through owner cleanup after returning their response.

All 134 native requests reach terminal results and release their storage. The run frees 268 allocations, closes 1,526 owned handles, frees seventeen native environment blocks, and deletes seventeen startup attribute lists. No observer handle remains open, and no harness rescue termination is needed.

Main independently checks seventeen captured artifacts. The twelve command responses concatenate to exactly the 3,034 bytes captured from native stdout. Independent checks also confirm both version outputs, plugin identities, enabled state, and final empty inventories. The native-output comparison totals 3,074 bytes.

## Implementation and conformance

The [selected design](windows-host-integration-design.md) keeps client protocols in `host.ts` and process ownership in `windows-commands.ts`. The Codex exchange is shared across Node and Windows transports. Linux retains its input queue, spawn options, stderr drain, and protocol timeout.

`execution.ts` now runs the recipe inside the transaction worker's command owner. The duplicate `WindowsExecution` service, fixed native recipe entry, NUL-handle fallback, and Windows `--retained-plan` path are removed. Linux continues sending validated plans over IPC.

Thirty focused conformance and caller tests pass before the I/O edits and again afterward. The migration preserves all 52 contract and model source files from the prior accepted snapshot. Scoped TypeScript, Effect diagnostics, and lint pass. Effect checks ten files with no errors, warnings, or messages.

The twelve [command-owner groups](windows-command-owner-acceptance.md) pass again on this source snapshot, with thirty exact process waits and the same resource counts. Main compares 2,064,566 output bytes. The migrated [process regressions](windows-debug-runtime-acceptance.md) add seven passing groups and sixteen exact process waits, including a deliberate native breakpoint.

All nine Linux Codex project recovery scenarios pass with pinned Codex 0.163.0 and Node 24.18.0. They run from source in a separate network namespace and isolated homes. The scenarios cover interrupted install, replacement, and removal, inherited locks, concurrent reviews, and repair without repeated activation.

## Evidence and limits

Receipts, vendor provenance, staged source hashes, checked harnesses, and captured bytes are under `.audit/probes/windows-host-integration/`. `host2-validation.json` records the nine accepted host groups. `owner-validation.json` records the command-owner regression. From the repository root, the counting commands are `python3 .audit/probes/windows-host-integration/verify-host.py --read-only` and `python3 .audit/probes/windows-host-integration/verify-owner.py owner .audit/probes/windows-host-integration/owner-captures --read-only`.

The official Claude manifest signature verifies against the documented vendor key. Both vendor artifact hashes match their recorded release metadata. All 45 extracted Codex files and all 123 staged product files match their recorded hashes. The owned Windows scratch tree is removed after verification. Packaging the full Codex archive does not qualify helper behavior beyond the commands exercised here.

One failed process-harness run used the removed Effect 3 `Effect.fork` API. Main replaced it with `Effect.forkScoped`; the failed receipt remains preserved. An earlier eight-group host run passes separately. The accepted nine-group run adds discovery failures and independent output comparisons without changing product source.

The fixture ledger qualifies callback integration. Production pending-record writes, initial owner-publication interruption, full engine settlement, separate debug chains, remaining file operations, executable identity, and complete SDK client lifecycle still need qualification. Native command tests do not enable a Windows installation profile. npm shim routing remains unsupported. No macOS host is available, so macOS qualification stays deferred. CI, package-consumer, and release-wide checks remain user-deferred.
