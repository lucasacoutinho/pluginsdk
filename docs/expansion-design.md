# Expansion design

## Problem and current flow

The lstack pilot has 34 skills, 151 files below `skills`, nine executable files and three third-party licenses. Its root `LICENSE` and `NOTICE.md` also belong in the package. The existing compiler accepts skill directories and remote MCP definitions, so it cannot represent those supporting files.

`Compiler.build` snapshots the authoring schema, then `capture` opens contained regular files and retains their bytes. `render` produces generated native JSON and copy references. Materialization resolves those references from the captured content table; native validation and the bundle digest complete the result. `Installer.plan` validates that complete artifact before acquiring its home-wide lock and inspecting native state. `apply` retains the complete plan before its one-shot native worker starts. Pending replay only observes and settles. These boundaries keep source reads, native formats and ownership decisions out of the caller.

The reason for retaining pending state is explicit in [the original design](design.md#mutation-and-recovery), [runtime obligations](runtime.md) and the crash checks: a missing result does not prove that a native write cannot commit later. The current conversation and `.audit/delivery.tsv` are the decision records. Before repository initialization there was no Git history or remote project. No project issue tracker, team chat, production telemetry, exception tracker or analytics source is configured for this prototype; unrelated personal sources do not establish its rationale.

## Usage

The pilot author lists supporting files and directories using their existing package paths:

```ts
const plugin = {
  id: "lstack",
  version: "0.2.1",
  description: "Portable engineering workflows",
  skills: ["skills/architect", "skills/lstack"], // pilot lists all 34
  assets: ["LICENSE", "NOTICE.md", "third_party"],
  mcp: {}
}
```

The caller still uses `Compiler.build`, followed by `Installer.plan` and `Installer.apply`. The new build formats are `agent_plugins_v2` and `claude_code_v2`; existing v1 formats keep their original accepted contents and rendering rules. The v2 formats use the same pinned native manifest specifications and add explicit package assets. Version 1 bundles and saved plans remain readable.

## Candidates and synthesis

| Candidate | Caller knowledge and module depth | Decision |
| --- | --- | --- |
| Copy a whole native package root | The author must manage native manifests, client-specific metadata, ignore rules and competing component declarations. Source capture cannot distinguish requested portable features from native behavior hidden in arbitrary files. | Reject for portable authoring. |
| Expose a file-map builder | The caller arranges generated manifests and copied files, resolves collisions and coordinates validation. This exposes the compiler's internal pipeline. | Reject. |
| Explicit skills, MCP and supporting asset paths | The compiler owns traversal, reserved native namespaces, collisions, content preservation and native validation. The author names only intended contents. | Select. |

The main thread selects explicit assets. An internal assembly model combines the existing renderer's materialized base with captured supporting files. It has no public service or file-writing operation. This keeps the 26 existing properties applicable to the unchanged v1 model while new assembly properties prove the v2 extension. The public surface remains two deep modules.

## Shape and properties

`Plugin.assets` is an optional array of `PackagePath`. Each path names one regular file or a directory tree, retained at the same package-relative path. Capture uses the same opened-file containment and byte snapshot rules as skills. Repeated requests remain collisions, including equal bytes. Generated component namespaces cannot be introduced through assets.

The internal assembly input contains a nonempty `base` of captured output files and an `assets` list. Each captured output has `path`, `digest` and `executable`. Assembly returns the full canonically ordered list or structured `path_collision` and `reserved_asset` issues. It computes no hashes and performs no I/O.

Reserved roots, compared with ASCII case folding, are `plugin.json`, `mcp.json`, `.mcp.json`, `.lsp.json`, `.claude-plugin`, `.codex-plugin`, `.claude`, `.codex`, `skills`, `commands`, `agents` and `hooks`. A reserved root and every descendant are unavailable to supporting assets. Requested native components must use their own authoring contracts.

The Lean assembly obligations are:

| Property | Required claim |
| --- | --- |
| A1 | Equal inputs give equal output; accepted files and rejected issues use strict canonical ordering. |
| A2 | Every requested base or asset file appears exactly once with the same path, content identity and executable bit after successful assembly. |
| A3 | Every accepted output file came from the base or asset input. |
| A4 | Accepted paths are contained and pairwise free of the established case-folded file/descendant conflicts. |
| A5 | Collision and reserved-asset diagnostics are sound and complete; no valid requested file disappears to make a package acceptable. |
| A6 | Reordering base files or assets preserves the result. |
| A7 | If no paths conflict and no asset uses a reserved root, assembly succeeds. |

The compiler materializes the base once, assigns actual byte digests, adds those bytes to its private capture table and invokes this model. Its final package is materialized from the accepted assembly, checked against the appropriate native profile and committed by the existing bundle digest. Native validation accepts supporting files only in v2 and applies the same reserved-root predicate when checking imported bundles.

The real pilot also exposes a metadata extension: `rick-mode` has a nested `metadata.lstack` object. The [Agent Skills specification](https://agentskills.io/specification#metadata-field) defines string-valued metadata, so v1 continues to reject that extension. V2 accepts a JSON object for skill metadata and preserves the complete `SKILL.md` bytes. It still validates skill names, descriptions, YAML syntax and directory binding. Metadata does not become an executable component or a generated native manifest field. Fresh discovery in both native hosts is the acceptance check for this extension; successful compilation alone does not establish host support.

## Tradeoffs and remaining design

Explicit asset selection requires a short package definition. It prevents an unmentioned native hook or manifest from acquiring behavior merely because it exists in the source directory. Source manifests are regenerated from declared portable metadata; host-specific display metadata is a separate authoring feature rather than an arbitrary passthrough.

The pilot remains read-only at its installed source. Updates modify an isolated source copy, and host checks use isolated homes. All 34 skills, support files, executable bits and cross-skill references must be accounted for. Existing missing provenance links in lstack's cached `NOTICE.md` remain source-package findings, rather than SDK-created files.

The separate [repair contract](repair-design.md) selects a new reviewed cleanup plan tied to a retained pending operation and fresh quiescent native evidence. Its runtime handles proven absence and orphaned owned marketplaces. It retains ownership evidence instead of providing a force/forget escape hatch; other partial states remain blocked.

Third-party MCP authentication is deferred at the user's request. The release uses MIT and a private repository. Cloud destinations still require evidenced plugin lifecycle contracts; a team setup script API does not establish plugin uninstall or native ownership.

## Acceptance and next step

Assembly A1 through A7 are proved, connected to the strict oracle and ported with TypeScript conformance. V2 capture and native validation pass the [lstack lifecycle pilot](pilot.md). The separately proved [repair contract](repair-design.md) also has native acceptance. The [roadmap](roadmap.md) records the remaining expansion and organization contracts.
