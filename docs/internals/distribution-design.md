# Reviewed release distribution

## Outcome and constraints

A manager imports one approved release, reviews its proposed distribution and applies that review across named destinations. Plugin authors keep their existing definition and build command. Managers should not write loops that acquire packages, coordinate native plans, retry failures and remember which clients completed.

The initial executable destinations are the existing qualified local profiles: Claude Code user/project and Codex user on Linux. An organization workspace is a different destination with its own organization, workspace identity and client surface. It cannot be represented by a local home directory. Workspace adapters, MCP endpoint registration and backend authorization remain required expansion work; a request for an unqualified destination must block the whole proposed distribution rather than silently omit it.

The [catalog](../catalog-usage.md) owns immutable release identity, complete retained content and exact acquisition. The [installer](runtime.md) owns one physical installation's review, execution and recovery. Distribution owns the relationship between one reviewed release, its named destinations, their complete native plans and their independent outcomes. It preserves completed outcomes when another destination is unavailable or uncertain.

## Traced current flow and rationale

`Compiler.build` captures declared source, applies the proved renderers, materializes complete files and validates the final bundle. The CLI builds both clients before writing either output. Format identity and native semantics belong to Compiler, not deployment scripts.

`ReleaseCatalog.import` snapshots approved metadata, acquires bounded bytes, verifies the pin and uses the existing C1-C4/E1-E4/T1-T7 admission paths. `acquire` reads and validates the retained record and selects exactly the requested native format or MCP contract. It performs no client registration.

`Installer.plan` snapshots its request, resolves physical destination identity, locks and inspects state, applies P1-P14 and persists a complete reviewed plan. `apply` validates the commitment and current target, then uses the one-shot native worker and retained journal. Reapplying a completed child plan acknowledges its previous outcome; an uncertain attempt is inspected rather than blindly repeated.

Those lifetimes are explicit in [the selected module design](design.md), [organization design](organization-design.md) and the local decision trail. The repository and scoped conversation are the relevant decision records. No project-owned issue tracker, team conversation or production telemetry is needed to infer another owner for these operations. The main thread selects the additional module; workers gather facts, prove the fixed properties or implement bounded parts.

## Caller usage

Managers retain the release JSON produced by `catalog pack` or `pack-contract`. A distribution request identifies the intended presence and named destinations:

```json
{
  "desired": "present",
  "targets": [
    {
      "type": "local",
      "id": "claude-dev",
      "destination": { "type": "user", "host": "claude_code", "home": "/srv/developer/.claude" }
    },
    {
      "type": "local",
      "id": "codex-dev",
      "destination": { "type": "user", "host": "codex", "home": "/srv/developer/.codex" }
    }
  ]
}
```

```sh
pluginsdk distribution plan approved.release.json --request destinations.json \
  --catalog ./catalog --out reviewed-distribution.json
pluginsdk distribution apply reviewed-distribution.json --state ./distribution-state --json
```

`Distribution.plan` takes the reviewed release and request. It returns a complete committed plan or canonical blocking issues. `Distribution.apply` takes that complete plan and the execution state directory. It initializes a fresh state directory under an existing physical parent; an existing unavailable/corrupt store fails without resetting its history. Runtime construction does not start work.

The catalog is an Effect requirement of planning. Applying a complete retained plan needs the Installer and distribution state, so the apply command does not ask for an unused catalog path or construct a substitute catalog.

The manager chooses a client, not an internal package format. For each qualified local host, exactly one compatible package must be declared. Zero matches block as unavailable; multiple matches block as ambiguous. There is no implicit latest-format choice or fallback. The selected package and full release metadata must match the retained catalog record. The normal two-client build already produces one package for each host.

`desired: "absent"` reviews removal of the release's plugin identity from those destinations. It does not revoke backend permissions. MCP contract releases cannot be treated as installable plugin packages; endpoint-registration requests remain blocked until their own destination and authentication contracts are qualified.

