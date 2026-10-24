# Windows activation and settlement

The next acceptance check runs the public `Compiler` and `Installer` against the pinned Windows Claude and Codex executables. A successful installation must publish the reviewed catalog and marker, expose the approved payload through the client, and settle the retained journal. Reapplying the same plan must acknowledge completion without another mutation. Replacement and removal must preserve unrelated configuration.

## Grounding

`InstallerLive` selects `InstallerWorkerLive` on Windows. Each request crosses the strict worker protocol into `InstallerEngineLive`. Planning resolves the physical destination and native profile, acquires the installation lock, loads the journal and inspects the client. Applying first retains the reviewed plan and a complete prepared pending record. `executeOnce` runs the recipe in `withWindowsCommands`; each newly observed writer is retained before continuation. Only quiescent execution and a conclusive native observation permit settlement to an idle record. A resumed pending plan observes and settles without running the recipe again.

The ordinary recipe materializes and compares the complete payload before writing its catalog and marker. It then runs native marketplace and plugin commands. Codex project scope instead commits revision and cache directories before replacing the project configuration. Existing Windows evidence covers materialization, durable JSON replacement, writer retention and cold record loading separately. It does not cover this complete engine flow.

All seven production profiles currently select Linux. Modern formats also require GNU shell launchers; adding Windows registry entries cannot qualify those launchers. The project configuration reader uses Linux descriptor paths, so project scope needs its own evidence and may expose a production gap. Effect's filesystem service already retains device and inode values as bigint; target identity does not require a speculative conversion fix.

## Alternatives and synthesis decision

| Shape | Decision |
| --- | --- |
| Inject a configurable profile service through the production installer and worker protocol | Reject for this qualification. It expands production authority and the wire contract solely to run a harness. |
| Add Windows production profiles before lifecycle evidence | Reject. It would advertise installation support before its acceptance check. |
| Add candidate profiles only to a sealed, isolated copy of `profiles.ts` | Select. The public worker and engine run unchanged except for an explicit, recorded registry addition. Production profiles remain disabled. |

The qualification controller reconstructs the accepted runtime, checks the materialization checkpoint and every staged input, and adds the already acquired vendor binaries with their accepted hashes. It records the original profile bytes, the exact candidate addition and the resulting bytes. It never substitutes a client, recipe, engine or observation. The candidate formats are the existing skill/asset/remote-MCP formats; modern process, hook and agent formats remain a separate acceptance requirement.

## Sketch

The harness owns three private artifacts:

```text
qualify.py stage
  verify checkpoint and pinned runtime/vendor inputs
  stage an owned Windows temporary tree
  append four candidate profile rows in the staged registry
  record complete manifests and the exact overlay

qualify.py run <label>
  verify staged bytes and isolated environment
  assign the bootstrap to an outer containment job before releasing it
  run probe.mjs through the public SDK
  retain raw output, operation receipts and job accounting

probe.mjs
  build the same definition for both clients
  plan / apply / inspect / reapply / replace / remove
  read the full durable state after each operation
  preserve unrelated settings and verify source and loaded payload bytes
  report each scope independently, including any refusal
```

Each native run has a bounded lifetime. The outer job must contain every descendant, reach zero active processes and close before cleanup. Cleanup verifies the ownership marker and all immutable runtime inputs, preserves operation evidence, and removes only its owned stage. A failed or interrupted run remains evidence; it is never relabeled as a pass.

## LDD and acceptance

No pure policy or public schema changes are proposed. Before production I/O edits, recheck the lifecycle, compatibility, execution and writer properties and their TypeScript oracle conformance. If native execution contradicts an assumption, retain the counterexample, revise the affected interface/property/proof and establish conformance before implementing that change.

Acceptance requires actual catalog/configuration activation and final journals for each claimed scope. Recovery additionally requires a fresh public installer process to settle a retained real operation without repeating its native mutation. Candidate-profile evidence remains distinct from production support until the selected rows are promoted and the relevant checks rerun against the exact production registry. Windows CLI qualification and modern formats remain in the roadmap. macOS remains deferred because the user has no host; CI, package-consumer and release checks remain deferred.

The normal lifecycle observes the journal after each completed operation. A native counterexample shows that an open Node read handle can refuse atomic replacement with `EPERM`; closing the reader permits publication. The initial live polling observer therefore interfered with writer retention. Pending-record capture belongs in the separate recovery check, with the writer paused while the observer reads and closes its handle. Temporary error and pipe-output instrumentation is confined to the isolated copy and removed before normal acceptance.

## Phase status

- Ground: traced public worker, engine, recipes, storage and inspection.
- Sketch: selected an isolated registry overlay with unchanged execution paths.
- Agree: the instruction to complete the milestones authorizes the qualification work.
- Implement: construct the fixture, recheck scoped proof/conformance, and run the real Windows clients.
- Scrap: retain any native counterexample and revise the affected design before a production fix.
