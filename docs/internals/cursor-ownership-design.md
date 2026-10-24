# Cursor local package ownership

The native [local lifecycle check](cursor-local-lifecycle.md) establishes that Cursor reads an unchanged SDK-built package from its user-local plugin directory. The SDK still needs to publish that directory safely and recognize interrupted changes. Keep this work inside the existing Installer.

## Usage

Authors keep their definition, skill files and existing MCP program. The intended commands remain `pluginsdk build`, `pluginsdk preview` and `pluginsdk publish`. A qualified Cursor destination selects a compatible existing Claude package; it does not require another authoring file or an `sdk.ts` wrapper.

Managers continue to use `Installer.plan/apply` directly or through Distribution. The eventual Cursor user destination identifies its explicit `.cursor` configuration home, just as other destinations identify their host configuration home. Cursor is not yet a valid public target in this slice.

## Existing flow and constraints

`Installer.plan` resolves a physical target, locks it, reads the durable journal, obtains an observation and calls the pure lifecycle decision. A ready plan commits the target, before-state and complete package. `apply` resolves and locks again, checks fresh state with `begin`, records pending execution, runs one recipe and settles from a fresh observation. Unknown outcomes remain pending. Ownership and replay policy belong to the [existing lifecycle model](../../src/installer/lifecycle/model.ts).

Ordinary Claude and Codex recipes change native marketplace registration. Codex project scope instead prepares immutable package directories and activates them through a reviewed config edit. Its directory commit renames into an absent destination; it does not replace an occupied directory. Cursor's native local directory has no registration switch. A replacement therefore needs explicit states between retiring the old directory and publishing the new one. The source trace is `.audit/probes/cursor-local-ownership/installer-flow.md`.

Preserve the four modules selected in [the product design](design.md). ReleaseCatalog retains approved releases independently of installation; Distribution retains destination reviews and outcomes. Client preferences remain separate from backend authorization. The ownership policy below operates on approved package identities and does not authenticate a user or grant a tool.

## Shape

One private Installer component owns three directory roles: live, staged and retired. Only live sits in Cursor's scanned `plugins/local` directory. Staged and retired use stable paths in the installation's private storage on the same physical filesystem. Stable roles let an observer detect residual state without another active-operation pointer. Fresh allocations and archived history remain outside those roles. Claims and journals stay outside the unchanged package tree.

Discard actions move verified retired packages or partial stages into immutable SDK history outside the client's scan path. They do not recursively delete a directory during the transition. This preserves the model's absent role after an interrupted move; physical garbage collection is separate.

Each observed directory is absent, unknown, foreign, a verified complete package or a verified partial package. A verified claim binds the installation key and exact plan/bundle identity. A basis fingerprint retains the physical observation for the later I/O recheck. A partial package means that I/O has proved ownership of the directory and that its entries are a proper subset of the approved package. A missing marker or a similar pathname is insufficient.

The operation is install with a next identity, replace with previous/next identities, or remove with a previous identity. A replacement must use a different plan identity. These variants avoid optional previous/next fields. The [Effect schemas](../../contracts/LocalSlot.ts) own the types and wire contract.

`advanceLocalSlot(input)` is a total pure decision. It returns one action, completion or a refusal. It checks unknown observations first, then foreign claims, ambiguous operation identity and drift. Live can contain the operation's previous or next complete package; staged can contain only its next complete or verified partial package; retired can contain only its previous complete package. Other combinations refuse execution.

| Operation and observed state | Next action |
| --- | --- |
| Install: live/staged/retired absent | Prepare the next package privately. |
| Install: live absent, staged next, retired absent | Publish staged into the absent live slot. |
| Replace: live previous, staged/retired absent | Prepare the next package privately. |
| Replace: live previous, staged next, retired absent | Move live to retired. |
| Replace: live absent, staged next, retired previous | Publish staged into live. |
| Replace: live next, staged absent, retired previous | Discard the verified retired package. |
| Remove: live previous, staged/retired absent | Move live to retired. |
| Remove: live/staged absent, retired previous | Discard the verified retired package. |
| Install/replace: initial live state, staged partial next, retired absent | Discard only the verified partial stage, then prepare again when authorized. |
| Desired live state reached, staged/retired absent | Complete. |

