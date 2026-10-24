# Interface design

pluginsdk lets an author describe a plugin once, build a package, inspect a proposed installation change, and apply that change. The caller learns the plugin's contents and the destination. Native manifests, registration commands, ownership records, and recovery stay inside the modules that own them.

The [organization design](organization-design.md) extends this foundation toward central management across existing application repositories. It separates plugin availability from backend tool authorization and preserves release provenance for future plugin/MCP code management. The internal [authorization](authorization-design.md) and [release catalog](catalog-design.md) contracts have proved pure behavior. `ReleaseCatalog` retains verified plugin packages and reviewed MCP contracts, with digest-pinned import through existing infrastructure. `Distribution` reviews and applies retained plugin releases across qualified local destinations. Workspace administration and backend enforcement remain planned.

Effect Schema defines the interfaces and types. [Lean](../../spec/README.md) models the pure contracts; oracle conformance compares their TypeScript implementations. The [LDD ledger](ldd.md) and [current consolidation acceptance](prelaunch-consolidation-acceptance.md) record the checked obligations and execution evidence. Node layers supply source capture, local storage and qualified native execution. Formal TypeScript refinement remains unproved.

## Caller shape

An author maintains one JSON definition:

```json
{
  "id": "team-kit",
  "version": "0.1.0",
  "description": "Shared review skills and documentation tools",
  "skills": ["skills/review"],
  "mcp": {
    "docs": { "url": "https://docs.example.test/mcp", "headers": { "X-Tenant": "public-tenant" } }
  }
}
```

`pluginsdk build definition.json` builds both clients. The SDK remains available for applications that embed compilation and reviewed installation through Effect:

```ts
import { Effect } from "effect"
import { Compiler, type BuildRequest } from "../contracts/Compiler.ts"
import { Installer, type Destination, type ReviewedPlan } from "../contracts/Installer.ts"

declare const request: BuildRequest
declare const destination: Destination
declare const reviewed: ReviewedPlan

const preview = Effect.gen(function*() {
	const compiler = yield* Compiler
	const installer = yield* Installer
	const bundle = yield* compiler.build(request)
	return yield* installer.plan({
		destination,
		intent: { type: "present", bundle }
	})
})

const apply = Installer.use((installer) => installer.apply(reviewed))
```

`Planning` distinguishes `ready`, `repair_ready`, `unchanged`, `blocked`, and an earlier `pending` operation. `apply` accepts `ReviewedPlan`, the union of ordinary `ReadyPlan` and cleanup `RepairPlan`. Removing a plugin uses an `absent` intent with its `PluginId`. A `repair` intent additionally identifies the current pending plan for a fresh cleanup review.

The authoring value is plain schema-defined data. `PluginDefinition` is derived from `Plugin.Encoded`, so strings remain ergonomic in configuration. The input seam decodes that value with `Plugin` before it reaches the compiler. Internal `Plugin` values carry the validated brands and URL values.

`Plugin.skills` lists directories relative to the source root. Each directory already contains `SKILL.md` and its supporting files. `Plugin.mcp` names remote HTTP or bundled stdio servers. Strings remain literal; explicit environment references name a runtime source. Supported formats preserve the requested meaning and unsupported formats reject it. The [compiler contract](compiler.md) specifies compatibility, package-file references and generated launchers.

## Alternatives and synthesis decision

The comparison applies Matt Pocock's codebase-design vocabulary: a deep module hides substantial knowledge behind a small interface. The main thread compared the designs because architecture and final judgment belong to the orchestrator.

| Candidate | Caller interface | Depth and locality | Decision |
| --- | --- | --- | --- |
| One resource graph | Construct resources, then `deploy(graph)` | Convenient for immediate deployment. Packaging, review, and native changes become coupled. There are no demonstrated resource dependencies to justify a graph yet. | Defer the graph. |
| Exposed pipeline | Load, validate, resolve, render, stage, register, verify | Makes callers coordinate native ordering, cleanup, and recovery. Changes spread across the pipeline. | Reject. |
| Two deep modules | `Compiler.build`; `Installer.plan` and `Installer.apply` | Compilation owns package semantics. Installation owns the full native lifecycle. A package can be built and distributed without opening a host. | Select. |

The split follows knowledge ownership. The build artifact is independently useful, so `Compiler` earns its seam. `Installer` keeps planning and execution together because both depend on the same ownership and recovery rules. Deleting either module would force that knowledge into callers.

