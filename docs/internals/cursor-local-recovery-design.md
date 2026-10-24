# Cursor local recovery

Repair returns an interrupted installation to a known absent state. The caller can then review a fresh installation. This preserves the existing [repair contract](repair-design.md); recovery does not continue the interrupted recipe.

```ts
const cleanup = yield* installer.plan({
  destination,
  intent: { type: "repair", plugin, pending: interruptedPlanId }
})
const outcome = yield* installer.apply(reviewedCleanup)
```

The author keeps the same plugin definition, skill files and MCP program. Local directory roles remain internal to Installer.

## Existing flow

[Installer.plan](../../src/installer/lifecycle/engine.ts) resolves and locks the physical target, checks other executions and loads its journal. [Repair planning](../../src/installer/recovery/repair.ts) requires the matching pending ID and quiescent retained writers before fresh inspection. A repair review commits the original operation, current pending operation and observed fingerprint. Apply repeats inspection and checks that basis before persisting a new `repair_pending` record and starting one worker.

The [repair model](../../src/installer/recovery/model.ts) makes a retry of that cleanup inspection-only. Settlement completes only after qualified absence and retains the cleanup ID in an empty journal. [Record loading](../../src/installer/lifecycle/plans.ts) validates the original plan, repair plan and at most one immediate predecessor. The source trace is `.audit/probes/cursor-local-recovery-flow.md`.

The existing [private local installer](windows-local-execution-acceptance.md) supplies rooted captures, physical approvals, identity-bound moves and retained worker identities. Normal execution refuses unexpected staged or retired roles. The missing capability is a freshly reviewed cleanup of those known owned roles.

## Synthesis decision

| Candidate | Interface and consequences | Decision |
| --- | --- | --- |
| Continue the interrupted LocalSlot recipe under a new review | Repair can install or restore a plugin, so it needs a desired completion, ownership receipt and journal revision contract beyond the existing absence result. It also couples repair to normal recipe phases. | Reject for this contract. |
| Review cleanup to absence through the existing repair operation | Installer owns role admission, the observed basis, worker quiescence, archival moves and settlement. The caller keeps the existing plan/apply workflow. | Select. |

The selected design adds no caller-managed stages, force flag or separate Cursor SDK. LocalSlot owns pure role policy; LocalInstallation owns capture and moves; the existing repair lifecycle owns review, one-shot execution, replay and journal settlement. The compiler continues to supply the same approved package format.

## Pure policy

Extend [LocalSlot](../../contracts/LocalSlot.ts) with `Role` and `CleanupDecision` schemas. `cleanupLocalSlots(input: LocalSlot.Input)` returns completion, one role to archive, or a refusal. Its implementation shares the existing admission policy with normal slot advancement.

Admission requires a valid original operation and the existing role-specific ownership rules. Live can contain a complete previous or next package as allowed by that operation. Staged can contain its complete or verified partial next package. Retired can contain its complete previous package. Partial live or retired packages, unexpected identities and an install's retired package remain refused. No broader ownership rule is introduced for cleanup.

Unknown observations take precedence over unowned observations, followed by invalid operation identity and invalid role claims. Once admitted, archive staged first, then retired, then live. Completion requires all three roles to be absent. Each successful archival removes one nonempty role and preserves admission. Three successful archival steps suffice for every admitted input.

The executable Lean definition and twelve LC obligations live under [LocalSlot/Cleanup](../../spec/PluginSdk/Installer/LocalSlot/Cleanup/Properties.lean). They specify refusal, exact completion, useful progress, role selection, preserved admission, strict decrease, bounded completion and archive order. The existing LS obligations remain unchanged.

## I/O integration contract

LocalInstallation's private repair inspector derives the original operation from the retained `ReadyPlan`, captures all three roles and their approvals, and evaluates cleanup admission. Its fingerprint covers the complete physical captures and the original target and operation. Generic repair planning supplies the quiescence requirement. The selected integration binds this snapshot through the existing public repair review.

