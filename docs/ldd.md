# Lean-driven design specification

This follows lcode's LDD approach: state a property, prove a Lean 4 model, compile an oracle, and make TypeScript conform. The [Lean project](../spec/README.md) proves 41 properties.

P1 through P14 cover lifecycle, B1 through B8 cover rendering, and V1 through V4 cover bundle checks. A1 through A7 cover assembly, and R1 through R8 cover repair review. The existing [TypeScript conformance suite](../test/conformance.test.ts) compares its models with 4,210 oracle requests. The separate assembly and repair suites add their own oracle comparisons. The repair suite checks 18 vectors and 40 generated requests.

The formal lifecycle contract is [Types.lean](../spec/PluginSdk/Lifecycle/Types.lean) and [Properties.lean](../spec/PluginSdk/Lifecycle/Properties.lean). The formal compiler contract is [Types.lean](../spec/PluginSdk/Compiler/Types.lean), [Format.lean](../spec/PluginSdk/Compiler/Format.lean), and [Properties.lean](../spec/PluginSdk/Compiler/Properties.lean). Effect schemas provide their TypeScript representations.

[Lifecycle/Model.lean](../spec/PluginSdk/Lifecycle/Model.lean) implements the total functions. [Lifecycle/Proofs.lean](../spec/PluginSdk/Lifecycle/Proofs.lean) proves the existing obligations against that model without changing their statements. [Rules.lean](../spec/PluginSdk/Lifecycle/Rules.lean) holds the independent specification relations and shared state projections.

[Compiler/Model.lean](../spec/PluginSdk/Compiler/Model.lean) renders captured source content into copy references and native JSON objects, or rejects it with canonical issues. [Compiler/Proofs.lean](../spec/PluginSdk/Compiler/Proofs.lean) supplies all eight compiler certificates. Supporting lemmas cover path construction, complete collision detection, JSON field meaning, headers, and enumeration independence.

[Compiler/Bundle/Model.lean](../spec/PluginSdk/Compiler/Bundle/Model.lean) checks a bundle's claimed and supplied recomputed digest and its committed file paths. Its [proofs](../spec/PluginSdk/Compiler/Bundle/Proofs.lean) establish acceptance and exact diagnostics. The [bundle contract](bundle.md) defines the projection, private snapshots, and checks outside this model.

[Compiler/Assembly/Types.lean](../spec/PluginSdk/Compiler/Assembly/Types.lean) and [Properties.lean](../spec/PluginSdk/Compiler/Assembly/Properties.lean) define the asset assembly contract and A1 through A7. [Model.lean](../spec/PluginSdk/Compiler/Assembly/Model.lean) implements canonical ordering and exact collision diagnostics. [Proofs.lean](../spec/PluginSdk/Compiler/Assembly/Proofs.lean) certifies those properties. [Wire.lean](../spec/PluginSdk/Compiler/Assembly/Wire.lean) handles `assemble` requests. The [Effect contract](../contracts/Assembly.ts), [TypeScript model](../src/model/assembly.ts), and [conformance test](../test/assembly.test.ts) use the same wire.

[Repair/Types.lean](../spec/PluginSdk/Repair/Types.lean) and [Properties.lean](../spec/PluginSdk/Repair/Properties.lean) define repair review states and R1 through R8. [Model.lean](../spec/PluginSdk/Repair/Model.lean) specifies proposals, fresh starts, retries, completed replay, and settlement. [Proofs.lean](../spec/PluginSdk/Repair/Proofs.lean) certifies those properties. [Wire.lean](../spec/PluginSdk/Repair/Wire.lean) handles `repair_propose`, `repair_begin`, and `repair_settle`.

The [Effect contract](../contracts/Repair.ts) and [reviewed basis](../contracts/Installer.ts) define the wire data. The [TypeScript model](../src/model/repair.ts) and [conformance test](../test/repair.test.ts) match it. The repair model specifies reviewed cleanup only. It does not implement native repair.

## Model interface

[Lifecycle.ts](../contracts/Lifecycle.ts) exposes three total, pure functions implemented in [lifecycle.ts](../src/model/lifecycle.ts):

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

