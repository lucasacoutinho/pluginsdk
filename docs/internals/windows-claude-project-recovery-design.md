# Windows Claude project recovery

The next gate qualifies interrupted SDK project operations for Claude Code 2.1.304 on Windows x64. The [normal query experiment](windows-claude-project-query-acceptance.md) supplies the external inventory contract. The public profile stays disabled until this gate and compiled project CLI qualification pass.

## Grounded flow

`Installer.apply` admits a request to a detached transaction worker. The engine acquires the home and project leases, writes a pending journal, executes the authorized operation once, observes the installation, and settles the journal. Recovery inspects that retained execution and native state. It must not run the operation again. Caller exit does not establish worker or native writer exit.

The existing Lean properties remain authoritative: lifecycle P7, P8, P9, P10, P11, and P13 cover settlement and replay; worker O3 covers accepted work after caller exit; writer Z6 through Z9 and Z11 through Z16 cover completion and identity; installation locks IL1 through IL4 cover ordered home and project subjects. This gate changes no business model, oracle, or public I/O implementation. The new native-output assertions are verification boundaries, checked against retained positive responses and altered negative vectors before integration.

The normal experiment established that B can list A's installation and its home marketplace. A reports `enabled` and `projectEnabled` as true. B reports both as false and retains A's `projectPath`. The classifier must validate that distinction, rather than require an empty inventory in B. User and B settings must remain byte-exact. A may change only the owned plugin selector and directory marketplace entries.

## Alternatives and decision

Adapting the entire user fixture would duplicate its process observer and repeat the settings correction already accepted for project scope. The selected design composes the frozen project-query fixture with a small pure validator of its raw A and B results. The wrapper adds only the `discover` export expected by the accepted recovery driver. Process admission, retained handles, terminal waits, query commands, payload checks, and settings capture remain byte-identical to the accepted project-query fixture.

The caller remains the same:

```ts
await discover(state, target, activeBundle, activePlan, "interrupted")
```

The private boundaries are:

```ts
// Frozen query-fixture.mjs owns I/O and exact process completion.
observeProjectQueries(state, target, bundleOrNull, planOrNull, label)

// project-discovery.ts validates the returned native metadata without I/O.
verifyProjectDiscovery(expectation, observed)

// fixture.mjs normalizes absent expectations and saves the validated result.
discover(state, target, activeBundle, activePlan, label)
```

The pure expectation is a tagged union: removed carries the owned selector, marketplace name, and distinct project roots; installed also carries the approved payload, marketplace and cache paths, version, and exact skill names. A matching installed result requires one owned project row tied to A in each query, enabled in A and disabled in B, with the approved source and cache paths. Both marketplace observations must bind the exact directory market. Removed results require the owned plugin and marketplace to be absent in both contexts. Extra unrelated inventory rows do not imply ownership. Path admission and equality use the existing Windows path model. The validator records metadata activation, without claiming model-driven skill or MCP invocation.

The driver retains the accepted caller, worker, checkpoint, ledger, and replay checks. Its project changes are physical target identity, project settings labels, and two independent lock probes. Claude project plans still have no SDK `plan.project` capture: Claude's native project commands own that settings mutation. The driver probes the home `writer.lock` and A's `.pluginsdk/installer/writer.lock` at the cut, after caller termination, and after exact worker completion. Both must remain held through caller exit and become available after worker completion.

Only the isolated candidate source receives the profile row, before/after execution checkpoints, and the accepted worker tracer. Reversing those additions must recover the current 150-file source snapshot exactly, including the corrected project lock implementation. No earlier engine copy may replace it.

## Acceptance

Seven serial cases cover before and after install, replacement, and removal, plus caller exit while the install worker survives. Before execution, recovery returns `not_applied` and preserves the old active state. After execution, it settles installation or removal from observed native state. Completed replay preserves the journal and configuration without another execution entry. The surviving worker settles after its caller exits.

Each case retains its journal, plan commitment, exact payload evidence, A and B inventory, configuration boundaries, process identities, completion waits, and both lock observations. The controller requires independent validation before another case. Unknown completion forbids stage inventory, reuse, and cleanup. Full compiled project CLI execution remains a separate subsequent gate. macOS, Grok native tests, third-party authentication, CI, and package/release-wide checks remain deferred.

## Work phases

- [x] Ground the worker, lock, journal, and native inventory flow.
- [x] Compare complete fixture designs and select composition.
- [x] Continue under the active milestone instruction.
- [x] Validate external-output vectors before integrating the wrapper.
- [x] Review candidate overlays and run scoped compilation and preflight.
- [ ] Run and independently validate all seven native cases.
- [ ] Revisit the design if a native counterexample changes its premises.