## Candidates and synthesis decision

| Candidate | Interface and ownership | Decision |
| --- | --- | --- |
| Export acquisition and installation helpers | Managers coordinate catalog reads, per-host selection, review, partial failure, persistence and replay. | Reject: the same distribution rules spread across deployment scripts. |
| Extend local Installer requests with catalog references and destination arrays | Every single-install operation becomes coupled to catalog identity and distribution history. | Reject: one installation and a multi-destination release have different lifetimes. |
| One distribution module with plan/apply | The module owns compatibility, complete review, private plans, exact per-destination outcomes and durable replay. Existing Compiler, ReleaseCatalog and Installer keep their knowledge. | Select. |

The main thread selects `Distribution.plan/apply`, supplied existing catalog/installer layers. The state directory belongs to apply; planning does not need a placeholder state path. The public interface has no provider registry, generic pipeline callbacks or custom retry schedule. Removing this module would force managers to reproduce its rules. Local and workspace identities stay distinct; an unqualified workspace is represented honestly, without a fake adapter.

## Review and execution semantics

Planning inspects every requested destination without applying a native change. Duplicate labels reject, including identical duplicates. Two labels resolving to the same physical installation also reject. Successful steps preserve complete child operations and are ordered by UTF-8 label bytes. Enumeration order cannot change the plan. Blocked planning reports one failure from the first failing stage at each destination, plus exact duplicate diagnostics; it never returns an executable subset.

An apply step retains the complete ordinary Installer ReadyPlan. An unchanged step retains its exact native target, observed snapshot and desired intent; apply reinspects it and records unchanged only if that basis still agrees. A newly necessary mutation is not authorized by an old unchanged preview. Earlier pending operations block planning rather than being adopted into a different review. Repair remains a separate explicit Installer review.

The distribution commitment covers schema, desired presence, complete release and canonical complete steps. Each symbolic descriptor commits to its label, physical installation and complete operation. Stored execution state must bind the exact distribution ID, desired presence and ordered descriptors before it can be resumed. Hashing and faithful projection remain implementation obligations.

The owning state store retains the complete reviewed plan and progress record for each distribution under a scoped lock and atomic synced record replacement. It validates their binding and outcome payloads when reading. It creates a complete pending record before invoking any child. Each invocation attempts each incomplete destination at most once. A later invocation may inspect/retry pending, uncertain or unavailable destinations through the same retained child operation. Installed, removed, unchanged, not-applied and blocked outcomes remain terminal for that review. Completed destinations are not sent to Installer again. A failed destination requires a new review when its operation is terminal.

Global completion requires every destination to satisfy the intended presence. Installed satisfies present; removed satisfies absent; freshly verified unchanged satisfies either. Not-applied, blocked, unavailable, uncertain and pending never establish global success. Results are per-destination observations of this attempt, not a statement that an organization authenticated all users or granted backend access.

Killing the parent can leave its record behind a completed child. Replaying the same child plan is safe through Installer's existing journal; the distribution records that acknowledged result. Distribution does not implement native rollback or promise atomic changes across clients. A storage error after rename can expose a complete new record before acknowledgement.

## LDD obligations

| ID | Required claim |
| --- | --- |
| S1 | A selected format is the only declared compatible candidate for the requested host. |
| S2 | Every sole compatible candidate is selected. |
| S3 | Missing and ambiguous results describe exactly zero and multiple compatible candidates. |
| S4 | Candidate enumeration cannot change selection. |
| D1 | Accepted planning preserves every ready descriptor, has no blocked candidate, and orders unique labels with distinct physical installations. |
| D2 | Every nonempty fully ready set with distinct labels and physical installations is accepted. |
| D3 | Planning issues contain all and only blocked candidates and repeated labels/installations, once each in canonical order. |
| D4 | Candidate enumeration cannot change normalized planning. |
| X1 | Opening prior state succeeds only for its exact plan ID, desired presence and descriptor sequence, without replacing progress. |
| X2 | A new review opens with every exact descriptor pending. |
| X3 | Matching prior state reopens unchanged. |
| X4 | Scheduling returns an eligible, unvisited destination; an eligible destination always yields an attempt. |
| X5 | Recording changes only the selected retryable destination's outcome and preserves the reviewed identity, descriptor sequence and other entries. |
| X6 | Recording a result for a unique eligible destination succeeds. |
| X7 | A terminal destination cannot be overwritten by another result for the same review. |
| X8 | Global completion holds exactly when every destination satisfies desired presence. |
| X9 | A record containing only terminal outcomes schedules no additional work. |

