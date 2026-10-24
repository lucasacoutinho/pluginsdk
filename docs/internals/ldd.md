# Lean-driven design specification

[Automatic build selection](portable-defaults-design.md) adds BF1–BF4 and brings the exact audit to 290 properties. All sixteen finite feature inputs agree between Lean, authored expectations and TypeScript; both decoders reject 33 malformed requests. This pure checkpoint precedes project integration and [CLI byte reproduction](portable-defaults-acceptance.md).

[Process-directory admission](process-directory-design.md) adds PD1–PD4 and brings its checkpoint to 286 properties. Its independent declaration relation, refinement to the existing runtime, 25 authored vectors, 288 generated comparisons and 16 malformed-wire pairs pass before Installer integration. [Integration and native checks](process-directory-acceptance.md) also pass both refusal paths and the complete Windows user lifecycle.

This follows lcode's LDD approach: state a property, prove a Lean 4 model, compile an oracle, and make TypeScript conform. The [Lean project](../../spec/README.md) registers the required properties and their proof certificates.

[Launcher runtime admission](launcher-runtime-admission.md) adds NR1–NR5 and brings the exact property audit to 282. Its [Lean contract](../../spec/PluginSdk/Installer/LauncherRuntime/Properties.lean), strict wire, 26 authored vectors and 444 generated comparisons precede installer I/O changes. Native SDK lifecycle qualification remains separate.

[Portable process evaluation](../../spec/PluginSdk/Compiler/Process/Portable/Runtime/Properties.lean) adds PR1–PR4 for paired capture decoding, refinement of the existing launcher evaluator, complete invocation preservation and refusal of missing sources. The [certificates](../../spec/PluginSdk/Compiler/Process/Portable/Runtime/Proofs.lean) pass the exact 277-property audit. Twenty-one authored vectors and 52 generated cases compare both implementations before runtime I/O. The [runtime design](portable-process-runtime-design.md) separates those guarantees from file access, child ownership and native client qualification.

[Installation lock selection](../../spec/PluginSdk/Installer/Locks/Properties.lean) adds IL1–IL4: user destinations select their home; project destinations select their home followed by the shared project. The [TypeScript model](../../src/installer/target/lock-policy.ts) matches the actual Lean oracle on 120 inputs across all four hosts and both scopes. The [acceptance record](installation-locks-acceptance.md) separates these proofs from real lock contention and Claude lifecycle evidence.

P1 through P14 cover lifecycle, B1 through B8 cover rendering, and V1 through V4 cover bundle checks. A1 through A7 cover assembly, R1 through R8 repair review, U1 through U8 authorization and C1 through C6 release admission and selection. The existing [TypeScript conformance suite](../../test/conformance.test.ts) compares its models with 4,210 oracle requests. Assembly, repair, authorization and catalog use separate suites. Repair checks 18 vectors and 40 generated requests; authorization checks 49 authored vectors, 120 generated combinations and a three-call revocation sequence; catalog checks 53 independent vectors and 192 generated requests.

The formal lifecycle contract is [Types.lean](../../spec/PluginSdk/Lifecycle/Types.lean) and [Properties.lean](../../spec/PluginSdk/Lifecycle/Properties.lean). The formal compiler contract is [Types.lean](../../spec/PluginSdk/Compiler/Types.lean), [Format.lean](../../spec/PluginSdk/Compiler/Format.lean), and [Properties.lean](../../spec/PluginSdk/Compiler/Properties.lean). Effect schemas provide their TypeScript representations.

[Project-file policy](../../spec/PluginSdk/Installer/ProjectFile/Properties.lean) states PF1-PF7 for platform-specific metadata admission and exact reviewed-basis comparison. Its [model](../../spec/PluginSdk/Installer/ProjectFile/Model.lean), [proofs](../../spec/PluginSdk/Installer/ProjectFile/Proofs.lean) and [strict wire](../../spec/PluginSdk/Installer/ProjectFile/Wire.lean) precede the [TypeScript port](../../src/internal/files/ownership.ts). Fifty-three authored vectors, 4,108 generated comparisons and 28 malformed-wire pairs passed before file I/O changed. The [acceptance record](project-file-acceptance.md) separates those guarantees from the measured Linux and Windows filesystem behavior and the pending full Windows Codex project lifecycle.

[Windows paths](../../spec/PluginSdk/WindowsPath/Properties.lean) specify filename admission, complete-name capacity and comparison of native path observations. WP15–WP20 constrain the extended DOS spelling accepted against an expected owned path. [NativePathProofs](../../spec/PluginSdk/WindowsPath/NativePathProofs.lean) proves these properties; [authored vectors](../../spec/vectors/native-paths.ndjson) include the retained Codex counterexample. The TypeScript model passed oracle conformance before the [native inspection change](native-path-design.md).

[DistributionModel](../../contracts/DistributionModel.ts) defines selection, planning and execution data. Its Lean contracts are [Selection](../../spec/PluginSdk/Distribution/Selection/Properties.lean), [Planning](../../spec/PluginSdk/Distribution/Planning/Properties.lean) and [Execution](../../spec/PluginSdk/Distribution/Execution/Properties.lean), with separate total models and proof certificates. [Distribution](distribution-design.md) connects those pure contracts to complete releases and native operations.

[Compatibility](../../contracts/Compatibility.ts) defines exact native profile selection and retained ownership. The [Lean properties](../../spec/PluginSdk/Compatibility/Properties.lean) state N1-N8 before the [model](../../spec/PluginSdk/Compatibility/Model.lean) and [proofs](../../spec/PluginSdk/Compatibility/Proofs.lean). The [design](compatibility-design.md) separates ownership compatibility from exact reviewed-plan freshness.

[Agent rendering](../../spec/PluginSdk/Compiler/Agents/Properties.lean) states G1-G8; [companion review](../../spec/PluginSdk/Installer/Companions/Properties.lean) states F1-F8. Each directory contains its own `Types`, `Model`, `Proofs` and strict `Wire` modules. The [agent design](agents-design.md) fixes their semantics and separates pure rendering/ownership from native discovery and filesystem writes. Authored [agent vectors](../../spec/vectors/agents.ndjson), [companion vectors](../../spec/vectors/companions.ndjson) and [dependent lifecycle vectors](../../spec/vectors/agent-lifecycle.ndjson) preceded their TypeScript ports and I/O integration.

