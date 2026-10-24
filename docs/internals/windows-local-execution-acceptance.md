# Windows local installation component

The private local installer passes 21 Windows x64 cases for directory preparation, package allocation, install, replacement, removal and worker execution. It uses the unchanged seven-file CLI-built packages from the [Cursor loading check](cursor-local-lifecycle.md), generations 1.0.0 and 1.0.1.

This gate uses an explicitly constructed private target. At this component checkpoint, Cursor target resolution, SDK lifecycle integration and explicit local recovery remained open. The later [SDK lifecycle](cursor-sdk-target-acceptance.md), [recovery](cursor-sdk-recovery-acceptance.md) and [real lstack](cursor-basic-acceptance.md) gates supply their separate evidence.

## Implementation and checks

The implementation lives under [installer/local](../../src/installer/local/install.ts). It combines rooted package reads, retained physical approvals, LocalSlot decisions and lifecycle projection. Install prepares and publishes a package. Replacement prepares the next package, retires the previous package, publishes the next package and moves the retired package into retained history. Removal retires and archives the current package.

Every step checks actual role captures against the model. Changed contents, foreign packages and unexpected staged or retired roles refuse normal execution. A failed allocation retains its partial private directory without an approval. A failed publication retains the complete approved staged package for later recovery.

This component gate also qualified a separate local worker with byte-count and EOF framing. The later SDK integration uses the existing [transaction worker](../../src/installer/execution/transaction-worker.ts), which holds the installation lease and calls the local interpreter directly. The unused launcher, entry and request decoder are retired from current source; their four native cases remain in this checkpoint's immutable evidence. Tests for the live interpreter's construction and refusal before I/O remain in [local installation](../../test/local-install.test.ts).

The [ownership model](cursor-ownership-design.md), [package classification and approval](local-package-claims.md) and [rooted observation](windows-local-observation-acceptance.md) retain their checked Lean properties and TypeScript oracle comparisons. These proofs concern the Lean policy definitions. The handwritten TypeScript ports have empirical conformance evidence; a formal refinement proof remains open. Filesystem operations, process observation and durability remain runtime premises.

The source-layout pass preserves normalized code structure, public exports and complete compiler output. Production emit, lint and strict Effect diagnostics pass. Its affected tests pass 319 cases and reproduce two existing failures against the retained earlier source. The combined repository gate remains deferred.

## Native results

| Cases | Required behavior |
| --- | --- |
| Five directory cases | Create and repeat preparation; refuse ordinary-file parents, junctions, reserved names and a changed retained-parent frame. |
| Four allocation cases | Allocate a fresh complete package; preserve existing empty and nonempty destinations; preserve legacy writer behavior. |
| Eight installer cases | Install, replace and remove; refuse foreign packages, reviewed-content drift, residual roles and changed bases; preserve failed publication and allocation state. |
| Four worker cases | Complete all three lifecycle operations; preserve prepared state on retention refusal; observe a live suspended worker and interrupt it; reject seven malformed requests without package writes. |

All 89 captured model results agree with Lean: 48 package classifications, 16 slot decisions, 16 lifecycle projections and nine settlements. The direct lifecycle preserves physical directory identity across publication, retirement and archival moves. The worker lifecycle retains and reloads the completed journal after each generation. Interrupted work retains its pending writer record; its unchanged package state settles as `not_applied` once the writer is quiescent.

All 3,606 tracked parent FileApi handles close. Child and Node-internal handles are outside that counter. The owning Windows job reports no survivors, and every recorded worker identity is terminated. All 173 runtime files are retained and compared with a fresh native inventory before removing the accepted temporary root. The thirteen earlier protected roots remain untouched.

The runtime is Node 24.18.0 on Windows 10.0.26200, with the previously qualified Koffi 3.3.3 and fs-native-extensions 1.5.1 closure. The private record is `.audit/probes/cursor-local-execution-layout/attempt-001`.

The original acceptance reader expected an exit value from `Fiber.interrupt`. Effect 4 returns `void`, so JSON omits that field. A separately retained correction changes that expectation while preserving the frozen candidate and all interruption, package, journal and process-closure checks. The native run is performed once.

## Remaining admission work

The qualified interpreter and profile are integrated in current source, and the later gates above cover SDK lifecycle, drift and interrupted recovery. Native Windows compiled CLI, default/explicit preview and managed distribution qualification remain open before expanding user-facing support. Existing macOS, Grok, authentication, CI, consumer and release deferrals remain in force.