[CompilerModel.ts](../contracts/CompilerModel.ts) declares the compiler's pure function:

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
| R4 | `cleanup_matches_residual` | Proven absence requests no native command; an orphaned marketplace requests only marketplace removal. |
| R5 | `current_cleanup_retry_only_resumes` | Retrying the exact current cleanup resumes inspection without starting another change. |
| R6 | `completion_requires_qualified_absence` | Cleanup completes only after qualified absence. |
| R7 | `other_settlement_preserves_pending_basis` | Every other settlement retains the pending cleanup and its full basis. |
| R8 | `completed_replay_acknowledges_without_start` | A completed cleanup replay against qualified absence acknowledges completion without starting a change. |

The revision decision in the [design](design.md#journal-revision-decision) refines P10: restoring the entire previous journal would violate P11 by forgetting a completed attempt. P10 retains its ID and preserves ownership while advancing completion metadata. All 41 properties now have checked proof certificates.

The compiler proof pass made path containment an explicit segment grammar. `RequestedCollision` witnesses two distinct occurrences through a two-element sublist, retaining duplicate requests even when their strings match. Collision keys range over all strings in B3, so a diagnostic cannot evade the truthfulness obligation by lacking a path proof. `${` detection is executable over characters and proved equivalent to the corresponding string decomposition. These representation changes preserve the specified rendering rules.

The model interfaces and wires are implemented. B2 and B7 treat file digests as identities for immutable captured content. Their interpretation as actual bytes depends on the content table and materialization checks described in the compiler contract. V1 compares digest identities supplied from a private snapshot; it does not calculate a hash or establish that the projection was computed accurately. Native filesystem aliases beyond the format's comparison rules require host checks.

## Oracle wire

`OracleRequest` and `OracleResponse` define version 1. One NDJSON request produces one response with the same `type`. Each request supplies the complete pure-function input. The oracle has no ambient mutable state.

`Oracle.lean` dispatches `render`, `check_bundle`, `assemble`, `repair_propose`, `repair_begin`, and `repair_settle` to their module wires. The lifecycle wire handles `decide`, `begin`, and `settle`. All five models remain pure and receive their full inputs on each request.

Wire discriminants use `type`; enum values use snake case. All current field names are single words. Absent values are explicit `null`, and arrays preserve their specified order. Error classes use Effect's `_tag` in TypeScript and are outside this wire.

A planning request can be:

```json
{"schema":1,"type":"decide","input":{"journal":{"type":"empty","last":null},"observed":{"type":"absent"},"desired":{"type":"absent"}}}
```

Its specified response is:

```json
{"schema":1,"type":"decide","output":{"type":"unchanged","state":{"revision":null,"receipt":null,"observed":{"type":"absent"}}}}
```

The lifecycle oracle produces this response for this request.

[Replay examples](examples/replay.ndjson) specify failed-attempt settlement, completed retry, intentional replanning, and stale revision rejection. Each line names a scenario and its properties, with request and expected-response frames. The 12 frames match the running oracle. [Generated lifecycle vectors](../spec/vectors/lifecycle.ndjson) record those requests with actual oracle responses. Hex IDs are symbolic inputs; these examples do not claim actual plan or bundle preimages.

The runner rejects unsupported versions, malformed inputs, duplicate keys, and extra fields before calling a model. Numeric version representations follow JavaScript number decoding. Each valid request is answered immediately; malformed input writes to stderr and stops the process with exit 1. Structural decoding does not establish semantic relationships between fingerprints, receipts, or plans.

The compiler's separate `OracleRequest` and `OracleResponse` use `type: "render"`. The 15 frames in [compiler examples](examples/compiler.ndjson) specify generated documents, file identities, canonical ordering, and structured rejections. They match the running oracle and its [generated compiler vectors](../spec/vectors/compiler.ndjson). Conformance generators must qualify normalized MCP inputs through `RemoteMcp` before encoding them for the oracle.

`BundleOracleRequest` and `BundleOracleResponse` use `type: "check_bundle"`. The 15 frames in [bundle examples](examples/bundle.ndjson) cover digest mismatch, committed ordering, path aliases, non-adjacent ancestors, and exact diagnostics. They match the [bundle vectors](../spec/vectors/bundle.ndjson). Digests are symbolic inputs; their equality in a scenario does not claim equal real hash preimages.

The [Assembly contract](../contracts/Assembly.ts) uses `type: "assemble"`. The six [assembly vectors](../spec/vectors/assembly.ndjson) cover canonical asset ordering, path collisions, reserved paths, and rejected inputs. The [Repair contract](../contracts/Repair.ts) uses `repair_propose`, `repair_begin`, and `repair_settle`. The 18 [repair vectors](../spec/vectors/repair.ndjson) cover cleanup review, retry, settlement, and completed replay. Repair vectors specify a pure protocol. They do not establish native inspection or mutation behavior.

## Development order

1. State properties against explicit model interfaces. All 41 obligations are stated.
2. Implement and prove the Lean models before porting behavior. All 41 properties pass.
3. Compile the proved models to the oracle and generate vectors. Lifecycle, compiler, bundle, assembly, and repair vectors exist.
4. Port TypeScript behavior and compare it with the running oracle. The existing suite covers lifecycle traces, rendering permutations, and bundle combinations. Assembly and repair use separate conformance tests.
5. Add host I/O only after its required model properties and conformance checks pass.

The project pins Lean 4.34.1 and needs no Mathlib dependency. `cd spec && lake build` checks the models, declarations, and proofs. `bash scripts/gate.sh`, run inside `spec`, requires concrete models and exact proof certificates for all 41 properties. It reports `41/41 property proofs checked`. Only Lean's standard `propext`, `Classical.choice`, and `Quot.sound` are allowed.

The oracle imports model definitions without importing the proof certificate modules. The gate builds it and checks 12 lifecycle frames, 15 render frames, 15 bundle frames, 6 assembly frames, and 18 repair frames. It rejects 17 malformed lifecycle, 39 malformed render, 36 malformed bundle, 38 malformed assembly, and 31 malformed repair requests.

The gate also checks 100 reordered render inputs and 1,638 bundle combinations. Assembly adds 40 permutations and 819 path combinations. The gate compares those generated cases with independent expectations.

To regenerate vectors after an agreed model change, run `check_replay.py`, `check_compiler.py`, `check_bundle.py`, or `check_assembly.py` with `--write` inside `spec/scripts`. Resolve any disagreement with a design example before regenerating vectors. Repair vectors contain authored expectations; `check_repair.py` checks them against the oracle without rewriting them.

Conformance compares decoded values on committed vectors and generated command sequences. The original `test/conformance.test.ts` run remains 4,210 oracle requests. The repair test separately compares 18 vectors and 40 generated requests.

Start lifecycle sequences from a defined journal and feed returned journals into subsequent commands. Use a small shared pool of IDs, digests, and fingerprints so equality, reuse, stale observations, and conflicting plans occur often. Generate valid transitions and rejected attempts. Shrink a mismatch into a committed counterexample.

The suite uses `@effect/vitest` and Effect Schema arbitraries for normalized MCP cases. The required order is proof gate, oracle vectors, TypeScript typecheck and Effect diagnostics, conformance, then I/O checks. An open proof remains incomplete behavior even when TypeScript tests pass.

## Proof limits and native acceptance

The model assumes that a complete observation is truthful and no earlier native command can commit after it. It also assumes that a plan commitment has been checked, pending state is durable before a native change, and conflicting writers are serialized. TypeScript must establish these assumptions through real I/O checks. A host that cannot establish them must remain unsupported for mutation.

Native acceptance must cover canonical path aliases, source link escapes, unrelated host entries, physical ownership collisions, interrupted writes, and termination before and after each durable record or native call. It must exercise a real host in an isolated home. Fresh session discovery and MCP authentication are separate checks.

The model does not prove cryptographic collision resistance, third-party process atomicity, power-loss durability, or the accuracy of a host adapter. It also makes no progress guarantee while the host keeps returning unknown state. Native evidence that invalidates an observation or ownership assumption requires a design change before an adapter is enabled.