[Lifecycle/Model.lean](../../spec/PluginSdk/Lifecycle/Model.lean) implements the total functions. [Lifecycle/Proofs.lean](../../spec/PluginSdk/Lifecycle/Proofs.lean) proves the existing obligations against that model without changing their statements. [Rules.lean](../../spec/PluginSdk/Lifecycle/Rules.lean) holds the independent specification relations and shared state projections.

[Compiler/Model.lean](../../spec/PluginSdk/Compiler/Model.lean) renders captured source content into copy references and native JSON objects, or rejects it with canonical issues. [Compiler/Proofs.lean](../../spec/PluginSdk/Compiler/Proofs.lean) supplies all eight compiler certificates. Supporting lemmas cover path construction, complete collision detection, JSON field meaning, headers, and enumeration independence.

[Compiler/Bundle/Model.lean](../../spec/PluginSdk/Compiler/Bundle/Model.lean) checks a bundle's claimed and supplied recomputed digest and its committed file paths. Its [proofs](../../spec/PluginSdk/Compiler/Bundle/Proofs.lean) establish acceptance and exact diagnostics. The [bundle contract](bundle.md) defines the projection, private snapshots, and checks outside this model.

[Compiler/Assembly/Types.lean](../../spec/PluginSdk/Compiler/Assembly/Types.lean) and [Properties.lean](../../spec/PluginSdk/Compiler/Assembly/Properties.lean) define the asset assembly contract and A1 through A7. [Model.lean](../../spec/PluginSdk/Compiler/Assembly/Model.lean) implements canonical ordering and exact collision diagnostics. [Proofs.lean](../../spec/PluginSdk/Compiler/Assembly/Proofs.lean) certifies those properties. [Wire.lean](../../spec/PluginSdk/Compiler/Assembly/Wire.lean) handles `assemble` requests. The [Effect contract](../../contracts/Assembly.ts), [TypeScript model](../../src/compiler/package/assembly.ts), and [conformance test](../../test/assembly.test.ts) use the same wire.

[Repair/Types.lean](../../spec/PluginSdk/Repair/Types.lean) and [Properties.lean](../../spec/PluginSdk/Repair/Properties.lean) define repair review states and R1 through R8. [Model.lean](../../spec/PluginSdk/Repair/Model.lean) specifies proposals, fresh starts, retries, completed replay, and settlement. [Proofs.lean](../../spec/PluginSdk/Repair/Proofs.lean) certifies those properties. [Wire.lean](../../spec/PluginSdk/Repair/Wire.lean) handles `repair_propose`, `repair_begin`, and `repair_settle`.

The [Effect contract](../../contracts/Repair.ts) and [reviewed basis](../../contracts/Installer.ts) define the wire data. The [TypeScript model](../../src/installer/recovery/model.ts) and [conformance test](../../test/repair.test.ts) match it. The repair model specifies reviewed cleanup only. [Runtime orchestration](../../src/installer/recovery/repair.ts) and [qualified inspection](../../src/installer/recovery/inspect.ts) implement its I/O obligations, checked separately through native acceptance.

[Authorization/Types.lean](../../spec/PluginSdk/Authorization/Types.lean), [Rules.lean](../../spec/PluginSdk/Authorization/Rules.lean) and [Properties.lean](../../spec/PluginSdk/Authorization/Properties.lean) define per-invocation evidence and U1-U8. [Model.lean](../../spec/PluginSdk/Authorization/Model.lean) implements the guards; [Proofs.lean](../../spec/PluginSdk/Authorization/Proofs.lean) proves the independent predicates. [Wire.lean](../../spec/PluginSdk/Authorization/Wire.lean) handles `authorize`. The [Effect schemas](../../contracts/Authorization.ts), [TypeScript model](../../src/authorization.ts) and [tests](../../test/authorization.test.ts) conform to that wire. Trusted-evidence production and enforcement remain I/O obligations in the [authorization design](authorization-design.md).

[Catalog/Types.lean](../../spec/PluginSdk/Catalog/Types.lean), [Rules.lean](../../spec/PluginSdk/Catalog/Rules.lean) and [Properties.lean](../../spec/PluginSdk/Catalog/Properties.lean) define immutable release admission and exact artifact selection C1-C6. [Model.lean](../../spec/PluginSdk/Catalog/Model.lean), [Proofs.lean](../../spec/PluginSdk/Catalog/Proofs.lean) and [Wire.lean](../../spec/PluginSdk/Catalog/Wire.lean) supply the proved functions and strict wire. The [Effect schemas](../../contracts/Catalog.ts), [TypeScript model](../../src/catalog/model.ts) and [tests](../../test/catalog.test.ts) conform to it. Catalog I/O obligations are separate in the [design](catalog-design.md).

[Catalog/Artifacts/Types.lean](../../spec/PluginSdk/Catalog/Artifacts/Types.lean) and [Properties.lean](../../spec/PluginSdk/Catalog/Artifacts/Properties.lean) state exact package correspondence, positive acceptance, complete diagnostics and enumeration invariance E1-E4. The [model](../../spec/PluginSdk/Catalog/Artifacts/Model.lean) and [proofs](../../spec/PluginSdk/Catalog/Artifacts/Proofs.lean) certify those properties. The strict `check_packages` wire matches 23 independent vectors and 23 permutations and rejects 31 malformed inputs. The [Effect contract](../../contracts/Artifacts.ts), [TypeScript model](../../src/catalog/artifacts/model.ts) and [tests](../../test/artifacts.test.ts) also agree on 192 generated requests. [ReleaseCatalog](../../contracts/Registry.ts) privately captures, validates, retains and acquires complete plugin bundles; seven [runtime checks](../../test/catalog-runtime.test.ts) exercise that connection with two integrations and concurrent child-process writers.

