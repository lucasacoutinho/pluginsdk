# Delivery roadmap

PluginSDK has not launched. There are no installations or released contracts to migrate. The first release establishes the compatibility baseline.

The [first-release completion plan](launch-plan.md) defines the finite backlog and its acceptance conditions. The [package and client design](prelaunch-consolidation.md) records the selected consolidation. Historical experiment requirements do not add scope to this release.

## Remaining first-release work

1. Consolidate prelaunch format identities into one current Claude and one current Codex representation. Remove superseded compiler paths.
2. Select client contracts by required capabilities, platform and scope. Keep version restrictions for actual minimums or known incompatibilities, and pin test binaries for reproducibility.
3. Remove obsolete persisted-format readers. Preserve corruption, ownership and provenance checks.
4. Verify ordinary author and manager workflows against the current contracts using realistic examples.
5. Finish Cursor default and explicit preview, import-preference handling and native author/manager acceptance.
6. Finish the Windows Catalog → Distribution → Installer lifecycle across two generations, including interruption, repair, replay and removal.
7. Align documentation and land reviewed, coherent implementation commits with scoped acceptance evidence.

Each behavior change follows property, checked Lean construction, oracle, pure TypeScript conformance, then I/O and native checks. Main reviews worker artifacts and verifies acceptance before landing.

## Evidence and landing

The existing [pilot](pilot.md) and [alpha acceptance](acceptance.md) retain the remote baseline's evidence. Later compiler, installer, Cursor and Windows component records remain in the development checkout until their owning changes land. A component result establishes its own checkpoint; changed packages, compatibility policies and callers need their required new evidence.

Commits, pushes and PR merges are authorized. Keep the active implementation checkout intact and use isolated integration branches. Review each actual diff, record its checks and limitations, and verify the accepted head before merging. Planning documents do not qualify unmerged implementation.

## Deferred and external work

CI work, package-consumer acceptance and full release gates remain deferred. Existing repository workflows can run on pushed PRs. Registry publication, public visibility, release tagging and external deployment remain deferred; keep the repository private and MIT.

macOS has no available host. Grok native testing and third-party authentication remain deferred. Meta Muse has no verified management contract. Windows source symbolic-link qualification needs privileges unavailable on this host.

Organization administration, audiences and deployed reader/admin/revocation acceptance need actual workspace, identity-provider and service inputs. ChatGPT and Claude Desktop/web require their own qualification. Source management, hosting, further hook events and further agent controls remain future scope.

The [launch plan](launch-plan.md) separates external and deferred work from actionable completion. Lean model proofs, oracle comparisons and native observations remain separate evidence; formal TypeScript refinement remains unproved.
