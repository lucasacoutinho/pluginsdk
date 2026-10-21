# Delivery roadmap

## Active expansion

The next release must complete all six milestones below. The completed local alpha is the baseline, rather than acceptance for these new requirements. Each contract change follows property, Lean proof, oracle, TypeScript conformance and native acceptance.

| Milestone | Required result | Current state |
| --- | --- | --- |
| Real-plugin pilot | Build all lstack skills and required supporting files; install, discover, update and remove in isolated fresh Claude and Codex sessions. | Complete for Claude user/project and Codex user: 34 skills, 151 skill files, six supporting files and nine executables. [Pilot record](pilot.md). Third-party MCP authentication deferred by user. |
| Private alpha | MIT package in a private repository with successful remote CI and verified package-consumer acceptance. Public publication stays deferred while the project is private. | Private repository created; baseline CI passed on an ephemeral runner. Expansion needs its own exact-commit gate. |
| Explicit repair | A reviewed recovery operation for quiescent partial installations, with ownership, replay and crash properties. | Eight proved repair properties, strict oracle and conforming TypeScript model. Native residual classification and runtime integration remain pending. |
| Plugin features | Local MCP, hooks and agents with preserved semantics, formal checks and native evidence. Prioritize requirements found in the pilot. | Host contracts under investigation. |
| Compatibility | More evidenced CLI versions, Codex project scope, macOS and Windows. | Baseline is the pinned Linux profiles below; other environments require direct evidence. |
| Grok Bot and Meta Muse | Working authenticated inspect/install/update/remove contracts and real-host acceptance. | Public management contracts under investigation; an unsupported result does not complete this milestone. |

Architecture checklist for this expansion:

- [x] Ground: traced source capture, native ownership and recovery; inventoried lstack and current host contracts.
- [ ] Sketch: compare complete alternative contracts in the main thread and record the selected shape.
- [x] Agree: the instruction to complete all milestones authorizes implementation without an additional design approval.
- [ ] Implement: prove each selected property before implementing its TypeScript and native behavior.
- [ ] Scrap: reassess the shape when model counterexamples or native evidence contradict it.

## Completed local alpha

The first release builds existing Agent Skills directories and remote HTTP MCP definitions, then installs their native packages in Claude Code and Codex. Grok Bot and Meta Muse require independently evidenced installation contracts. Hooks, agents and local MCP processes follow a separate design cycle.

| Milestone | Required evidence | Status |
| --- | --- | --- |
| Design acceptance | Build, install, replace, remove, drift and crash/retry scenarios agree with the public schemas and Lean protocol. | Complete; two public modules and qualified runtime obligations |
| Effect foundation | Pinned Effect and tsgo; strict compiler and diagnostics; pure TypeScript agrees with the Lean oracle on vectors and generated sequences. | Complete; 26 proofs, 4,210 conformance requests, zero diagnostics |
| Working compiler | Deterministic complete bundles; source containment; skill validation; canonical identity; pinned native validation. | Complete for Linux capture and the two initial formats |
| Claude Code lifecycle | Isolated native discovery; durable reviewed plans; safe updates/removal; interrupted execution and recovery; unrelated settings preserved. | Complete for 2.1.304 user/project scope; MCP discovery qualified separately from model use |
| Codex lifecycle | Same authoring definition and public interface; evidenced format/scope compatibility; isolated native discovery and lifecycle checks. | Complete for 0.163.0 user scope, including a native loopback MCP tool call |
| Alpha distribution | SDK and CLI package; reproducible package acceptance; author example and usage instructions; CI gates. | Local alpha and consumer acceptance complete; CI configured; registry publication is a release decision |
| Expansion evidence | Official Grok Bot and Meta Muse investigation; explicit unsupported results where installation or observation remains unverified; future feature acceptance criteria. | Complete; official-source findings and typed unsupported results |

The [acceptance record](acceptance.md) names the executable checks, native qualifications and release limits. The working package is `pluginsdk@0.1.0-alpha.0` under [MIT](../LICENSE) in a private repository. Public registry publication is deferred.

## Acceptance story

An author builds a plugin containing one skill, a supporting binary asset with its executable bit, and a remote HTTP MCP definition. The compiler captures all content, validates it and returns a reproducible bundle. The author reviews a persisted installation plan. Editing the source afterward cannot change what that plan installs.

Applying the plan installs exactly the approved bytes and produces a verified ownership receipt. Applying it again acknowledges completion without another native mutation. Building changed source and reviewing another plan replaces only the owned installation. An absent intent removes that installation and retains the completed operation's revision.

Unowned content and changed owned content block replacement or removal. A changed plan commitment, physical destination, host profile, native version or before-state rejects an old plan. Unknown inspection blocks writes. Pending operations retain their full reviewed plan and recover by inspection and settlement without repeating a native mutation.

The acceptance harness terminates execution before and after durable pending state, native writes and completed-journal writes. A fresh process must distinguish installed, removed, not-applied and uncertain outcomes. Native host loading and MCP usability are checked separately from package validation.

## Later feature gates

| Addition | Required design and acceptance before support |
| --- | --- |
| Grok Bot or Meta Muse | A documented management API, stable target/install identity, versioned authoring contract, inspect/install/update/remove semantics, authorization scope and quiescence evidence. Revisit `Destination` for a cloud-managed target instead of inventing a local home. Add a counterexample, model/property changes where needed, TypeScript conformance and real isolated host acceptance. |
| Hooks | Map event names, input/output schemas, blocking behavior and ordering per host. Reject unrepresentable semantics. Prove normalization/rejection rules and exercise accepted hooks in each native event. |
| Agents | Specify prompt, namespace, model and tool-permission semantics. Prove deterministic rendering and collision handling, then verify native discovery and effective permissions. |
| Local MCP | Specify executable identity, arguments, working directory, environment references, approval and process lifetime. Require contained packaging, native startup/tool-call/shutdown evidence and recovery behavior before exposing authoring schemas. |

Each addition follows the same property → Lean model/proof → oracle → TypeScript → native evidence sequence. Unknown native fields and silent feature dropping remain outside the interface.

## Architecture phases

- Ground: retain the current contracts, models and native evidence; preserve `.references`.
- Sketch: use the selected two-module design in `design.md`; compare any required redesign before implementation.
- Agree: the instruction to complete the roadmap authorizes implementation.
- Implement: port pure functions, establish conformance, then add source and host I/O.
- Scrap: revise a model or contract when native evidence contradicts it; retain a counterexample before changing the implementation.
