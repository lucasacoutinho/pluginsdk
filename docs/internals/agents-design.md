# Agents across Claude and Codex

## Caller usage

An author adds an agent to the existing definition and keeps its prompt in Markdown:

```json
{
  "id": "team-kit",
  "version": "0.2.0",
  "description": "Shared engineering tools",
  "skills": [],
  "mcp": {},
  "agents": {
    "auditor": {
      "description": "Review a proposed change",
      "prompt": "agents/auditor.md",
      "models": {
        "claude_code": "haiku",
        "codex": "gpt-6.1-sol"
      },
      "shell": "deny"
    }
  }
}
```

`pluginsdk build definition.json` builds both packages. Existing plan, show, apply and removal commands manage the complete installation. The caller does not copy a Codex role, edit client configuration or coordinate a second lifecycle.

`models` is optional. When omitted, the SDK leaves each client's configured model selection in control. Explicit models name both clients because their model identifiers differ. The SDK preserves those identifiers; it does not resolve aliases or promise that an organization permits a requested model. `shell` is optional and accepts `host_default` or `deny`. Denial removes the native shell tool. It grants no other tool and makes no claim about filesystem access through other tools or backend authorization.

These are agent controls, not a universal native tool allowlist. Codex's inspected role implementation can reduce shell/apps/plugins/memory/permission-request features but cannot change role-level web search or delegation. The interface must reject unsupported controls rather than imply that a similarly named setting enforces them. Additional controls require their own semantics and native acceptance.

## Grounded flow

The Compiler captures source files and builds a complete immutable bundle. Installer reviews its target and before-state, retains the approved plan, then runs one native recipe under an inherited host-home lock. Observation verifies the registration, marker, retained plan and exact source/cache payload. Recovery observes and settles without replaying a native mutation. Distribution retains and invokes those same native plans.

Claude 2.1.304 loads Markdown agents from an installed plugin's `agents/` directory. Existing native evidence observes the scoped name, prompt marker, selected model and a denied Bash call. Codex 0.163.0 ignores the tested plugin-contained role file but loads the same TOML from `CODEX_HOME/agents/`. A real child request preserves the role prompt/model; a forced disabled shell call is rejected by the native tool router. This is tool exclusion, not OS sandbox enforcement.

The pinned Codex source uses the TOML `name` as the role identity and discovers `.toml` files recursively. User roles can shadow built-ins; project layers can override user roles. No standalone role installation command was found. The SDK therefore needs ownership of a regular companion file, not just a native marketplace entry. Fresh client sessions establish discovery; hot reload is not assumed.