First define schemas, Lean types and the exact properties. Prove the model, build its strict wire and check independently authored vectors. Port the pure TypeScript and finish its oracle conformance before writing distribution I/O or CLI behavior. Only then exercise isolated catalog/native/parent-interruption acceptance. CI, package-consumer and release-wide checks remain deferred.

## Acceptance and limits

Use one actual two-client build, approved catalog release and one manager request for Claude user/project and Codex user. Prove package selection, all-or-block planning, canonical identities, private caller/plan snapshots, changed unchanged-basis rejection, install/update/remove and full completed replay. Exercise partial unavailable/uncertain outcomes and a parent stopped between a child completion and distribution acknowledgement. Observe fresh native sessions, exact retained bytes, preserved unrelated settings, ownership drift and cleanup. A mocked successful child does not establish native distribution.

Explicit negative requests cover duplicated labels, aliased physical destinations, missing/ambiguous packages, mismatched catalog metadata, unqualified workspace clients and MCP registration. Existing local lifecycle and catalog acceptance remain prerequisites, rather than substitutes for these new checks. Source authentication, deployed RBAC, IdP audience resolution, real workspace administration, other operating systems and unqualified agent packaging remain open milestones.

The isolated compiled CLI pilot passed on Claude Code 2.1.304 user/project and Codex 0.163.0 user scope. It completed 34 SDK commands and one interrupted parent, retained six distribution reviews and performed eighteen native mutation commands. It exercised unavailable and uncertain outcomes, child completion before parent acknowledgement, changed unchanged-basis rejection, fresh skill discovery, exact two-version payloads, terminal replay, removal, unrelated settings and cleanup. Source edits after review did not change approved bytes. These results qualify the local workflow; the wider native suite, CI, package-consumer and release gates remain deferred.

Main review accepted seven pure tests, seven runtime boundary/orchestration tests and two CLI tests. The final focused run also includes the existing CLI and catalog CLI suites, for 26 tests in seven files. Typecheck, strict Effect diagnostics over 112 files, scoped lint and the source build pass. Boundary tests use a controlled Installer; native claims come from the separate real-client pilot.

## Progress

- [x] Ground: trace compiler/capture, retained catalog, physical installation review/recovery and documented workspace distinctions.
- [x] Sketch: compare manager helpers, Installer extension and one distribution module.
- [x] Agree: the active goal authorizes implementation and isolated qualification.
- [x] Prove: S1-S4, D1-D4 and X1-X9, strict wire and independent expectations. The exact-type and standard-axiom audit checks 111/111 repository properties. The distribution checker passes 85 authored vectors, 207 permutations and 1,158 malformed requests.
- [x] Port: pure TypeScript with completed oracle conformance. Main-thread typecheck and seven focused tests passed before distribution I/O work began. They cover all 85 authored expectations and 1,681 generated comparisons with Lean.
- [x] Implement: owning state, native orchestration and manager CLI after completed pure conformance; isolated local native acceptance passed.
- [x] Scrap review: main inspected the final models, proofs, runtime, storage, CLI and tests. Complete reviews remain inside Distribution, local/workspace identities stay separate, and partial outcomes cannot become global success. No caller retry framework or plugin setup file was added.