[Artifact import](artifact-import-design.md) feeds the same captured packages into the existing C1-C6/E1-E4 transition after verifying the downloaded archive. It introduces no second admission model. HTTP transport, exact SHA-256 computation, strict archive decoding, cancellation and timeout are I/O obligations, checked by [runtime tests](../../test/catalog-artifact.test.ts). [CLI tests](../../test/catalog-cli.test.ts) drive canonical packaging, metadata derivation, import and exact package acquisition through the caller's command interface.

[Compiler/Process/Types.lean](../../spec/PluginSdk/Compiler/Process/Types.lean), [Properties.lean](../../spec/PluginSdk/Compiler/Process/Properties.lean), [Model.lean](../../spec/PluginSdk/Compiler/Process/Model.lean) and [Proofs.lean](../../spec/PluginSdk/Compiler/Process/Proofs.lean) define and certify symbolic process normalization M1-M5. [Quoting.lean](../../spec/PluginSdk/Compiler/Process/Quoting.lean) proves a literal-word round trip through a restricted quoting grammar. The strict process and quoting wires match 22 and nine independent vectors. Focused checks reject 527 malformed requests, preserve six enumeration cases and pass 285 arguments through the actual `/bin/sh` byte for byte. The [TypeScript process model](../../src/compiler/process/model.ts) conforms to the vectors and oracle.

[LauncherTypes.lean](../../spec/PluginSdk/Compiler/Process/LauncherTypes.lean) states L1-L7 over explicit capture, script and native-configuration interfaces. [Launcher.lean](../../spec/PluginSdk/Compiler/Process/Launcher.lean) supplies the model and serializer; [LauncherProofs.lean](../../spec/PluginSdk/Compiler/Process/LauncherProofs.lean) and [LauncherTransferProofs.lean](../../spec/PluginSdk/Compiler/Process/LauncherTransferProofs.lean) certify it. Eight authored vectors and 32 generated oracle cases agree with the [TypeScript serializer](../../src/compiler/process/posix.ts). Seven malformed requests reject, and six focused executions exercise emitted scripts. Isolated native packages exercise the exact emitted launcher on both clients at two versions. These checks qualify the instruction model and observed runtime behavior. MCP composition and SDK lifecycle have their own checks below.

[Compiler/Mcp/Types.lean](../../spec/PluginSdk/Compiler/Mcp/Types.lean) states K1-K7 for complete native MCP documents and generated launchers. [Paths.lean](../../spec/PluginSdk/Compiler/Mcp/Paths.lean), [Model.lean](../../spec/PluginSdk/Compiler/Mcp/Model.lean) and [Proofs.lean](../../spec/PluginSdk/Compiler/Mcp/Proofs.lean) implement and certify canonical ordinals, source accounting, exact acceptance, enumeration invariance and legacy preservation. The strict `render_mcp` wire matches seventeen authored vectors and seventeen enumeration cases and rejects twelve malformed requests. The [TypeScript port](../../src/compiler/mcp/model.ts) also agrees on 96 generated cases. Compiler/CLI checks and separate native lifecycle acceptance connect these pure models to SDK-built v3 packages; see the [local MCP design](local-mcp-design.md).