The relevant source is Codex commit `83086188ae0614bd882818ff1aa23f3194962012`, especially `codex-rs/agent-roles/src/{loader,agent_role_config,discovery}.rs` and `codex-rs/core/src/agent/role.rs`. Rolling [Claude agent documentation](https://code.claude.com/docs/en/sub-agents) and [plugin components](https://code.claude.com/docs/en/plugins/components) supplement direct observations. Native behavior remains bound to the exact tested binaries.

## Alternatives and synthesis decision

| Candidate | Caller and ownership consequences | Decision |
| --- | --- | --- |
| Put native agent files in each plugin package | Small build change, but Codex does not discover the tested package-contained role. | Reject. |
| Add a separate public agent installer or require a client launcher | Callers coordinate plugin and role changes, drift checks and recovery. A plugin can appear installed while its role is absent. | Reject. |
| Extend complete bundles and reviewed Installer operations with owned companion files | One authoring/build/lifecycle interface hides placement, retained-byte validation, name collisions and partial outcomes. | Select. |

Compiler owns prompt capture, metadata, deterministic rendering and format admission. Installer owns companion placement, collision observation, exact reviewed transitions, writes and recovery. ReleaseCatalog and Distribution retain the resulting complete bundles and native plans. No public agent module or provider framework is added.

## Selected schemas

`Plugin.agents` is an optional record keyed by a distinct branded `AgentName`, using the existing portable kebab-case grammar. Each value contains `description`, relative `prompt`, optional two-client `models` and optional `shell`. Descriptions, prompt text and model identifiers require valid Unicode. Empty descriptions/prompts, NUL and reserved model-control strings reject. Prompt capture uses the existing physical containment checks and normalizes only outer whitespace, matching native agent document parsing.

The internal render input contains the plugin identity, selected host and captured named agents. Each agent has a description, prompt, nullable selected model and shell policy. The output contains canonical entries with a contained native path, qualified identity and complete structured native document. YAML/TOML encoding remains a checked implementation obligation, like JSON encoding in the existing compiler. Claude receives `agents/<name>.md`, optional `model` and optional `disallowedTools: [Bash]`. Codex receives `agents/<name>.toml`, `name = <plugin>:<name>`, optional `model` and optional `features.shell_tool = false`.

New agent-capable formats extend the existing newer native formats. Older formats reject agent declarations and retain their previous bytes and commitments. The CLI chooses the new formats only when agents are present. Initially only Claude 2.1.304 and Codex 0.163.0 user profiles are candidates for qualification; another version or scope requires direct evidence.

For Codex, Installer derives a fixed regular filename under `CODEX_HOME/agents/` from the plugin and agent identities. A filename and declared role name both participate in collision checks. The review captures the complete previous and desired companion bytes. Canonical create, replace, keep or remove actions derive from that pair; the plan does not store a second editable action list. Optional companion data preserves existing schema-1 plan decoding and commitment preimages when absent. It is mandatory whenever the current or desired installation contains Codex agent roles. Callers cannot supply arbitrary paths or adopt an existing file by matching its bytes.

The previous owned set comes from the current verified receipt, marker and retained bundle. Missing files, changed bytes/mode, symlinks, duplicate role names and conflicting declarations block. New roles require proven absence. Apply rederives and compares the complete transition before persisting pending state. Completed replay remains a no-op; pending recovery only observes and settles. Native observation includes owned companion bytes so it cannot report installation success while a role is missing, or absence while owned active roles remain.

Partial writes remain pending and uncertain. Reviewed repair must include exact owned companion residuals after process quiescence and native plugin absence. It must not treat an orphan role as proven absence or remove a changed/unowned role. External project overrides and future client settings can change effective runtime behavior; installing a user role cannot authorize or freeze every project configuration.

Repair distinguishes `absent`, `marketplace`, `companions` and `marketplace_and_companions`. Each nonempty residual authorizes its matching cleanup, and every retry of the same cleanup only observes. A repair review captures the surviving exact owned role bytes with an empty desired set. Those bytes must come from the interrupted operation's previous or desired capture; a similar filename or a matching digest without that binding is insufficient. Completion requires both native registration and owned active roles to be absent.

## LDD obligations

Before implementation, fix two internal contracts:

| Model | Required properties |
| --- | --- |
| Agent rendering G1-G8 | Exact declaration accounting; qualified names; preserved prompt, description, selected model and shell denial; contained distinct paths; complete canonical duplicate diagnostics; positive acceptance; enumeration invariance; empty-input preservation. |
| Companion review F1-F8 | Accepted transitions require exact owned before-state and absent new files; every safe unique request succeeds; issues are complete and canonical; every required key appears exactly once; actions preserve exact before/after identities; unrelated observations cannot authorize a write; enumeration invariance; an unchanged owned set needs only keep checks. |

Main fixes the Lean interfaces and property statements, then proves total models, checks authored strict-wire vectors and completes pure TypeScript conformance. Installer I/O waits for those checks. Native acceptance must build from the author definition, install and dispatch the qualified name in fresh clients, verify prompt/model and shell denial, change prompt/model/policy, update, replay, reject drift/unowned names, remove and show fresh-session absence. Interruption must leave a truthful pending/completed result and preserve unrelated files/settings.

## Native acceptance

SDK-built agents are qualified on Linux in Claude Code 2.1.304 user scope (`claude_code_v5`) and Codex 0.163.0 user scope (`codex_plugin_v2`). The author keeps [one definition](../../test/fixtures/plugins/agents/definition.json) and [one prompt](../../test/fixtures/plugins/agents/auditor.md); one build command produces both packages.

Two compiled-CLI pilots each completed 33 commands and one interrupted apply, with 124 native commands, twelve mutations and six fresh sessions. Both clients dispatch the exact plugin-qualified name. Distinct child requests preserve the authored prompt marker and selected model. Forced Bash and `exec_command` calls reject under `shell: deny` without writing their sentinel. Replacement changes the shared prompt, both native models and shell policy; fresh children observe those changes and expose the shell under `host_default`, without executing it.

Install, replacement and removal replay issue no new mutation. Codex planning rejects a byte-identical unowned file, a nested alias, changed mode and changed bytes. The interrupted removal stops the SDK parent and its separate native execution group after marketplace removal but before companion cleanup. The original plan only observes and returns uncertain. A fresh review captures the `companions` residual, removes only exact owned role bytes and replays without another native command. Fresh sessions establish absence. Unrelated settings/files survive and all owned temporary homes/processes are removed.

The second pilot interrupts after plugin removal while the marketplace and role remain. Fresh repair classifies `marketplace_and_companions`, removes the owned marketplace exactly once and then its captured role, and completes. Replay performs zero further native mutations. The same fresh-session absence, unchanged settings and complete process/home cleanup checks pass.

Evidence is retained in `.audit/probes/agents-sdk/run-2026-10-21T09-39-07-385Z/summary.json` and `.audit/probes/agents-sdk/run-2026-10-21T09-44-30-278Z/summary.json`. The fixtures run real clients against static loopback provider responses inside a network namespace. They verify native dispatch and tool handling, not model inference, third-party authentication or OS sandbox enforcement. Claude need not repeat the qualified agent identity inside the child's prompt: the observed native `Agent` call names that identity, and the child receives its distinct authored prompt and model.

The feature's focused local checks pass 38 tests across nine suites, a source build, TypeScript checking, scoped lint and Effect diagnostics over 40 files with no errors, warnings or suggestions. G1-G8 and F1-F8 have exact certificates using only standard Lean axioms; 30 dependent catalog/package/selection/profile/repair certificates were rechecked. Pure conformance completed before I/O integration. The combined proof/release gate and CI remain deferred.

Other client versions, project scope, further agent controls and native hot reload require separate acceptance. Role inspection is bounded to 4,096 inventory paths and 2 MiB per file. SDK locks coordinate SDK writers; immediate byte/mode checks and atomic file operations do not serialize arbitrary external edits.

## Progress

- [x] Ground: trace compiler, retained plans, native execution, ownership and recovery; inspect native agent evidence and pinned role loading.
- [x] Sketch: compare package-only, separate lifecycle and integrated companion ownership.
- [x] Agree: the milestone goal authorizes the selected implementation and isolated native acceptance.
- [x] Prove: exact rendering and companion-review properties, strict wires and authored vectors.
- [x] Port: complete pure TypeScript oracle conformance before I/O edits.
- [x] Implement: complete compiler/Installer integration and real native lifecycle.
- [x] Scrap review: two authored files and one build/lifecycle interface; native names, prompt/model/tool semantics, exact ownership and both interrupted-removal residuals accepted.
