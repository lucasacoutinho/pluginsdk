# Qualified native profiles

## Outcome and current flow

An author keeps the same definition and build command when a qualified client changes version. Installer chooses an evidenced native profile from the actual client version, scope and package format. Unknown versions, platforms and feature combinations reject. A fresh review can recognize an owned payload after a compatible client version change; a plan reviewed against the previous version remains stale.

`Compiler.build` owns native package meaning and bundle identity. `resolveTarget` resolves physical paths and executes the selected client's version command. The internal [profile table](../../src/installer/target/profiles.ts) qualifies exact host, platform, version, scope and format combinations. Installer commits the selected version and adapter revision into `Target`. `Installer.apply` resolves the target again before and after locking, then compares the complete target to its reviewed value.

`observe` checks an installed payload against its retained native plan and marker. The previous implementation compared the marker target directly with the current target, including version. Accepting another executable version alone would therefore make an unchanged owned installation look unowned after an upgrade. Ownership compatibility and plan freshness require different comparisons.

The existing physical key, locks, retained bundle validation, native inventory, fingerprint and receipt rules remain prerequisites. An adapter revision names one installation/inspection contract. Sharing that revision across versions requires actual native evidence; a semver comparison cannot establish compatibility. Repository history and the accepted design explain these choices. There is no deployed incident, issue tracker or production telemetry for this local alpha that supplies another policy owner.

## Caller usage and alternatives

The caller continues to use `Installer.plan/apply`, including through Distribution. It supplies no version range, compatibility override, profile registry or migration callback.

| Candidate | Interface and consequence | Decision |
| --- | --- | --- |
| Let callers accept version ranges | Clients with unobserved behavior can pass; each caller owns native qualification. | Reject. |
| Add one version array to each host | Compact, but implicitly grants every scope and package feature to every listed version. Direct marker-target equality still breaks ownership across versions. | Reject. |
| Internal explicit profile selection and ownership compatibility | One query selects an exact evidenced host/platform/version/scope/format combination. A second pure relation permits retained ownership only within a registered adapter contract. | Select. |

The Compiler and Installer keep their existing interfaces. The internal Compatibility model owns the two relations. Native commands, profile data and target projections stay inside Installer. This earns its place by preventing callers and several inspection paths from repeating qualification policy. It does not add a provider framework or a new public service.

## Contracts and rules

A profile contains host, platform, exact version, scope, adapter revision and a nonempty list of qualified formats. Selection takes a complete profile list and exact query. A null format is an inspection/removal query. A concrete format must occur in the selected profile. Exactly one eligible occurrence selects; no occurrence or several occurrences block. Duplicate identical rows are ambiguous. Enumeration order changes no result.

Ownership input names the retained and current profile identities and the complete approved profile list. Each identity must resolve to exactly one row. Reuse additionally requires equal host, platform, scope and adapter revision. Version equality is deliberately unnecessary once both versions are qualified under that same contract. Missing or duplicate registrations block reuse.

Installer also requires equal physical installation key, canonical destination, plugin identity and adapter revision. The retained marker and retained native plan must still bind each other exactly, including their original version and commitment. Complete staged/loaded bytes and native metadata must still agree. This relation changes neither the reviewed plan nor its target. `apply` continues to reject the old target after a version change.

Pending native operations retain their original profile/version. A client change does not authorize replay or automatic migration of a pending command. Repair and recovery need their existing exact review. No profile is activated merely because a file or release note names a version.

## LDD obligations

| ID | Required claim |
| --- | --- |
| N1 | Selection returns only the sole eligible profile occurrence for the exact host, platform, version, scope and optional format. |
| N2 | Every sole eligible occurrence is selected. |
| N3 | Unqualified and ambiguous results describe exactly zero and multiple eligible occurrences. |
| N4 | Reordering profile rows cannot change selection. |
| N5 | Ownership reuse holds exactly when both identities have unique registrations and agree on host, platform, scope and adapter revision. |
| N6 | Ownership reuse cannot cross host, platform, scope or adapter revision. |
| N7 | Two uniquely registered identities in the same adapter contract can reuse ownership even when their versions differ. |
| N8 | Reordering profile rows cannot change ownership compatibility. |

