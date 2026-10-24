# Windows process regression acceptance

The private [command owner](../../src/installer/windows/commands.ts) and [Win32 boundary](../../src/installer/windows/process/native.ts) pass seven isolated groups on Windows 10.0.26200 x64, Node 24.18.0, and Koffi 3.3.3. The owner interprets the proved writer protocol. Windows installation profiles remain disabled while full installer qualification continues.

| Group | Observed result |
| --- | --- |
| Stock Node command | The pinned Node executable runs `-e ""` and exits zero. The flushed writer file matches every retained witness. |
| Pending-event ownership | A second poll, mismatched continuation, and premature close fail. Cleanup terminates the process before its pending creation event resumes. |
| Ordinary and detached descendants | Five Node scripts run: the root, ordinary child, detached child, and both detached leaves. Each script belongs to an acknowledged ledger and exits zero. Console helpers have separate witnesses. |
| Root retention failure | No ledger is acknowledged, no script starts, and the root's exact process handle signals during cleanup. |
| Node descendant retention failure | The root starts. A specific Node descendant is rejected before its startup marker. Every observed process finishes before its observer closes. |
| Interrupted retention | Interruption occurs before acknowledgement. No script starts. The command fiber preserves interruption, and the enclosing owner reports its stopped state after cleanup. |
| Deliberate breakpoint | After startup, `DebugBreak` terminates the root with `0x80000003`. The statement after the breakpoint does not run. |

The [native harness](../../test/native/windows-debug-runtime.mjs) opens independent process handles before continuation and compares each PID and creation time with its writer identity. All sixteen held handles return `WAIT_OBJECT_0` before closure. Startup markers remain absent during delayed retention. Successful callbacks flush the complete writer file before acknowledgement. The [family fixture](../../test/native/windows-debug-family.mjs) does not overwrite product source.

The worker-entry suite passes three subprocess tests. It accepts an exact validated repair through Linux IPC, rejects excess fields and changed plan commitments, and rejects the retired `--retained-plan` entry without rewriting its record. Scoped lint passes for both native fixture files. The surrounding [host integration](windows-host-integration-acceptance.md) passes scoped TypeScript, Effect diagnostics, thirty focused tests, and nine Linux Codex project recovery scenarios.

The current receipts and source hashes are under `.audit/probes/windows-host-integration/`. `native2-observation.json` records the accepted run. Its preceding failed run used the removed Effect 3 `Effect.fork` API; main corrected the harness to use `Effect.forkScoped`. Product source stayed unchanged between those runs.

The older `.audit/probes/windows-debug-runtime/` record retains the original fixed-recipe checks and fifteen process observations. The fixed recipe entry has since been removed. The current harness tests the shared command owner directly, including rejection of an actual Node descendant.

These groups establish controlled process behavior. Production pending records, engine inspection and settlement, initial owner publication, separate debug chains, remaining file operations, and complete SDK client lifecycle still need qualification. CI, package-consumer, and release-wide checks remain user-deferred.
