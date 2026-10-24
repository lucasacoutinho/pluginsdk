# Installer worker acceptance

The private [worker transport](worker-design.md) passes 15 checks on Windows 10.0.26200 and Linux with Node 24.18.0. The public Windows layer selects the worker. Linux keeps direct execution. Windows installation remains unavailable because execution jobs, retained witnesses, filesystem support and full client acceptance remain incomplete.

[`InstallerEngineLive`](../../src/installer/lifecycle/engine.ts) contains the prior Installer implementation. Normalizing its changed export name produces the exact SHA-256 of the previously accepted implementation: `1b44879a28b4e28194afd4f96da3623d91305655a6806bb51a54668839d82256`. The public method error types now derive from their authoritative schemas. Requests and replies remain private.

O1-O4 have [Lean certificates](../../spec/PluginSdk/Installer/Worker/Proofs.lean), checked against the property types. O3 uses no axioms; the others use only `propext`. The strict [oracle wire](../../spec/PluginSdk/Installer/Worker/Wire.lean) passes nine authored cases, rejects 94 malformed requests and accepts three numeric-schema equivalents. [TypeScript conformance](../../test/worker.test.ts) covers every state/signal pair before I/O implementation.

The [native harness](../../test/native/worker-transport.mjs) exercises the production worker server with a scoped [Installer port fixture](../../test/fixtures/installer-worker.ts). It verifies:

- Captured binary bytes, typed failures and error causes survive the wire; replies are bound to their operation.
- Disconnect before a request exits cleanly. Malformed input exits before invoking Installer.
- Duplicate requests invoke Installer once.
- Caller disconnect preserves accepted work and the worker's lock. A contender records an actual failed lock attempt before the owner finishes.
- Killing the caller process also leaves its accepted worker holding the lock. That worker completes after the caller exits, then releases the waiting worker.
- Worker death releases its process-owned lock.
- The production client and entry point return the expected typed unsupported result through real IPC.

The fixture uses `fs-native-extensions@1.5.1`, including real `LockFileEx` on Windows. It does not substitute for a Windows client installation. The Windows run used an owned NTFS directory with isolated profile, environment and temporary paths, inside an outer Job Object. The wrapper verified zero remaining members and successful cleanup. It invoked no client CLI.

Five source-based Codex 0.163.0 project lifecycle regressions also pass after the engine extraction: install/replacement/stale review/removal/replay, v1 lifecycle, trust/plugin-disable blocking, unowned selectors and drift. The first invocation stopped at the fixture's missing network-namespace prerequisite. The successful run used a separate namespace with loopback enabled and the pinned native binaries.

Scoped typecheck, Oxlint and Effect diagnostics pass, with zero diagnostics across 11 selected files. Local evidence is `.audit/probes/worker-transaction/acceptance.json`. CI, package-consumer and release-wide checks remain deferred. At this snapshot the combined proof gate had 154 registered obligations and was not run; [the specification index](../../spec/README.md) records subsequent additions.