The [Lean interface and properties](../../spec/PluginSdk/Compatibility/Properties.lean) preceded the model and its eight certificates. The exact-type and axiom audit passes all 119 project properties. The [wire checker](../../spec/scripts/check_compatibility.py) passes 44 authored vectors, 212 permutations, 697 malformed requests and six numeric-schema cases. The [TypeScript conformance suite](../../test/compatibility.test.ts) adds 1,664 generated comparisons. These checks passed before Installer I/O edits. Native checks establish whether concrete rows belong in the approved table; the pure model cannot qualify a client by itself.

## Native acceptance

The approved Linux profile table is:

| Client | Version | Scope | Formats |
| --- | --- | --- | --- |
| Claude Code | 2.1.303 | user | `claude_code_v1`, `claude_code_v2` |
| Claude Code | 2.1.303 | project | `claude_code_v1`, `claude_code_v2` |
| Claude Code | 2.1.304 | user | `claude_code_v1`, `claude_code_v2`, `claude_code_v3`, `claude_code_v4`, `claude_code_v5` |
| Claude Code | 2.1.304 | project | `claude_code_v1`, `claude_code_v2` |
| Codex | 0.162.1 | user | `agent_plugins_v1`, `agent_plugins_v2` |
| Codex | 0.163.0 | user | `agent_plugins_v1`, `agent_plugins_v2`, `agent_plugins_v3`, `codex_plugin_v1`, `codex_plugin_v2` |
| Codex | 0.163.0 | project | `agent_plugins_v1`, `agent_plugins_v2` |

Basic formats contain skills and remote HTTP MCP declarations. V2 also admits root assets. Bundled stdio and hooks retain their separate [MCP](local-mcp-design.md) and [hook](hooks-design.md#sdk-lifecycle-qualification) evidence on the newer user profiles. Agents add [separate SDK lifecycle evidence](agents-design.md#native-acceptance) for `claude_code_v5` and `codex_plugin_v2` on those same user profiles. Additional-version evidence does not extend those features. The exact profile table rejects unqualified project-scope advanced formats.

The compiled CLI pilot completed 76 commands and interrupted three additional parents across isolated Claude user/project and Codex user homes. It used all four exact binaries and both basic formats. Thirty native mutations completed installation, cross-version update, explicit replacement in each format and removal. Fresh native processes checked complete source/cache bytes, executable bits, skill discovery and remote MCP. Claude connected and listed tools; Codex also completed five direct loopback tool calls.

Each destination recovered under the older client version after termination between native completion and the idle journal rename. Resume and completed replay issued no further mutation. A plan reviewed on either version rejected as stale on the other. A fresh review retained ownership and supported update or unchanged verification across the version change. Modified payload bytes, a missing SDK receipt and a schema-valid marker version that disagreed with its retained plan blocked writes. Settings survived, native entries were removed and all temporary homes and processes were cleaned. Two probe setup errors were corrected before any native mutation; they are retained separately from the accepted run.

Pure and Installer projection checks also reject unknown versions/platforms, ambiguous rows, unqualified scopes/formats, and changed physical keys, destinations, plugin identities or adapter revisions. The full native suite was not rerun. Process termination does not simulate power loss.

Codex 0.163.0 project scope uses the separate `codex-project-cache:1` adapter. Its [design](codex-project-design.md) and [acceptance](codex-project-acceptance.md) cover immutable cache preparation, atomic project activation, exact owned bytes, stale reviews and inherited locks. It qualifies basic packages without extending project support to bundled stdio, hooks or agents.

Windows x64 qualifies Claude Code 2.1.304 and Codex 0.163.0 for basic user and project installations. The [support table](../compatibility.md) links each native qualification, including the [Claude project lifecycle](windows-claude-project-cli-acceptance.md). Advanced Windows formats, other versions and pending-operation migration remain separate qualifications. macOS has no available host and remains deferred, as do CI and package/release gates.

## Progress

- [x] Ground: trace version resolution, target commitments, ownership marker validation and native execution.
- [x] Sketch: compare caller ranges, version arrays and explicit profiles with a separate ownership relation.
- [x] Agree: the active milestone goal authorizes implementation and isolated qualification.
- [x] Prove: N1-N8, strict wire and independent vectors.
- [x] Port: complete pure TypeScript oracle conformance before Installer I/O edits.
- [x] Implement: exact profile selection, retained ownership and focused native acceptance.
- [x] Scrap review: retain existing caller interfaces, exact plan freshness and only evidenced profile rows.
