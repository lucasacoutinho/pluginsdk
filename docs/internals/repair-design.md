# Explicit repair

## Problem

A killed replacement can remove the old plugin and leave its SDK marketplace registered. Fresh inspection correctly reports an uncertain pending operation. Reapplying that operation must never repeat its native mutation. The isolated probe in `.audit/evidence/repair-partial.json` reproduces this state in Claude 2.1.304 and Codex 0.163.0: the installed-plugin inventory and plugin configuration are empty, while the dedicated local marketplace remains registered at the SDK's path.

## Usage

The caller requests a new reviewable cleanup plan:

```ts
const cleanup = yield* installer.plan({
  destination,
  intent: { type: "repair", plugin, pending: interruptedPlanId }
})
// Review the interrupted operation, residual state and cleanup plan ID.
const outcome = yield* installer.apply(reviewedCleanup)
```

After verified cleanup, the caller can plan a fresh installation using the retained bundle. Repair restores a known absent state. It does not silently continue or roll back the interrupted replacement.

## Candidates and synthesis

| Candidate | Caller obligations and hidden knowledge | Decision |
| --- | --- | --- |
| Force or forget | Callers delete journals or override ownership and must reason about native processes and foreign state themselves. | Reject. |
| Resume a recipe from its last recorded step | Exposes ordering and assumes a recorded subprocess result proves what the host committed. Repeated steps can acquire new effects. | Reject. |
| Review a new cleanup plan from fresh qualified evidence | Installer owns process quiescence, residual ownership, a new plan commitment, native removal and replay. | Select. |

The selected repair contract handles proven absence, an orphaned SDK marketplace, surviving owned Codex companion roles, or both residuals with no installed plugin. Other partial states remain blocked until their ownership and cleanup contracts are qualified. The [agent contract](agents-design.md) specifies the complete retained-byte binding for companion cleanup.

## Shape

`RepairSnapshot` has a fingerprint and a residual of `absent`, `marketplace`, `companions` or `marketplace_and_companions`. `RepairBasis` binds the interrupted original plan, the currently pending plan and that snapshot. `RepairPlan` uses the `repair_ready` tag, includes its resolved target and basis, and commits those fields into a new ID. Both plan kinds optionally capture complete companion bytes; omitting that field preserves older plan commitments. `ReviewedPlan` accepts either kind. `Installer.plan` and `Installer.apply` remain the public operations.

The internal repair state is an original pending operation, a pending cleanup with its full basis, or a completed cleanup. Proposal reads that state and a qualified inspection. Begin compares the fresh proposal to the reviewed basis. An original pending ID and the current cleanup ID cannot authorize another start. Retrying the current cleanup only resumes inspection. A newly reviewed repair after a failed cleanup binds the current cleanup ID, so it is a distinct attempt.

The durable `repair_pending` record retains the complete interrupted `ReadyPlan`, the current `RepairPlan` and its execution token. Earlier cleanup plans remain in the plan store. Loading this record validates the retained root, current plan and one immediate predecessor against the proved begin operation. It does not walk a recursive journal history. A missing or changed retained plan makes state unavailable.

Before returning a recoverable marketplace snapshot, native inspection must prove all of the following under the existing physical-home lock:

- The original native process group can no longer commit, and no other SDK execution holds shared native state.
- Complete native inventory contains no plugin using the dedicated marketplace, in any scope. The requested scope has no same-name plugin or plugin configuration entry.
- Exactly one matching marketplace is registered, its native source and settings point to the physical SDK marketplace, and its catalog equals the retained original plan's generated catalog.
- The retained plan has a valid commitment and target binding. No caller-supplied filesystem path becomes a cleanup operand.

An absent snapshot requires the same quiescence and a complete ordinary absence observation, including tracked companion roles. A companion residual additionally requires every surviving file to match exact previous or desired bytes from the interrupted plan, in its fixed physical path and mode, with no conflicting role declaration. Cleanup captures those bytes with an empty desired set. Unknown, unowned or changed facts block a new repair. The fingerprint commits to the native facts used for that decision. Apply rechecks those facts after acquiring the lock.

An interrupted removal still uses the earlier installation's catalog. Inspection resolves that installation through the removal plan's before-receipt, then validates its retained plan, target and bundle identity. The removal plan's own ID never names a staged payload.

A running native worker can retain the installation lock, so repair planning waits for that lock. Once acquired, the process-group check still covers descendants left alive after the worker exits.

Cleanup receives the reviewed repair plan through the existing durable one-shot handoff. A marketplace residual authorizes exactly one qualified marketplace-remove command; a companion residual authorizes only removal of its captured owned files; the combined residual authorizes both. Proven absence authorizes no cleanup or worker. Each path persists pending state before settlement. Settlement completes only after a quiescent fresh absence observation. Remaining or unknown state retains the cleanup as pending. Local retained plans and payloads remain available for inspection and a subsequent fresh installation.

## LDD obligations

| Property | Required claim |
| --- | --- |
| R1 | A blocked inspection never authorizes a new native mutation. |
| R2 | A start requires a fresh proposal exactly equal to the reviewed basis; a changed pending ID or fingerprint rejects it. |
| R3 | A new start keeps the interrupted operation's identity and uses a distinct current plan ID. |
| R4 | Cleanup matches the exact evidenced residual; proven absence requests no cleanup. |
| R5 | Retrying the current pending cleanup returns inspection-only resume and never start. |
| R6 | Settlement completes only with a qualified absence observation. |
| R7 | Every other settlement preserves the complete pending cleanup and its basis. |
| R8 | Replaying a completed cleanup against qualified absence acknowledges removal without mutation. |

These pure properties assume truthful qualified inspection and content-derived plan IDs. Native tests must separately establish quiescence, ownership classification, exact cleanup commands, preserved unrelated settings, fresh installation after cleanup, stale-basis rejection and process-kill recovery. The original P1 through P14 remain unchanged for ordinary operations.

## Tradeoffs and open work

Cleanup requires another reviewed installation plan to recover the desired plugin. It keeps recovery from acquiring an implicit retry policy. Foreign plugins, unexplained catalog edits and active native processes continue to block repair. This does not provide a universal cleanup switch.

R1 through R8 have checked Lean proofs, strict oracle vectors and conforming TypeScript. The runtime classifier and durable execution have 16 repair tests within the 39-test native gate. Those tests cover Claude user/project scope and Codex user scope, stale catalogs, absence without a native command, interrupted removal, cleanup replay, process-kill checkpoints, live descendants and foreign consumers, including a Claude project-scope consumer of a user marketplace. The [acceptance record](acceptance.md) separates that I/O evidence from the pure proofs.

The [SDK agent pilots](agents-design.md#native-acceptance) add both Codex companion residuals. Termination after marketplace removal leaves exact owned roles; termination after plugin removal leaves the owned marketplace and roles. The original plan returns uncertain without replay. A fresh repair captures the matching residual, removes it once and establishes fresh-session absence; completed replay issues no further native mutation. Settings and unrelated files survive in both cases.