[Compiler/Hooks/Properties.lean](../../spec/PluginSdk/Compiler/Hooks/Properties.lean) states H1-H8 over the [hook types](../../spec/PluginSdk/Compiler/Hooks/Types.lean). The [model](../../spec/PluginSdk/Compiler/Hooks/Model.lean) and [proofs](../../spec/PluginSdk/Compiler/Hooks/Proofs.lean) establish exact event groups, executable bytes, timeouts, contained paths, complete rejection, enumeration invariance and process preservation. [Generated.lean](../../spec/PluginSdk/Compiler/Generated.lean) shares ordinal-path construction with MCP. Fourteen independently authored vectors, fourteen reordered inputs, 26 malformed inputs and two actual shell controls pass. The [TypeScript renderer](../../src/compiler/hooks/model.ts) also conforms on 64 generated requests. Six [compiler checks](../../test/hooks-build.test.ts), CLI acceptance and [isolated native fixtures](hooks-design.md#sdk-lifecycle-qualification) connect this model to the two public services.

[Catalog/Tools/Types.lean](../../spec/PluginSdk/Catalog/Tools/Types.lean) and [Properties.lean](../../spec/PluginSdk/Catalog/Tools/Properties.lean) state T1-T7 for complete tool descriptors, exact duplicate names and organization/service/digest binding. The [model](../../spec/PluginSdk/Catalog/Tools/Model.lean), [certificates](../../spec/PluginSdk/Catalog/Tools/Proofs.lean) and [strict wire](../../spec/PluginSdk/Catalog/Tools/Wire.lean) precede the [TypeScript port](../../src/catalog/tools/model.ts). The oracle matches 27 independently authored vectors and 1,467 permutations and rejects 70 malformed requests. [Conformance tests](../../test/tool-contract.test.ts) add 42 normalization inputs and eight binding combinations. [Reviewed contract retention](mcp-contract-design.md) connects the opaque descriptor identities to complete private JSON, hashing and catalog I/O.

## Model interface

[Lifecycle.ts](../../contracts/Lifecycle.ts) exposes three total, pure functions implemented in [lifecycle.ts](../../src/installer/lifecycle/model.ts):

```ts
import type {
	PlanningInput, Decision, BeginInput, BeginResult, SettleInput, Settlement
} from "../contracts/Lifecycle.ts"

declare const decide: (input: PlanningInput) => Decision
declare const begin: (input: BeginInput) => BeginResult
declare const settle: (input: SettleInput) => Settlement
```

The model covers one physical installation key. IDs, digests, fingerprints, and observations are inputs. The model compares them; it does not generate them or read a host.

An idle journal is `empty`, `installed`, or `not_applied`. Empty retains the last removal ID or `null`. Installed retains a receipt. Not applied retains the attempted plan, its change, and its before-snapshot. A pending journal retains the previous idle journal, the before-observation, the approved plan ID, and change. It represents an operation whose native outcome may still be unknown.

`PlanChange` holds bundle bytes for the product interface. Its projection into `Change` retains the operation and replaces the bundle with its digest. `install` and `replace` carry a digest; `remove` carries none. The desired state follows from that change, so `BeginInput` cannot request installation with an absent desired state.

The receipt and revision inside a `Snapshot` are projected from the idle journal. The revision is `empty.last`, `installed.receipt.identity.plan`, or `not_applied.plan`. A not-applied journal's ownership comes from its recorded snapshot, but its current revision is the attempted plan. A pending journal does not make the previous receipt authorize another write.

`decide` returns this snapshot with every non-pending decision. Its `observed` field is the current input observation. `Installer` uses that output directly when constructing a plan.

[CompilerModel.ts](../../contracts/CompilerModel.ts) declares the compiler's pure function:

```ts
import type { RenderInput, RenderResult } from "../contracts/CompilerModel.ts"

declare const render: (input: RenderInput) => RenderResult
```

Its [contract](compiler.md) specifies normalized source inputs, copy references, native JSON objects, and format-specific rejections. The content table, source parsing, standard codecs, and hashing stay outside this model. Normalization must account for every requested skill and MCP definition before the pure rendering obligations apply.

## Planning rules

`decide` first returns the retained plan ID for a pending journal. For an idle journal, it applies these rules in order:

| Observation and receipt | Desired present | Desired absent |
| --- | --- | --- |
| Unknown observation | Block `unknown` | Block `unknown` |
| Present installation without a matching receipt | Block `unowned` if no receipt; otherwise block `drift` | Same |
| Absent installation, no receipt | Install | Unchanged |
| Absent installation, existing receipt | Install | Remove the stale receipt |
| Present installation matching its receipt | Unchanged for the same bundle; otherwise replace | Remove |

A receipt matches only when the observed fingerprint and complete identity equal the receipt. A matching payload alone is insufficient.

`begin` rejects a different pending plan. For the same pending plan and exact change, it returns `resume`, with no native directive. For an idle journal, the latest completed ID can return its completion when the change and current observation agree with that outcome. A changed desired state is invalid; a changed observation is stale. That ID never returns `start`. For a new ID, `begin` requires the current snapshot, including revision, to equal `before`, and `decide` to authorize exactly the requested change. It returns `start` with a pending journal.

`settle` first checks whether the desired state is established. Present requires the pending plan's marker and bundle digest; absent requires a complete absent observation. Completion creates a receipt or removal tombstone. If the complete observation instead equals the before-observation, settlement returns `not_applied` and preserves the prior ownership in a not-applied journal. This records the attempted plan as the new revision. All other observations retain the pending journal and return `uncertain`.

The plan commitment is validated before model execution. A plan ID used with a different body is invalid. Replayed inputs with the same ID but a different desired state must also be rejected by the model.

## Property obligations

Property IDs are permanent. Each ID must appear in the Lean theorem name or docstring, oracle scenarios, and TypeScript conformance cases.

| ID | Proposed theorem | Obligation |
| --- | --- | --- |
| P1 | `unowned_never_starts` | An occupied installation without a matching ownership receipt cannot produce a mutation directive. |
| P2 | `unknown_never_starts` | Unknown observations authorize no new native mutation. |
| P3 | `drift_never_starts` | A changed fingerprint or identity cannot authorize replacement or removal. |
| P4 | `desired_fixed_point` | An owned, observed desired bundle yields `unchanged`; an empty, unowned absent installation also yields `unchanged`. |
| P5 | `stale_before_rejected` | A new operation with a changed before-snapshot is rejected. A fresh plan with the matching snapshot and exact authorized change starts that operation. |
| P6 | `one_pending_operation` | A pending journal admits only resumption of its own plan and exact change. |
| P7 | `resume_emits_no_mutation` | Replaying a pending plan never produces `start`. |
| P8 | `commit_requires_observation` | Installed completion requires the plan's observed marker and bundle; removal completion requires observed absence. An established desired state produces its corresponding completion. |
| P9 | `uncertainty_preserves_pending` | An unresolved settlement preserves the pending operation and authorizes no new write. |
| P10 | `not_applied_preserves_ownership` | When the before-state is observed again and the desired state is not established, settlement preserves prior ownership and acknowledges the attempted plan as the new revision. |
| P11 | `completed_replay_is_stable` | The latest completed operation replayed against its matching observed result emits no mutation and returns the same completion, including `not_applied`. |
| P12 | `reused_id_rejects_new_desired` | A pending or last-completed ID paired with a different desired state emits no mutation directive. |
| P13 | `completed_plan_never_restarts` | The latest completed plan ID never produces `start`, even if its native observation changes. |
| P14 | `planning_basis_matches_journal` | Decisions follow the planning table. Every non-pending decision carries the receipt and revision projected from its journal, with the input observation unchanged. |
| B1 | `render_deterministic` | Equal validated package inputs and a pinned format revision produce equal output entries. Files and deduplicated issues use their canonical ordering. |
| B2 | `source_content_preserved` | Every accepted skill file maps to one output entry with unchanged bytes and executable bit. |
| B3 | `output_paths_unique` | An accepted rendering has no duplicate comparison keys or file/descendant conflicts. Requested collisions produce diagnostics, and each collision diagnostic names a real conflict. |
| B4 | `requested_content_accounted_for` | Representable inputs render. Accepted packages contain exactly the requested skills and MCP entries; unsupported requests contribute to rejection. |
| B5 | `enumeration_order_irrelevant` | Reordering normalized skills, assets, servers, or headers does not change the canonical files or issues. |
| B6 | `output_paths_contained` | Every accepted output path stays lexically within the package. |
| B7 | `copy_references_from_input` | Every copy matches an input entry or asset at its specified skill-relative path, preserving file identity and executable bit. |
| B8 | `header_meaning_preserved` | An accepted native header preserves its requested literal value or explicit environment reference; an unrepresentable request is rejected. |
| V1 | `digest_checked` | Accepted bundle input has equal claimed and supplied recomputed digests. |
| V2 | `paths_canonical` | Accepted bundle paths are strictly ordered by unsigned UTF-8 and have no aliases or file/descendant conflicts. |
| V3 | `diagnostics_exact` | Every required bundle issue is reported, every reported issue is real, and issues have canonical order without duplicates. |
| V4 | `valid_bundle_accepted` | Bundle input satisfying the digest and path rules is accepted. |
| A1 | `deterministic_canonical` | Equal inputs have equal results; accepted files and rejected issues use canonical order. |
| A2 | `preserves_requested_files_once` | Every requested base or added asset appears exactly once in an accepted result. |
| A3 | `no_invented_files` | Every output asset came from the requested base or added assets. |
| A4 | `contained_conflict_free` | Accepted output paths are contained and have no duplicate, alias, or file/descendant conflict. |
| A5 | `diagnostics_complete` | The rejected result contains exactly the required collision and reserved-asset issues. |
| A6 | `permutation_invariant` | Reordering base or added assets does not change the result. |
| A7 | `valid_input_accepted` | Nonconflicting input with no reserved added asset is accepted. |
| R1 | `blocked_never_starts` | A blocked inspection never starts cleanup. |
| R2 | `start_requires_fresh_review` | A cleanup starts only when a fresh proposal exactly matches the reviewed basis and pending binding. |
| R3 | `start_preserves_operation_identity` | A new cleanup keeps the interrupted operation ID and uses a distinct cleanup ID. |
| R4 | `cleanup_matches_residual` | Cleanup matches the exact marketplace/companion residual; proven absence requests no cleanup. |
| R5 | `current_cleanup_retry_only_resumes` | Retrying the exact current cleanup resumes inspection without starting another change. |
| R6 | `completion_requires_qualified_absence` | Cleanup completes only after qualified absence. |
| R7 | `other_settlement_preserves_pending_basis` | Every other settlement retains the pending cleanup and its full basis. |
| R8 | `completed_replay_acknowledges_without_start` | A completed cleanup replay against qualified absence acknowledges completion without starting a change. |
| U1 | `unavailable_never_allows` | Unverified identity or unavailable policy/membership never permits invocation. |
| U2 | `identity_is_bound` | Allowing requires exact organization, issuer and subject binding. |
| U3 | `current_evidence_required` | Allowing requires an unexpired token and policy/membership snapshots within their age bounds. |
| U4 | `known_contract_required` | Allowing requires a declared tool and agreement with every matching contract restriction. |
| U5 | `scopes_and_application_required` | Allowing requires all matching scopes and application access. |
| U6 | `effective_role_grant_required` | Allowing requires an issuer-qualified group binding and an exact service/tool grant. |
| U7 | `complete_authorization_succeeds` | Fully eligible evidence, an effective grant and application access produce success with the evidence revisions. |
| U8 | `revoked_grant_is_denied` | Otherwise eligible evidence without an effective grant produces permission denial. |
| C1 | `registration_adds_only_absent_key` | Registration adds exactly the requested release if and only if its key was absent. |
| C2 | `conflicting_identity_rejected` | A different release under the same key rejects registration. |
| C3 | `consistent_replay_unchanged` | Replaying a consistent existing release leaves the ledger unchanged. |
| C4 | `existing_bindings_preserved` | Old records remain and no new record appears under an old key. |
| C5 | `resolution_selects_exact_artifact` | Resolution selects the exact qualified release and requested artifact without substitution. |
| C6 | `available_artifact_resolves` | A consistent release with the requested artifact resolves successfully. |
| E1 | `accepted_packages_exact` | Acceptance establishes exactly one corresponding package for each declared format and no extras. |
| E2 | `complete_packages_accepted` | Every complete corresponding package set succeeds. |
| E3 | `diagnostics_exact` | Rejection contains all and only required diagnostics, once each in canonical UTF-8 order. |
| E4 | `enumeration_invariant` | Candidate package order cannot change the result. |
| T1 | `accepted_tools_exact` | Accepted tools preserve every complete descriptor and order distinct names by UTF-8. |
| T2 | `distinct_tools_accepted` | Every list with distinct names succeeds, including an empty list. |
| T3 | `duplicate_diagnostics_exact` | Rejection names all and only repeated names, once each in canonical order. |
| T4 | `tool_enumeration_invariant` | Permuting complete descriptors leaves the result unchanged. |
| T5 | `accepted_binding_exact` | Accepted binding has the exact organization, service and contract digest. |
| T6 | `matching_binding_accepted` | Every matching binding succeeds. |
| T7 | `binding_diagnostics_exact` | Rejection reports every identity mismatch, once each in canonical order. |
| M1 | `accepts_exactly_representable` | Process normalization accepts exactly input with present references, executable programs, existing directories, unique environment names and supported references. |
| M2 | `preserves_process` | A successful symbolic plan preserves the program, full ordered arguments, working directory and every explicit environment binding. |
| M3 | `diagnostics_sound_complete` | Rejection reports all and only required process failures, once each in canonical order. |
| M4 | `canonical_environment` | A successful plan orders environment names strictly by UTF-8. |
| M5 | `enumeration_invariant` | Reordering environment entries or captured files preserves the process result. |
| Q1 | `literal_word_roundtrip` | Literal text survives encoding and decoding through the restricted quoting grammar. Actual shell behavior has a separate check. |
| L1 | `capture_exact` | Dual native captures distinguish an absent source from every present value, including empty and literal-reference values. |
| L2 | `names_valid_fresh` | Native capture names are valid and differ from every requested destination and source name. |
| L3 | `capture_coverage_distinct` | Every required source has exactly the matching capture and all capture names are distinct. |
| L4 | `complete_process_preserved` | Positional snapshot evaluation preserves the command, ordered arguments, directory and complete environment. |
| L5 | `missing_source_stops` | A missing required source prevents process execution. |
| L6 | `native_shape_exact` | Native command, root argument, capture bindings and cwd match the selected host; unsupported captures reject. |
| L7 | `transfer_names_safe` | Transfer names are valid, fresh, distinct from captures and injective by destination. |
| K1 | `servers_exact` | The MCP document contains exactly the requested remote/local server keys and native values. |
| K2 | `generated_files_exact` | Each canonical local plan has exactly its executable launcher bytes, with no extra generated files. |
| K3 | `launcher_paths_safe` | Generated ordinal paths are contained, distinct, injective and free of expansion syntax. |
| K4 | `accepts_exactly_native` | Every fully representable input succeeds; rejected names are exactly the unavailable native plans, once each in canonical order. |
| K5 | `enumeration_invariant` | Reordering local/remote records and remote headers preserves the result. |
| K6 | `remote_document_preserved` | With no local server, the MCP document preserves the legacy renderer and no launcher is generated. |
| K7 | `cwd_root_preserved` | Codex native launchers recover the complete absolute-root frame, preserve the exact native record and retain the existing process meaning. |
| H1 | `document_exact` | Successful output contains every requested event and complete ordered handler groups, with no extra fields. |
| H2 | `files_exact` | Each declaration has exactly one executable launcher with the complete existing serialization. |
| H3 | `handlers_exact` | Every handler preserves the native command, timeout and synchronous mode without braced native substitution. |
| H4 | `paths_safe` | Generated hook paths are contained, injective and pairwise distinct. |
| H5 | `acceptance_exact` | All reference-free plans succeed; failures name every unsupported hook/source pair exactly once. |
| H6 | `enumeration_invariant` | Declaration record order does not affect output or diagnostics. |
| H7 | `empty_preserved` | Empty input succeeds without a document or files. |
| H8 | `process_preserved` | Every accepted hook retains the complete process meaning for every root and optional ambient environment. |
| S1 | `selected_is_sole_candidate` | A selected format is the only declared compatible candidate. |
| S2 | `sole_candidate_selected` | Every sole compatible candidate is selected. |
| S3 | `blocking_exact` | Missing and ambiguous results describe exactly zero and multiple compatible candidates. |
| S4 | `enumeration_invariant` | Candidate enumeration preserves format selection. |
| D1 | `accepted_steps_exact` | Accepted planning preserves all ready descriptors, excludes blocked candidates and orders unique labels with distinct physical installations. |
| D2 | `ready_destinations_accepted` | Every nonempty fully ready input with distinct labels and installations is accepted. |
| D3 | `issues_exact` | Blocking issues are exactly the blocked candidates and duplicate labels/installations, once each in canonical order. |
| D4 | `enumeration_invariant` | Candidate enumeration preserves normalized planning. |
| X1 | `prior_open_requires_exact_binding` | Prior progress opens only against the exact plan ID, desired presence and descriptor sequence. |
| X2 | `new_record_is_pending` | A new record preserves every descriptor with a pending status. |
| X3 | `matching_prior_reopens` | Matching prior progress reopens unchanged. |
| X4 | `scheduling_sound_complete` | Scheduling selects eligible unvisited work and finds an attempt whenever such work exists. |
| X5 | `recording_preserves_review` | Recording preserves review metadata, descriptor order and other entries while updating only the selected eligible destination. |
| X6 | `eligible_recording_succeeds` | Recording a result for a unique eligible destination succeeds. |
| X7 | `terminal_recording_rejected` | A unique terminal destination cannot be overwritten. |
| X8 | `completion_exact` | Global completion holds exactly when every destination satisfies desired presence. |
| X9 | `terminal_replay_schedules_nothing` | A record with only terminal outcomes schedules no additional work. |
| N1 | `selected_is_sole_profile` | Selection returns only the sole eligible exact profile occurrence. |
| N2 | `sole_profile_selected` | Every sole eligible profile occurrence is selected. |
| N3 | `blocking_exact` | Unqualified and ambiguous results describe exactly zero and multiple eligible occurrences. |
| N4 | `selection_enumeration_invariant` | Profile row order cannot change selection. |
| N5 | `ownership_exact` | Ownership reuse requires unique registrations and the same host, platform, scope and adapter revision. |
| N6 | `ownership_isolation` | Ownership reuse cannot cross host, platform, scope or adapter revision. |
| N7 | `qualified_version_change_retains_ownership` | Distinct uniquely registered versions in one adapter contract can retain ownership. |
| N8 | `ownership_enumeration_invariant` | Profile row order cannot change ownership compatibility. |
| G1 | `declarations_exact` | Every accepted declaration appears once in canonical order. |
| G2 | `definition_preserved` | Prompt, description, selected model and shell policy keep their declared meaning. |
| G3 | `namespace_exact` | Every native identity is the exact plugin-qualified agent name. |
| G4 | `paths_safe_distinct` | Rendered native paths are contained and distinct. |
| G5 | `duplicate_issues_exact` | Duplicate diagnostics are complete and canonical. |
| G6 | `unique_input_succeeds` | Every unique agent input renders successfully. |
| G7 | `enumeration_invariant` | Declaration order cannot change rendering. |
| G8 | `empty_preserved` | An empty declaration set renders no agents. |
| F1 | `accepted_before_safe` | A ready transition has exact owned previous files and absent new files. |
| F2 | `safe_input_succeeds` | Every safe companion transition succeeds. |
| F3 | `issues_exact` | Ownership, drift, duplicate and unavailable-state issues are complete and canonical. |
| F4 | `required_names_exact` | Every required role occurs exactly once in canonical order. |
| F5 | `changes_preserve_identities` | Changes preserve exact before and after identities. |
| F6 | `unrelated_observations_irrelevant` | Other role observations cannot authorize a transition. |
| F7 | `enumeration_invariant` | Reordering the captured sets or observations cannot change review. |
| F8 | `unchanged_set_keeps_only` | An unchanged owned set requires only keep checks. |

The revision decision in the [design](design.md#journal-revision-decision) refines P10: restoring the entire previous journal would violate P11 by forgetting a completed attempt. P10 retains its ID and preserves ownership while advancing completion metadata. The earlier 119-property audit and the new 16-property G/F audit passed separately. The agent change also rechecked 30 exact catalog, package, selection, compatibility and strengthened repair certificates with only Lean's standard axioms.

The compiler proof pass made path containment an explicit segment grammar. `RequestedCollision` witnesses two distinct occurrences through a two-element sublist, retaining duplicate requests even when their strings match. Collision keys range over all strings in B3, so a diagnostic cannot evade the truthfulness obligation by lacking a path proof. `${` detection is executable over characters and proved equivalent to the corresponding string decomposition. These representation changes preserve the specified rendering rules.

The model interfaces and wires are implemented. B2 and B7 treat file digests as identities for immutable captured content. Their interpretation as actual bytes depends on the content table and materialization checks described in the compiler contract. V1 compares digest identities supplied from a private snapshot; it does not calculate a hash or establish that the projection was computed accurately. Native filesystem aliases beyond the format's comparison rules require host checks.

## Oracle wire

`OracleRequest` and `OracleResponse` define version 1. One NDJSON request produces one response with the same `type`. Each request supplies the complete pure-function input. The oracle has no ambient mutable state.

`Oracle.lean` dispatches rendering, package checks, assembly, repair, authorization, catalog, tool-contract, process, launcher, MCP and hook requests to their module wires. Agents add `render_agents` and `review_companions`. The lifecycle wire handles `decide`, `begin` and `settle`. Distribution adds `select_distribution_format`, `normalize_distribution`, `open_distribution`, `schedule_distribution`, `record_distribution` and `summarize_distribution`. Compatibility adds `select_native_profile` and `native_ownership_compatible`. Every model remains pure and receives its full input on each request.

Wire discriminants use `type`; enum values use snake case and field names use camel case. Absent values are explicit `null`, and arrays preserve their specified order. Error classes use Effect's `_tag` in TypeScript and are outside this wire.

A planning request can be:

```json
{"schema":1,"type":"decide","input":{"journal":{"type":"empty","last":null},"observed":{"type":"absent"},"desired":{"type":"absent"}}}
```

Its specified response is:

```json
{"schema":1,"type":"decide","output":{"type":"unchanged","state":{"revision":null,"receipt":null,"observed":{"type":"absent"}}}}
```

The lifecycle oracle produces this response for this request.

[Replay examples](examples/replay.ndjson) specify failed-attempt settlement, completed retry, intentional replanning, and stale revision rejection. Each line names a scenario and its properties, with request and expected-response frames. The 12 frames match the running oracle. [Generated lifecycle vectors](../../spec/vectors/lifecycle.ndjson) record those requests with actual oracle responses. Hex IDs are symbolic inputs; these examples do not claim actual plan or bundle preimages.

The runner rejects unsupported versions, malformed inputs, duplicate keys, and extra fields before calling a model. Numeric version representations follow JavaScript number decoding. Each valid request is answered immediately; malformed input writes to stderr and stops the process with exit 1. Structural decoding does not establish semantic relationships between fingerprints, receipts, or plans.

The compiler's separate `OracleRequest` and `OracleResponse` use `type: "render"`. The 15 frames in [compiler examples](examples/compiler.ndjson) specify generated documents, file identities, canonical ordering, and structured rejections. They match the running oracle and its [generated compiler vectors](../../spec/vectors/compiler.ndjson). Conformance generators must qualify normalized MCP inputs through `RemoteMcp` before encoding them for the oracle.

`BundleOracleRequest` and `BundleOracleResponse` use `type: "check_bundle"`. The 15 frames in [bundle examples](examples/bundle.ndjson) cover digest mismatch, committed ordering, path aliases, non-adjacent ancestors, and exact diagnostics. They match the [bundle vectors](../../spec/vectors/bundle.ndjson). Digests are symbolic inputs; their equality in a scenario does not claim equal real hash preimages.

The [Assembly contract](../../contracts/Assembly.ts) uses `type: "assemble"`. The six [assembly vectors](../../spec/vectors/assembly.ndjson) cover canonical asset ordering, path collisions, reserved paths, and rejected inputs. The [Repair contract](../../contracts/Repair.ts) uses `repair_propose`, `repair_begin`, and `repair_settle`. The 18 [repair vectors](../../spec/vectors/repair.ndjson) cover cleanup review, retry, settlement, and completed replay. Repair vectors specify a pure protocol. They do not establish native inspection or mutation behavior.

The [Authorization contract](../../contracts/Authorization.ts) uses `type: "authorize"`. Its 49 [vectors](../../spec/vectors/authorization.ndjson) contain independently authored expectations for two applications, reader/admin permissions, identity binding, freshness, contract restrictions, scopes and revocation. Millisecond values decode with JavaScript binary64 safe integer semantics. Wire checks also cover invalid structure and duplicate keys; the codec itself has no formal correctness proof.

The [Catalog contract](../../contracts/Catalog.ts) uses `catalog_register` and `catalog_resolve`. Its 53 [vectors](../../spec/vectors/catalog.ndjson) specify admission, replay, conflicts, qualified identities and exact artifact selection. Native package fields are optional and preserve format identity; at least one package is required for a plugin release. The wire validates provenance syntax without fetching or executing it.

The [package-binding contract](../../contracts/Artifacts.ts) uses `check_packages`. Its 23 independently authored [vectors](../../spec/vectors/artifacts.ndjson) cover all native formats, complete sets, missing/extra/duplicate packages and exact identity, version and digest diagnostics. Descriptor digests are symbolic inputs to the model. The runtime captures and validates complete bundles before creating those descriptors, then retains those same private bytes.

The [distribution contract](../../contracts/DistributionModel.ts) has 85 independently authored [vectors](../../spec/vectors/distribution.ndjson). They cover sole-format selection, canonical complete planning, exact prior-state binding, retry eligibility, terminal preservation and desired-state completion. The [wire checker](../../spec/scripts/check_distribution.py) adds 207 permutations and rejects 1,158 malformed requests. TypeScript conformance adds 1,681 generated comparisons. These checks passed before distribution I/O implementation began.

The [compatibility contract](../../contracts/Compatibility.ts) has 44 independently authored [vectors](../../spec/vectors/compatibility.ndjson). The [wire checker](../../spec/scripts/check_compatibility.py) adds 212 permutations, 697 malformed requests and six numeric-schema cases. The [TypeScript port](../../src/installer/target/compatibility.ts) agrees with the oracle on those vectors and 1,664 generated comparisons. The pure checks passed before Installer I/O edits. Native qualification determines which concrete profiles enter the approved table.

Agent and companion wires check 52 authored vectors, 55 permutations, 505 malformed inputs and six numeric-schema cases. Their TypeScript suites add 147 generated cases and six companion permutations. Fifty authored dependent vectors cover both new formats and all repair residuals; the dependency suite adds 100 generated cases. These pure checks passed before compiler and Installer integration.

## Development order

1. State properties against explicit model interfaces. All 177 registered obligations are stated.
2. Implement and prove the Lean models before porting behavior. Every obligation has a proof certificate.
3. Compile the proved models to the oracle and check vectors. Every implemented model has committed vectors, including distribution selection, planning and execution.
4. Port TypeScript behavior and finish conformance against the running oracle before editing I/O. The original suite covers lifecycle traces, rendering permutations and bundle combinations. Later models have separate focused suites.
5. Add host I/O only after its required model properties and conformance checks pass.

The project pins Lean 4.34.1 and needs no Mathlib dependency. `cd spec && lake build` checks the models, declarations, and proofs. `bash scripts/gate.sh`, run inside `spec`, requires concrete models and exact proof certificates for all 177 registered properties. The current feature work uses focused audits; the combined gate remains deferred. Only Lean's standard `propext`, `Classical.choice`, and `Quot.sound` are allowed.

The oracle imports model definitions without importing the proof certificate modules. The gate builds it and checks 12 lifecycle frames, 20 render vectors plus the existing example frames, 15 bundle frames, 6 assembly frames, 18 repair frames, 49 authorization vectors, 53 catalog vectors, 23 package-binding vectors, 27 tool-contract vectors, 22 process vectors, nine quoting vectors, eight launcher vectors, seventeen MCP composition vectors and fourteen hook vectors. It rejects 17 malformed lifecycle, 39 malformed render, 36 malformed bundle, 38 malformed assembly, 31 malformed repair, 277 malformed authorization, 481 malformed catalog, 31 malformed package-binding, 70 malformed tool-contract, 508 malformed process, 19 malformed quoting, seven malformed launcher, twelve malformed composition and 26 malformed hook requests. Local catalog acceptance ran the model/oracle build, proof audit and package-binding wire checks separately; the full gate remains deferred.

The gate also checks 100 reordered render inputs and 1,638 bundle combinations. Assembly adds 40 permutations and 819 path combinations; package binding adds 23 permutations and tool normalization adds 1,467. Distribution adds its 85 vectors, 207 permutations and 1,158 malformed requests. Compatibility adds 44 vectors, 212 permutations and 697 malformed requests. The gate compares generated cases with independent expectations. The focused checkers and 119-property audit passed separately; the full gate remains deferred.

To regenerate vectors after an agreed model change, run `check_replay.py`, `check_compiler.py`, `check_bundle.py` or `check_assembly.py` with `--write` inside `spec/scripts`. Resolve any disagreement with a design example before regenerating vectors. Repair, authorization, catalog, package-binding, tool-contract, distribution and compatibility vectors contain authored expectations; their scripts check them against the oracle without rewriting them.

Conformance compares decoded values on committed vectors and generated command sequences. The original `test/conformance.test.ts` run remains 4,210 oracle requests. Repair separately compares 18 vectors and 40 generated requests; authorization compares 49 vectors, 120 generated combinations and a three-call revocation sequence; catalog compares 53 vectors and 192 generated requests; package binding compares 23 vectors and 192 generated requests; tool-contract binding compares 27 vectors, 42 normalization inputs and eight binding combinations.

Start lifecycle sequences from a defined journal and feed returned journals into subsequent commands. Use a small shared pool of IDs, digests, and fingerprints so equality, reuse, stale observations, and conflicting plans occur often. Generate valid transitions and rejected attempts. Shrink a mismatch into a committed counterexample.

The suite uses `@effect/vitest` and Effect Schema arbitraries for normalized MCP cases. The required order is proof gate, oracle vectors, TypeScript typecheck and Effect diagnostics, conformance, then I/O checks. An open proof remains incomplete behavior even when TypeScript tests pass.

## Proof limits and native acceptance

The model assumes that a complete observation is truthful and no earlier native command can commit after it. It also assumes that a plan commitment has been checked, pending state is durable before a native change, and conflicting writers are serialized. TypeScript must establish these assumptions through real I/O checks. A host that cannot establish them must remain unsupported for mutation.

Distribution treats complete-operation commitments as symbolic descriptors. Faithful projection, private byte capture, full-plan/outcome binding and durable progress are implementation obligations. Duplicate-label execution inputs have total deterministic behavior; accepted runtime plans first establish unique labels and physical installations. An unchanged step must recheck its exact basis. Retained completed outcomes establish operation history, not continuous client health or backend authorization.

Compatibility proves policy over a supplied profile registry. It does not prove that a client reports its true version or follows the adapter contract. Physical target identity, exact marker-to-plan binding, byte validation, native behavior and the evidence behind each registry row remain I/O obligations. Compatible ownership permits a fresh review after a client version change; it does not make an older reviewed plan fresh.

Authorization assumes the service supplies verified identity, trusted observations, its clock and bounds, and application permission for the actual invocation. Its freshness proof concerns those observations; it does not prove the authority's propagation delay or clock behavior. Production enforcement must reject untrusted fact injection and recheck each call. Catalog distribution alone cannot discharge those obligations.

Native acceptance must cover canonical path aliases, source link escapes, unrelated host entries, physical ownership collisions, interrupted writes, and termination before and after each durable record or native call. It must exercise a real host in an isolated home. Fresh session discovery and MCP authentication are separate checks.

The model does not prove cryptographic collision resistance, third-party process atomicity, power-loss durability, or the accuracy of a host adapter. It also makes no progress guarantee while the host keeps returning unknown state. Native evidence that invalidates an observation or ownership assumption requires a design change before an adapter is enabled.
