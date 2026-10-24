# Windows Codex project CLI qualification

## Outcome and grounding

Enable the existing reviewed project workflow for Codex 0.163.0 on Windows x64, restricted to `agent_plugins_v2`. The accepted SDK lifecycle and seven interruption cases already establish the installer behavior. The compiled CLI still needs native evidence before promoting that exact profile.

The caller keeps the same commands:

```text
pluginsdk build --target codex
pluginsdk plan .pluginsdk/build/codex.bundle.json --host codex --home HOME --project PROJECT --out install.json
pluginsdk show install.json
pluginsdk apply install.json
```

Replacement builds changed source and reviews another plan. `pluginsdk remove ID` reviews removal; `apply` performs it. `preview` continues to target user installations and does not gain Windows support from a project profile. Publishing destinations, package-consumer acceptance and release-wide checks are outside this qualification.

`src/cli/project.ts` discovers the definition, compiles the recommended format and writes a captured build. `src/cli.ts` decodes bundles/reviewed plans, constructs the project destination, invokes Installer and encodes its existing result. `PluginSdkLive` supplies the public Windows worker. The worker uses the physical target, locks, journal, native command owner and project-file implementation already qualified. `profiles.ts` owns admission; the CLI has no platform override.

The compiled entry loads package metadata through its package self-reference. Staging must include the pinned root `package.json`, compiled schemas and the emitted worker files. Running only TypeScript source would miss the worker's `.js` selection branch.

## Alternatives and synthesis decision

| Shape | Assessment |
| --- | --- |
| Add a CLI flag or injectable registry that bypasses platform admission | Reject: leaks installer authority into author commands and adds a separate supported path. |
| Retain private SDK qualification while all Windows profiles stay disabled | Reject as the final outcome: the reviewed CLI remains unavailable despite established project behavior. |
| Qualify a compiled isolated copy with one exact candidate row, then promote its unchanged bytes | Select: exercises the delivered command structure without changing public interfaces or admission rules. |

The private copy adds only the exact profile and standard worker tracing. It does not replace observations, syscalls or SDK results. No engine pause is needed. The final profile is Codex / Windows / 0.163.0 / project / `codex-project-cache:1` / `agent_plugins_v2`; other combinations remain rejected. Existing N1-N8 proofs and model conformance govern selection. Native evidence admits the concrete row; it does not broaden that relation.

## Private module sketch

```ts
type CliRequest = { schema: 1; nonce: string; args: NonEmptyReadonlyArray<string> }
type CliBoot = { schema: 1; nonce: string; type: "boot"; process: ProcessWitness }

// Private harness; no public SDK export.
run(args: NonEmptyReadonlyArray<string>, label: string, cwd: string): Promise<CliResult>
// Admit the caller before sending args. Collect native wait, child close,
// stdout/stderr, matching worker births and completed traces. Decode JSON
// with Bundle, Planning, ReviewedPlan or ApplyOutcome.
```

`caller-cli.mjs` publishes its real birth, accepts one nonce-bound request, disconnects its control channel and imports the compiled CLI with the requested argv. `transport.mjs` owns admitted caller handles and worker completion. `driver.mjs` owns the user scenario and checks expected domain results. `qualify.py` owns staging, containment, complete immutable inventories and cleanup. The main thread owns independent acceptance.

All native requests are serial. A successful command accounts for zero workers (`build`, `show`) or one worker (`plan`, `remove`, `apply`). Unknown caller/worker completion prevents inventory and cleanup. The job supplies containment, not process-death evidence. Durable journals and configurations are read only after known writers finish.

## Acceptance

Build both reference generations through the compiled CLI using automatic definition discovery. Compare their complete bundles with the accepted references. Review/show/apply installation, acknowledge replay and unchanged planning, replace with the second generation, acknowledge replay, remove, acknowledge removal replay and confirm unchanged removal planning. Fresh Codex sessions must discover the exact active payload only in project A. Preserve user/sibling configuration, project metadata, receipts and all approved bytes.

Worker traces must show exactly one `executeOnce` for each actual install/replace/remove and none during completed replay or unchanged planning. Every caller and worker has exact completion evidence; app-server sessions close through EOF. Retain the operation artifacts before removing the owned stage. Promote only the exact qualified registry bytes and rerun scoped selection/type checks against the live table. Keep Windows release-wide qualification separate.

## Phases

- [x] Ground CLI, profile admission, worker loading, package context and native ownership.
- [x] Compare whole-shape alternatives and select one exact profile with unchanged commands.
- [x] Proceed under the active milestone instruction.
- [x] Implement the private caller, transport and compiled CLI scenario.
- [ ] Run native qualification, independently accept it and promote the exact profile.
- [ ] Revisit the design if native evidence contradicts a premise.
