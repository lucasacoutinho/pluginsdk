# Automatic portable build acceptance

`pluginsdk build` discovers `definition.json` and produces the portable Claude and Codex packages for bundled stdio MCP. Authors supply no format flag, SDK wrapper or operating-system branch. Preview uses the same recommendation function. The four native-tested user profiles are enabled: Claude Code 2.1.304 and Codex 0.163.0 on Linux and Windows.

## Proof before integration

BF1–BF4 preserve the selection priority: agents, hooks, bundled stdio, basic content. Only the stdio branch changes its output. The [Lean properties](../../spec/PluginSdk/Compiler/BuildFormat/Properties.lean) and [certificates](../../spec/PluginSdk/Compiler/BuildFormat/Proofs.lean) pass the exact-type and axiom audit, which now checks 290/290 obligations.

All sixteen finite feature inputs agree between independently authored expected formats, the Lean oracle and TypeScript. Both wire decoders reject 33 malformed requests. Scoped TypeScript, Effect diagnostics and lint checks pass. The pure checkpoint, `.audit/probes/portable-build-defaults/pure-acceptance.json`, has SHA-256 `94f4b30f3aeb436c7781581a738f57cb1a43992560605676879d4d1b77fe1c07`. Project build and profile code retain their previous bytes at that checkpoint.

## Normal CLI output

The emitted CLI runs `build` with no definition argument or flags against private exact copies of the two source versions used by the [Linux](portable-sdk-lifecycle-acceptance.md) and [Windows](portable-sdk-windows-lifecycle-acceptance.md) native sessions. Both invocations discover their definition and capture both client bundles.

All four bundle values, digests, ordered file records, executable intent and 52 payload file contents match the native-qualified references exactly. Version `1.0.0` and replacement `1.0.1` retain the same runtime and invocation declarations. The replacement backend keeps its changed echo response. Captured source bytes and permissions remain unchanged.

The emitted production profile module is byte-identical to the private native-qualified module, with SHA-256 `ef4d76f1e7735f5f387b3e7b5f7f09c3eb231dcb6df9657043a58e2c34b205a3`. Exactly four existing user rows gain their corresponding portable format. Project profiles, client versions and adapter revisions remain unchanged.

Twelve focused project-build, native-profile and preview checks pass. They cover real declaration projection, empty optional declarations, mixed remote/local MCP, qualified user rows, refused project/platform/version combinations and preview refusal before configuration changes. Scoped typecheck, Effect diagnostics, lint and CLI emission also pass. No package-consumer or release-wide check runs.

The checkout's compiled CLI is refreshed through the same CLI-only compiler configuration. An offline `npx --no pluginsdk build` invocation resolves its package link to this checkout and its executable link to `dist/src/cli.js`. It reproduces both first-version bundles and all 26 payload files exactly. npm install scripts are disabled for this invocation; package metadata, lockfile, runtime and emitted CLI files retain their hashes. The refresh preserves prior build artifacts and emits source maps for their actual location.

## Implementation and limits

The implementation follows the [selected design](portable-defaults-design.md): one pure policy, the existing project recommendation signature and profile-table registration. Build and preview share the policy. Compiler rendering, runtime bytes and Installer execution code remain unchanged. Native evidence is reused through exact package/profile equality; this gate exercises the newly automatic CLI selection and does not claim another native installation session.

Bundled stdio requires Node 24.18+ on the client path and user scope. Linux additionally checks its qualified shell/env runtime. Windows rejects a prospective server cwd above 258 UTF-16 units before retaining a plan. Linux Claude retains its persistent-descendant shutdown limit. Windows hooks/agents, project-scope stdio and complete Windows source symbolic-link coverage remain open. macOS has no available host. Other clients, third-party authentication, CI, package-consumer/release checks and publication retain their separate or deferred status.

Evidence lives under `.audit/probes/portable-build-defaults/`: the pure checkpoint, before images, proof/static/test logs, emitted CLI, exact fixture copies, CLI outputs and `cli-acceptance.json`. Initial audit and test-fixture errors are retained. The audit initially could not discover suffixed theorem names; test setup then exposed an inferred platform type and mixed encoded/decoded URL values. These were corrected before the passing checks. They supplied no acceptance evidence.

`.audit/probes/portable-cli-activation/` retains the local build's before images, emitted-file manifest, exact `npx` routing and output, and independent bundle comparisons.