Organization release history has a separate lifetime from a local installation. The [catalog comparison](artifact-design.md#caller-and-synthesis-decision) selects a third deep module rather than extending Installer intents or exposing a verification/storage pipeline. Plugin authors still use the same definition and build command. Managers use `ReleaseCatalog` to retain complete approved releases independently of any installed client.

The [distribution comparison](distribution-design.md#candidates-and-synthesis-decision) selects a fourth module. `Distribution.plan/apply` owns package selection, complete multi-destination review and durable independent outcomes. It uses the catalog and Installer without making managers coordinate their loops and recovery. Its [CLI](../distribution-usage.md) adds no setup file to the authored plugin.

Claude Code and Codex justify internal host-specific commands and inspection because their formats and loaded paths differ. Those details stay inside `Installer`; the design adds no public provider framework or resource graph.

## Module ownership

| Contract | Owns | Hides |
| --- | --- | --- |
| [Plugin](../../contracts/Plugin.ts) | Authoring data and lexical package paths | No behavior. It reuses existing skill content. |
| [Compiler](../../contracts/Compiler.ts) | Source containment, skill validation, target rendering, collision policy, package identity | Directory traversal, manifest encodings, transport spelling, canonical file ordering |
| [Installer](../../contracts/Installer.ts) | Native inspection, physical installation identity, saved plans, ownership, mutation, recovery | Host commands, durable records, serialization of conflicting changes, process lifetimes |
| [ReleaseCatalog](../../contracts/Registry.ts) | Verified plugin/MCP release admission, pinned artifact import and exact content acquisition | Private snapshots, bounded HTTP acquisition, archive verification, package-version extraction, package/contract binding, locking, atomic storage and strict retained-data validation |
| [Distribution](../../contracts/Distribution.ts) | One release's complete review and independent destination outcomes | Compatible-format selection, duplicate detection, canonical identities, private plans, durable progress, retry eligibility and native recovery coordination |
| [Lifecycle](../../contracts/Lifecycle.ts) | Pure installation decisions and the NDJSON oracle contract | No filesystem, subprocesses, clock, random IDs, or host discovery |
| [CompilerModel](../../contracts/CompilerModel.ts) | Pure rendering, bundle checks, and their oracle contracts | Source I/O, raw bytes, YAML parsing, JSON encoding, and hashing |

`Lifecycle`, `CompilerModel`, `Assembly`, `Repair`, `Authorization`, `Catalog`, `Artifacts`, `ToolContract`, `Process`, `Launcher`, `Mcp`, `Hooks` and `DistributionModel` are internal model contracts. Product callers use `Compiler`, `Installer` and the manager-facing `ReleaseCatalog` and `Distribution`. The repair model defines reviewed cleanup decisions; `Installer` supplies qualified native inspection, durable retention and execution. Authorization describes a decision over trusted service evidence; it adds no authentication or policy-deployment adapter.

### Source ownership

Pure decisions live beside the capability that uses them. A feature's `model.ts` contains its pure policy; its other files handle rendering or I/O. Shared file admission policies live under `src/internal/files`. The public entry points and Effect schemas retain their existing interfaces.

| Owner | Internal capabilities |
| --- | --- |
| `src/compiler` | `source`, `package`, `agents`, `hooks`, `mcp`, `process` |
| `src/installer` | `target`, `lifecycle`, `recovery`, `local`, `project`, `companions`, `execution`, `hosts`, `payload`, `runtime`, `windows` |
| `src/catalog` | Release admission, `artifacts`, reviewed `tools` |
| `src/distribution` | Selection, planning, execution and retained outcomes |
| `src/project` | Author builds, publication and local preview |
| `src/internal` | Shared file policies, native Windows file operations, process observation, record storage, identity and serialization |

Feature directories expose no new forwarding barrels. Existing Lean properties, oracle vectors and TypeScript conformance tests continue to cover the same pure functions.

The [managed storage design](managed-storage-design.md) shares scoped record locks and Windows process-owner admission across Catalog, Distribution and Installer. Domain schemas and errors stay with their modules. Native manager qualification remains separate from source integration.

## Compiler interface

`build` reads its source root and returns a complete `Bundle` in memory. It writes no package directories and performs no installation. The bundle includes every output file's bytes and executable bit. It contains no references back into the source tree.

`Directory` means a nonempty directory reference. It does not assert existence or canonicalization. `PackagePath` rejects lexical escapes; the compiler must also resolve symlinks and equivalent filesystem links. Every consumed source file must remain inside the resolved source root. Output paths must satisfy the rendering format's collision rules. Installation also checks the actual host's path aliases.

`Compiler.Format` reuses `PackageClient`: `claude_code | codex`. Each client has one current representation. Claude emits `.claude-plugin/plugin.json`; Codex emits `.codex-plugin/plugin.json`; both use `.mcp.json`. Native rendering and validation belong behind `Compiler`. The [compiler contract](compiler.md) records the native documents and their encodings. There is no development-generation selector or legacy renderer.

`BuildRejected` reports invalid metadata, skills, process references, collisions, containment violations, or an MCP definition the client cannot preserve. `SourceUnavailable` reports source I/O failures. Current packages support remote and bundled MCP, the two implemented command-hook events and shared agents. Bundled processes and hooks use the shared portable runtime. Unsupported semantics reject explicitly.

For identical source bytes, executable bits, authoring data and client format, the bundle is identical. The digest commits to the format and the canonical sequence of path, executable bit and content. [Identity encoding](identity.md) defines the hash inputs. The [compiler contract](compiler.md) specifies rendering rules. Compiler tests cover byte materialization and hashing; Lean compares symbolic identities and does not prove SHA-256 or filesystem behavior.

Build memory is proportional to output size. Streaming is deferred until a real package requires it. Bundle byte arrays can be mutated by JavaScript callers. `plan` and `apply` capture private byte snapshots before asynchronous work; every subsequent check and write uses that snapshot. [Bundle acceptance](bundle.md) specifies the checks and proof limits.

## Installer interface

`Destination` names a host, an explicit host home, and either user scope or a project root. The home is the host configuration root interpreted by its adapter profile. Planning resolves these paths physically. `Target` records the canonical destination, native version, adapter profile revision, plugin identity, and physical installation key. Equivalent path aliases must resolve to the same key. Shared host catalogs also require serialization inside `Installer`.

The host enum names product intent, not implemented support. Host, platform, scope, package format and required capabilities must select a unique adapter contract. Missing or ambiguous support fails with `DestinationUnsupported`. The observed application version is diagnostic evidence; it is not an admission allowlist. Real runtime prerequisites still apply. The [compatibility contract](compatibility-design.md) defines selection and ownership identity.

Cursor's Windows x64 user adapter selects the current Claude package for skills, assets and MCP. It rejects hooks and agents. Its current [author workflow](cursor-author-current-acceptance.md) and [Windows manager workflow](windows-manager-current-acceptance.md) have native acceptance. The [installed-runtime observation](cursor-discovery-acceptance.md) distinguishes missing and broken installations without requiring an existing Cursor home. Exact binary pins identify test evidence, not compatibility policy.

Grok Bot and Meta Muse receive `DestinationUnsupported` until their installation and inspection contracts are established. Meta Muse Code is a separate product.

Planning validates a present intent's package before inspecting a host. It returns `BundleRejected` for a digest mismatch, invalid path sequence, or invalid native package. An absent intent has no package to validate. Planning then reads native state and SDK records. It may store its own immutable plan, but changes no host registration or installed payload. A ready plan's change is `install` or `replace` with a complete bundle, or `remove` with no bundle. The resolved target supplies the plugin identity. This shape cannot pair an installation change with an absent intent. Applying a plan never rereads the authoring tree.

`PlanId` commits to `PlanBody`, including the target, native profile, before-state, and proposed change. The ID itself is outside that body. It provides integrity and replay identity. Applications own the act of reviewing and invoking `apply`.

Before mutation, `apply` decodes the plan, checks its commitment and bundle digest, resolves the physical target again, inspects fresh state, and recomputes the decision. It also validates native package conformance, path uniqueness, and agreement between the target plugin and bundled plugin. The compiler owns those package validation rules for reuse inside the implementation. Changes to physical identity, adapter contract or reviewed before-state reject the plan. A version-only observation change preserves eligibility; retained commitments remain exact. Deserialized schemas establish shape; these checks establish semantic validity.

Ownership requires an SDK receipt and an observation that matches it. A matching bundle without a receipt remains unowned. `Fingerprint` covers every native fact needed to authorize the change, including registration, activation, payload identity, and managed metadata. An incomplete inspection yields `unknown`; it never means `absent`.

`Observation.identity` records a verifiable plan marker and payload digest. Reading an arbitrary marker alone establishes no ownership. A host adapter must show that the registered installation points to the SDK-controlled payload and that the payload matches its digest. That qualification needs native integration evidence before the adapter can apply changes.

## Mutation and recovery

The pure protocol is specified in [LDD](ldd.md). Its execution order is part of the interface:

1. Serialize access to the physical installation and shared host records. Recheck the plan.
2. Persist `Pending` and the full approved plan durably.
3. Perform the single native change authorized by `begin`.
4. Inspect actual state and call `settle`.
5. Persist the resulting journal before returning a completed result.

A retry of a pending plan performs inspection and settlement. It never repeats the native change. `Planning.pending` returns the retained plan so the caller can resume it after a restart. A different plan cannot replace a pending operation. The pure repair model also makes a retry of the current cleanup inspection-only. A new cleanup requires a distinct reviewed plan ID.

An observed desired state completes only when its operation identity and payload match the pending plan. A proven unchanged before-state completes as `not_applied`. Ownership stays the same, and the journal retains the attempted plan, change, and before-state. Other observations retain `Pending` and return `uncertain`.

A complete observation also requires evidence that an earlier native command can no longer commit later. An orphaned process or an asynchronous registration with an unknown outcome yields `unknown`, even if current files look unchanged. That state blocks new changes.

The separate [repair review contract](../../contracts/Repair.ts) allows a fresh cleanup review only for quiescent proven absence or an orphaned owned marketplace with no installed plugins or configured consumers. Proven absence authorizes no native command. The marketplace residual authorizes only marketplace removal. The durable record retains the full original operation and current cleanup plan. [Explicit repair](repair-design.md) defines its ownership checks, bounded predecessor validation and crash behavior.

Completed removals retain the last plan ID as a tombstone. Completed installations retain it in their receipt. Completed attempts that made no change retain it in `not_applied`. A retry acknowledges the latest completed operation while native state still matches its recorded outcome. `not_applied` means the requested change did not happen; callers must distinguish it from installed or removed completion.

## Journal revision decision

The first draft restored the previous journal when a native attempt left the before-state unchanged. That lost the attempt's ID. Reapplying the same reviewed plan could then start the native change again, contradicting completed replay.

| Alternative | Consequence |
| --- | --- |
| Retain every completed plan | Supports historical result lookup but makes unbounded completion history part of the interface. |
| Retain the latest outcome and a revision | Keeps the journal bounded. The latest plan can be acknowledged; older plans fail their before-state check. |

The design selects the revision. `Snapshot.revision` is the latest completed plan ID, or `null` initially. It is independent of the installed payload's identity: a failed replacement advances the journal revision while ownership remains with the previous receipt.

Every ready decision carries its before-snapshot. Unchanged and blocked decisions carry their current snapshot. `Installer` forwards those values; it does not reimplement the journal projection.

| Trace | Specified result |
| --- | --- |
| Plan A finishes without establishing its change | Record A as `not_applied`, preserve ownership, and advance the revision to A. |
| Apply A again against that same native state | Return `not_applied` without another native change. |
| Plan the same desired state again | The new before-state includes revision A, so its content-derived plan ID differs from A. |
| Apply an older plan after a later completion | Reject its old revision even if native files have returned to the same contents. |

The latest completed ID never starts a native change again. This is a bounded replay guarantee. The interface promises no automatic rollback or exactly-once behavior from a third-party process.

`DestinationUnsupported`, `HostUnavailable`, `StateUnavailable`, and `PlanRejected` are expected errors before a host mutation. Once a pending operation is durable, failures must preserve recoverability. A quiescent, unchanged before-state can finish as `not_applied`; an unresolved outcome returns `uncertain`. Interruption or a defect may terminate the fiber and leave the durable operation for the next invocation. Neither interruption nor a defect can be reported as completion.

`plan` and `apply` operate on one plugin at one destination. They do not claim atomicity across hosts. Package validation does not establish fresh session discovery, MCP authentication, or tool usability. Those need separate host checks.

## Design status

- Ground: previous contents archived; live lcode LDD guidance and current Effect documentation inspected.
- Sketch: alternative caller interfaces compared; Effect schemas, Lean model types, and formal property obligations written.
- Agree: this design is the review artifact requested by the user.
- Model: lifecycle, rendering, bundle-check, assembly, repair, authorization, catalog, package binding, tool-contract binding, process, quoting, launcher, MCP composition, hooks, distribution, native compatibility, agents and companion ownership have 135 proof certificates. The earlier 119-property audit and the new 16-property audit passed separately. The Lean oracle, matching vectors and conforming TypeScript ports exist.
- Implement: byte compilation, bundled stdio, shared agents, qualified native integrations and explicit repair exist. The strengthened lstack lifecycle pilot passed on Claude Code 2.1.304 in user and project scopes and Codex 0.163.0 in user scope. The [examples](https://github.com/lucasacoutinho/pluginsdk-examples) demonstrate one maintained skill, MCP server or agent on both clients. [Acceptance](acceptance.md) records qualifications and remaining limits.
- Scrap: revise a contract when a Lean counterexample or native evidence contradicts it.