The existing transaction worker receives the reviewed repair plan. LocalInstallation loads the original ready plan from retained storage using the interrupted-plan binding. The shared plan loader validates its commitment, ID and target; the local service validates the review and its supported shape before capture. Under the caller's existing installation lease, it compares fresh captures with the reviewed basis, requests one cleanup decision, and moves that exact physical root into a fresh SDK history path. It retains package bytes, rechecks all roles after the move and repeats for at most three roles.

| Execution candidate | Ownership and interface | Decision |
| --- | --- | --- |
| Expand the prototype's separate local child protocol | Adds another repair request shape carrying the original plan and another retained process lifetime. | Keep only as prior component evidence. |
| Use the established transaction worker | The worker owns the installation lock and publishes its current-process owner record before direct I/O, as in existing project installation. LocalInstallation owns original-plan lookup. The request protocol remains unchanged. | Select for integration. |

Direct filesystem work is protected by the transaction worker's lock-owner ledger and scoped I/O. The execution witness separately tracks command children; its `prepared` value alone is not evidence that no direct writer exists. A new request must acquire the lock and pass the prior-owner check before inspection. Native qualification must exercise this combined ownership rule. The prototype's extra local launcher can be retired after the integrated path passes its native checks.

History lies outside the client's scanned local-plugin directory. Archival never overwrites an existing directory and does not recursively delete package contents. A changed capture or failed move stops the worker and preserves the pending cleanup and remaining directories. Retrying the same repair only observes; a new mutation requires a distinct fresh review. Settlement still requires quiescent qualified absence.

The generic repair contract now includes a local residual and archival action. Existing marketplace and companion actions retain their semantics. Public Cursor admission follows isolated normal, drift and interrupted SDK lifecycles plus fresh client discovery.

## Verification order

1. Check the independent LC obligations and the executable Lean policy, including transitive axiom dependencies.
2. Exercise strict oracle vectors and malformed requests before implementing the TypeScript port.
3. Compare the port with Lean over valid and refused role combinations, while retaining the existing slot conformance checks.
4. Extend repair snapshot/action handling and its existing proofs before editing I/O.
5. Qualify exact archival, stale-review refusal, interrupted cleanup, replay, surviving writers and fresh installation on an isolated Windows host.

Lean proves the executable policy and modeled state transitions. Oracle comparisons provide empirical evidence for the handwritten TypeScript port. Native capture, physical moves, process observation and durability remain explicit runtime premises. A formal TypeScript refinement proof remains open.

## Checked policy

All twelve LC properties have closed Lean proofs. Main re-elaborates the seven project modules from source and checks every property's exact type and transitive axiom set. The proofs depend only on `propext` and `Quot.sound` from Lean's standard foundations.

The strict oracle matches 34 independently reviewed cases before the TypeScript implementation is written. The port then matches those cases and 8,640 generated combinations. Thirteen malformed requests fail at both wire boundaries. The same suite retains all 8,681 existing normal-installation comparisons and checks bounded cleanup of every admitted generated state. All seven tests pass. Scoped typechecking, lint and Effect diagnostics over the three changed TypeScript files report no errors or warnings.

The cleanup-policy evidence is `.audit/probes/cursor-local-recovery`. The generic repair extension is checked separately in `.audit/probes/cursor-local-repair`: all eight R properties have closed Lean proofs, including exact selection of the local archival action. Forty-two reviewed vectors and 75 generated comparisons agree with TypeScript. Twelve malformed requests fail at both boundaries before the TypeScript port is accepted.

The private LocalInstallation service now inspects recovery and archives admitted roles into history. It loads the retained original plan, rejects a changed review, rechecks all roles before each move and verifies that only the selected role disappeared afterward. Its source gate passes 48 focused tests, scoped typechecking, lint and strict Effect diagnostics. The [private target](cursor-sdk-target-acceptance.md) wires this service into Installer and passes the normal SDK lifecycle. The subsequent [native recovery gates](cursor-sdk-recovery-acceptance.md) qualify seven cases with 59 SDK requests and 35 actual repair comparisons with Lean, using the unchanged candidate. [Fresh Cursor discovery](cursor-sdk-ui-acceptance.md) now passes after actual SDK-managed install, update and removal. Production admission and caller coverage remain open. No public Cursor adapter or release-wide acceptance is claimed.
