# Private Cursor SDK lifecycle

A private Windows candidate now installs, updates and removes a plugin through the existing `Installer.plan/apply` interface. It uses the same seven-file Claude portable v1 package previously loaded by Cursor IDE. The author definition, skill and MCP program are unchanged.

Production has no qualified Cursor profile. Subsequent [recovery gates](cursor-sdk-recovery-acceptance.md) qualify seven interruption, cleanup and owner cases. [Fresh IDE discovery](cursor-sdk-ui-acceptance.md) now passes for SDK-managed installations. Production admission and caller coverage remain open. This gate establishes the normal SDK lifecycle and its refusals; it does not establish Cursor tool calls, hooks, agents or release readiness.

## Target and implementation

| Field | Qualified private candidate |
| --- | --- |
| Client | Cursor IDE 3.26.16, commit `8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40` |
| Platform and scope | Windows x64, user scope, isolated `.cursor` homes |
| Profile revision | `cursor-local-directory:1` |
| Package format | `claude_code_portable_v1` |
| SDK interface | Existing `Installer.plan` and `Installer.apply` |

Cursor has its own host identity. Native profile membership admits its compatible package format; consuming a Claude-format package does not give Cursor ownership of Claude installations. The runtime adapter selects the user-local installation and validates the version command's version, commit and x64 reply. The older PATH installation is excluded.

The private target dispatches observation, mutation and repair to LocalInstallation. Normal execution and archival use the existing transaction worker, installation leases, current-process owner ledger and saved plans. There is no additional worker protocol or author-facing configuration. Local Windows layers are constructed only on the local target path. Process-directory checks use the actual local package destination.

The source and design are retained under `.audit/probes/cursor-sdk-target`. Candidate changes remain separate from production source.

## Proofs and source checks

N1–N8 and IL1–IL4 retain their original statements over the expanded host domain. Main rebuilds ten project modules from source and checks the twelve exact theorem types and transitive axiom sets. Their dependencies are limited to Lean's standard foundations.

Before I/O changes, the oracle matches 44 existing and twenty Cursor-specific reviewed vectors. Six malformed requests fail at both wire boundaries. TypeScript then passes all six focused tests, including 150 lock comparisons and the existing generated profile/ownership cases. The pure TypeScript models require no behavior change.

The actual private profile table passes another 504 comparisons with Lean. Its existing profile rows are unchanged. Linux refuses the Cursor destination before filesystem access. Typechecking and strict Effect diagnostics cover 199 candidate and entry files with no errors, warnings or messages. Scoped lint and helper syntax checks also pass.

## Windows SDK evidence

| Case | SDK requests | Checked behavior |
| --- | ---: | --- |
| Normal lifecycle | 12 | Review, apply, inspect and replay install/update/remove; exact package bytes; retained physical roots in history; durable journals |
| Stale and drifted state | 6 | Stale apply fails `PlanRejected/stale_plan`; new update/removal reviews block for drift |
| Unowned package | 4 | After archiving the SDK records outside the home, matching package bytes alone cannot authorize installation or removal |
| Unsupported destinations | 2 | Codex package format and Cursor project scope fail `DestinationUnsupported` |

All 24 requests use the actual transaction worker. The helper records each worker's PID and creation time, waits for close and independently observes that exact identity as terminated before inspecting package state. The owning Windows job has no survivors. All 24 process-birth query handles opened by the helper close. Separate process-observation calls, worker FileApi handles and Node internals are outside that counter.

Three completed-plan replays preserve the package inventory and journal bytes. Fourteen actual lifecycle requests, built from retained plans, journals and fresh SDK observations, match the pinned Lean oracle. Main also reads the actual SDK replies independently of the helper's assertions.

The executable, CLI entry, package metadata and product metadata retain their pinned hashes before and after the run. All 277 default-stream runtime files are retained and compared with the quiescent native source. Only then is the accepted marked root removed. All thirteen older protected roots remain untouched.

The accepted attempt is `.audit/probes/cursor-sdk-target/attempt-001`. The [subsequent recovery gates](cursor-sdk-recovery-acceptance.md) pass seven cases with 59 SDK requests and 35 actual repair comparisons with Lean. The [fresh IDE gate](cursor-sdk-ui-acceptance.md) adds six SDK requests, three fresh windows and direct discovery of both generations and their removal. Oracle comparisons are empirical evidence for the handwritten TypeScript ports; formal TypeScript refinement remains open. CI, package-consumer checks, release-wide checks and publication remain deferred.