The model adds no public staging API. The later I/O operation captures the three observations, asks for one step, rechecks the captured basis and performs that step. Installer retains approval, locking, writer quiescence and settlement. The policy does not authorize a generic retry loop or rollback.

## Synthesis decision

Choose direct local publication through Installer. It hides the package layout, claim checks, directory roles and interrupted states behind the same plan/apply surface. Reuse the current lifecycle decisions, package validation, payload materialization, immutable plans and execution ownership. Add only the local directory transition policy before implementing its I/O.

The alternative is a native marketplace adapter: register an SDK marketplace and let the client install from it. This hides directory mutation well, but the inspected Cursor Agent CLI supplies marketplace management without a standalone local plugin installation contract; listing requires an account, and its authless route needs an unavailable runtime. It does not satisfy the observed IDE local workflow. The [terminal premise](cursor-agent-premise.md) records those limits.

A stable link to immutable SDK revisions would make activation smaller, but the accepted loader evidence covers real package directories. Link privileges and loader behavior would add new host premises. Do not add that dependency to this design.

## Properties and acceptance

1. LS1: any unknown directory prevents an action or completion.
2. LS2: foreign content or a mismatched installation key prevents an action or completion.
3. LS3: an action or completion requires an unambiguous operation and claims valid for their directory roles.
4. LS4: retirement requires the complete previous live package; replacement also requires the complete staged next package.
5. LS5: publication requires an absent live slot and the complete staged next package.
6. LS6: retired cleanup requires the desired live state and the complete retired previous package.
7. LS7: partial cleanup is confined to the verified next stage while the initial live state remains intact.
8. LS8: preparation requires an absent stage and retired slot while preserving the initial live state.
9. LS9: completion is exactly the desired live state with no staged or retired package.
10. LS10: every canonical state after preparation, retirement, publication or cleanup selects the next stated step; a partial stage selects its confined cleanup.
11. LS11: reusing a plan identity for replacement is refused.

Prove these properties in Lean, expose the strict NDJSON oracle, then compare the schema-derived TypeScript decision with that oracle, including foreign, partial, stale and unknown observations. Only then edit I/O. Native qualification must separately establish physical claims, complete/subset payload checks, directory mutation semantics, basis rechecks, quiescence and interrupted outcomes. Lean does not prove those filesystem facts or the hash implementation.

## Pure model acceptance

The [Lean proofs](../../spec/PluginSdk/Installer/LocalSlot/Proofs.lean) establish LS1–LS11. The strict oracle passes 41 reviewed vectors before the [TypeScript model](../../src/installer/local/slots.ts) is implemented. Its [conformance tests](../../test/local-slot.test.ts) compare those vectors and 8,640 generated combinations with Lean, and reject eleven malformed requests at both wire boundaries. All three tests pass. Scoped typechecking, Effect diagnostics over the three changed TypeScript files and lint report no warnings or errors.

The private record is `.audit/probes/cursor-local-ownership/pure-main-accepted.json`. It retains the proof, oracle and TypeScript ordering and exact check inputs. Product I/O was unchanged at that checkpoint.

The [Windows directory primitive](windows-directory-move-acceptance.md) now qualifies identity-bound publication into an absent destination, overwrite refusal, retained-parent admission and interruption before/after the native move. All 25 native cases pass, including the affected managed-file encoding path.

The [package classifier](local-package-claims.md) adds eleven proved properties and 6,022 TypeScript/oracle comparisons for physical root binding, complete contents and proper subsets. Its strict boundary checks reject 28 malformed requests. The [Windows package reader](windows-package-reader-acceptance.md), [durable claims](windows-physical-claims-acceptance.md), [rooted lifecycle observation](windows-local-observation-acceptance.md) and [private local installer](windows-local-execution-acceptance.md) pass their component gates. Target integration and explicit local recovery remain next, followed by normal and interrupted SDK lifecycle checks.

The private implementation checklist is `.audit/probes/cursor-local-ownership/checklist.md`. Public Cursor admission remains gated on the I/O and isolated native checks. macOS, third-party authentication, CI, package-consumer and release-wide work retain their existing deferrals.
