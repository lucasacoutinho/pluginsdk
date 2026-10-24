# First-release completion plan

PluginSDK has not launched and has no installations to migrate. The first release establishes its compatibility baseline. This plan reconciles Lucas's session decisions, the current checkout, and the launch-readiness review in thread `01a16f02-ca3d-75d1-aa1c-a9200a09d327`.

The intended release contains Compiler, Installer, ReleaseCatalog and Distribution and the author commands. It builds skills, assets, remote and bundled MCP, the two implemented hook events, and shared agents for Claude Code and Codex on Linux and Windows x64. Cursor's Windows user adapter reuses compatible Claude packages; requested semantics it cannot preserve must fail explicitly. Additional features and client surfaces do not enter this release merely because an old roadmap mentions them.

Implementation and native evidence from the development checkout land through separate reviewed PRs. This plan does not qualify the current remote code for those features.

## Actionable backlog

Complete these entries in order. An entry closes only after main-thread review of the actual implementation and its required evidence.

| ID | Work | Acceptance | State |
| --- | --- | --- | --- |
| L1 | Reconcile scope and preserve the checkout. | One finite plan; explicit deferrals; baseline source and index hashes; old native evidence remains immutable. | Recorded in this file and `.audit/probes/prelaunch-consolidation/baseline.json`. |
| L2 | Consolidate prelaunch package formats and compiler paths. | One current Claude format and one current Codex format; current portable runtime; no old-format aliases or fallback renderers; deterministic complete bundles and meaningful rejection checks. Follow Lean proof, oracle, pure TypeScript conformance, then I/O. | Open |
| L3 | Replace exact client-version admission. | Documented client contracts, actual package requirements and platform/scope select support. Version strings alone do not block compatible upgrades or stale an otherwise valid plan. Preserve physical identity, ownership, drift, pending-operation and feature checks. Keep binary pins in test evidence. | Open |
| L4 | Remove obsolete persisted-format readers. | One current catalog representation; no prelaunch migration or legacy-read branches; strict invalid/corrupt-state refusal and immutable admission still work. | Open |
| L5 | Verify the current author and manager interfaces. | Scoped compiler, CLI, catalog, distribution and installer checks pass; realistic examples use one definition; build and publish derive destinations from configuration; preview uses local installations. No caller must assemble the internal pipeline. | Open |
| L6 | Finish Cursor author workflows. | Fresh isolated native default and explicit preview; install/update/remove; import-enabled routing yields exactly one source and 34 distinct pilot skills; disabled imports retain direct installation; actual preference and fresh discovery agree. Bind evidence to the new implementation. | Open |
| L7 | Finish the Windows manager workflow. | Actual compiled Catalog → Distribution → Installer commands exercise two pilot generations across separate Claude, Codex and Cursor homes; install/update/remove, completed replay, interruption, settlement and explicit repair preserve independent outcomes and unrelated state. Fresh client discovery confirms results. | Open |
| L8 | Align user documentation and examples. | Getting started, authoring, build/preview/publish, manager workflows and compatibility describe enabled behavior accurately. Current instructions contain no exact-version allowlist or old format selection. Internal proofs and experiment history stay under internals. | Open |
| L9 | Prepare and land one reproducible candidate. | Review coherent changes on isolated branches; bind source, dependencies, emitted artifacts and scoped checks to each PR head; land accepted commits while preserving the active checkout. Record remaining release gates. | Open |

The real lstack pilot, installer ownership/recovery, existing Claude/Codex native feature lifecycles and the accepted source layout are prior evidence to preserve, not tasks to restart. Changes to their contracts require focused new evidence. Shared Windows record storage already passed thirteen native cases; its local receipt at `.audit/probes/managed-windows-storage/acceptance.json` qualifies that component. L7 still requires the complete manager workflow.

## Deferred work and external dependencies

| Item | Disposition |
| --- | --- |
| CI, full `npm run check`, package-consumer and release-wide gates | Explicitly deferred by Lucas. Scoped feature checks remain required. |
| Registry publication, public visibility, release tagging and external deployment | Remain deferred. Repository and package remain private, with MIT licensing. |
| Authenticated external Git publication and third-party MCP authentication | Deferred; existing local Git and loopback evidence does not qualify authentication. |
| macOS | Deferred; no native host is available. |
| Grok Bot native qualification | Explicitly deferred. |
| Meta Muse | No verified management contract or available acceptance target. Remains unsupported. |
| ChatGPT and Claude Desktop/web organization administration, audiences and deployed RBAC | Subsequent organization integration work. Requires actual workspace authority and identity/service inputs. Codex evidence does not qualify ChatGPT. Backend authorization stays separate from installation preferences. |
| Windows source symbolic links | External privilege prerequisite is absent. Junction evidence does not qualify symbolic links. |
| Additional hook events, agent controls, plugin/MCP source management and hosting | Future scope. Preserve release provenance and the extension direction over existing infrastructure. |

Lean certificates establish their stated models. Oracle conformance and native checks are execution evidence; formal refinement of the TypeScript implementation remains unproved. Keep that limit explicit rather than treating passing comparisons as a production proof. Power-loss behavior and arbitrary hostile filesystem races also remain outside the accepted premises.

## Execution rules

Commits, pushes and PR merges are authorized. Use isolated branches, review the actual diff and required scoped evidence, and verify the accepted head before merging. Keep unfinished implementation out of a landing candidate. Existing repository workflows can run on pushed PRs; full release acceptance remains a separate deferred gate.

Main owns architecture, quality and final acceptance. Bounded workers use Luna with max reasoning and no children. Preserve `.references` as found, concurrent work, old receipts and all protected native roots. Before native activity, review the current protected-root registry and the relevant STOP records. Unknown process quiescence never permits external reads or cleanup of a native root.

Track architecture phases for L2–L4: ground, compare whole designs, select, prove and port, integrate, then reassess against counterexamples. Update the backlog with exact evidence as work closes. Deferred items never receive a completed status.
