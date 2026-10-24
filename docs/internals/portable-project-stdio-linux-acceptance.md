# Portable packages in Claude Linux projects

Claude Code 2.1.304 project installations on Linux now accept both portable formats. An ordinary `pluginsdk build` selects v1 for bundled stdio-only plugins and v2 for plugins with hooks or agents. The existing reviewed project installation workflow installs either output. No author format option or new SDK file is needed.

The [v2 normal lifecycle](portable-features-project-linux-acceptance.md) and [v2 recovery matrix](portable-features-project-recovery-acceptance.md) supply hooks, agents and MCP evidence. This phase qualifies the remaining v1 workflow, then enables both formats in one production profile row. The [selected design](../../.audit/probes/portable-project-stdio-linux/design.md) retains the existing compiler, adapter, ownership and recovery rules.

## Definition, model and native gates

Two stdio-only definitions retain the preceding fixture's skill, MCP server, evidence helper, literal arguments, environment and package-relative working directory. Hook and agent declarations and their unused files are omitted. Two ordinary CLI builds discover these definitions without target or format flags. They produce four complete Claude/Codex v1 bundles with nine files each. The shared 323,628-byte runtime is unchanged.

The existing 318-proof checkpoint is carried forward. N1–N8 already quantify exact profile scope and format membership; no model or public schema changes. Main compiles the private profile with pinned Node 24.18.0 and TypeScript, then loads its emitted table in a fresh process. All 342 comparisons agree with Lean and independent membership expectations, including reversed enumeration and twelve neighboring refusals. Explicit assertions require both project portable formats in the final table.

The normal project lifecycle passes thirteen fresh SDK requests, fixed points and three mutation-free replays. Native MCP calls return different generation markers after replacement. Receipt identities bind the original reviewed plan and exact bundle digest. Another project sharing the home has a distinct physical target key; its plan is reviewed but never applied. Eight fresh sessions there remain unaffected across installation, replacement and removal.

Nine further cases qualify interruption before and after installation, replacement and removal, caller-only death before and after installation, and marketplace-only repair after partial removal. Every fresh recovery preserves the pending plan and settles without another native execution. Both inherited leases survive caller death and block competing writers until the worker finishes. Repair executes once, replay adds no mutation, and the superseded original plan returns `stale_plan`.

| Accepted v1 matrix | Result |
| --- | --- |
| SDK requests | 65; 56 strict replies and nine intentionally interrupted callers |
| Registration mutations | 28, confined to original execution, setup or explicit repair |
| Mutation-free recovery/replay operations | 23 |
| Usable MCP generations | 9, with real native calls and updated responses |
| Complete payload observations | 81 files independently compared to frozen bundles |
| Fresh project B sessions | 26, without the plugin's tools or processes |
| Controlled pidfds | All 18 terminal and closed; adopted workers reaped |
| Direct command handles | All 154 closed |

Each accepted case uses a fresh user, network, PID and mount namespace with a private home and two projects. User settings, project B settings and unrelated project A settings are preserved. Providers close, final inventories contain no live namespace process, and no accepted case requires a timeout or forced cleanup.

## Corrections and promotion

The first worker oracle run loaded a cached pre-compile table. Main rejected it after inspecting the raw requests and reran the check against the final emitted table. Those original records remain retained and do not qualify the new row.

The first native fixture demanded clean stdin EOF from the MCP child. Claude completed the MCP call, terminated the child and left no live processes, without an EOF event. Main retained that failed attempt and corrected the assertion to require actual process completion. The subsequent normal lifecycle and all nine recovery cases use the same corrected harness. Backend controls still verify graceful EOF for a directly driven server.

Production changes only `src/installer/target/profiles.ts` and its two emitted artifacts: the Linux Claude 2.1.304 project row gains the exact two qualified portable formats. All 731 production candidate files match the pinned, uninstrumented compile. A fresh production check agrees with all 342 retained Lean vectors. Two ordinary production CLI builds reproduce all four qualified v1 bundles and 36 payload files exactly. Build selection, runtime, public schemas and I/O implementations retain their preceding bytes.

Twenty-seven focused profile/build tests across six suites, scoped test typechecking and changed-file lint pass. The check record, source beforeimages, frozen fixtures, raw native records, strict decoders, per-case SDK snapshots and main acceptance live under `.audit/probes/portable-project-stdio-linux/`. Its acceptance seal binds this promotion to the preceding v2 recovery checkpoint. This is progress toward the expansion milestones; it does not complete the roadmap.

Windows project portable packages remain next. Codex project roles and actual revision-cache process admission still require design changes. Linux Claude's existing persistent-descendant shutdown limit remains. macOS has no available host. Grok native testing, third-party authentication, CI, package-consumer/release checks and publication remain deferred.
