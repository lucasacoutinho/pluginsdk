# Codex project installations

The caller keeps the existing definition, build command and `Installer.plan/apply` interface. A project destination supplies its ordinary Codex home and physical project root. Basic packages qualify on Linux with Codex 0.163.0; the [acceptance record](codex-project-acceptance.md) defines the tested scope.

```ts
installer.plan({
  destination: { type: "project", host: "codex", home, root },
  intent: { type: "present", bundle }
})
```

## Grounding

Codex 0.163.0 reads trusted project `.codex/config.toml` above the user layer. Its plugin and marketplace mutation commands write the user config. App-server config writes reject project paths. Native loading requires both effective plugin enablement and an installed cache entry under the normal home. The cache key includes marketplace and plugin names.

Project-context `plugin/list` can populate a cache without an install command, but it selects plugins from the complete effective configuration. Disabling another plugin does not exclude its cache from refresh. Session flags merge tables and cannot replace the inherited plugin table. Listing is therefore unsuitable for a narrowly authorized mutation or a read-only inspection.

These facts come from the pinned native source and the [source trace](../../.audit/probes/codex-project-source/report.md). The existing SDK uses a stable marketplace per physical installation, native commands for changes and retained complete bundle bytes for ownership. Its original rationale avoids duplicating private native storage when native commands can own that behavior. Project scope has no such command. The new adapter must qualify the small cache layout it actually uses.

## Alternatives and synthesis decision

| Candidate | Consequence | Decision |
| --- | --- | --- |
| Separate Codex home per project | Changes authentication and settings inheritance; callers must launch Codex through a different environment. | Reject. |
| Project config plus native cache refresh | Keeps project activation but can change unrelated caches and cannot force an exact same-version replacement. | Reject. |
| One stable cache key plus a project config edit | Replacing the cache and changing activation creates independently visible intermediate states. | Reject for this adapter. |
| Immutable cache per revision plus one project config edit | Prepare inactive bytes, then atomically switch the project registration. Unrelated projects and user config retain their settings. | Select; native premise and SDK acceptance pass. |

Each approved revision derives a unique marketplace name from the physical target and plan identity. Its native cache entry is immutable. The project config contains one marked SDK block for the physical installation. Replacing the block switches both the marketplace registration and enabled plugin selector in one atomic file replacement. The native plugin name stays equal to the authored plugin ID.

Compiler continues to own package meaning. Installer owns cache preparation, project registration, retained identity and recovery. No new author file, launcher, public service or provider registry is required. Installer must distinguish its stable physical installation key from the revision's native marketplace key internally.

## Pure edit contract

[ProjectConfig](../../contracts/ProjectConfig.ts) represents an admitted config document as ordered external or managed segments. Managed segments have a block key and exact content. External segments and blocks owned by other keys are opaque.

An edit supplies its key, previously owned content or absence, desired content or absence, and the admitted document. It accepts exactly one matching previous block, or no block when previous ownership is absent. Duplicate blocks, an unowned block and changed or missing owned content reject. An unchanged request returns the original document. A change preserves every foreign segment in order and appends the desired block, or omits it on removal.

J1-J6 specify exact admission, exact rejection reasons, preservation of foreign bytes, exact desired content, unchanged documents and idempotence. The [Lean properties](../../spec/PluginSdk/Installer/ProjectConfig/Properties.lean) precede the implementation. This model does not prove a TOML parser or filesystem behavior.

## Native adapter obligations

The text admission step must parse the entire TOML before and after the edit, validate the exact controlled plugin and marketplace values, and compare all other parsed values. A marker inside a string, unknown controlled fields, ambiguous markers, sealed inline tables and unsupported syntax block the edit. Preserving segment bytes alone does not establish TOML meaning.

The reviewed plan captures the whole file's before digest and mode plus the previously owned block. It does not retain unrelated config contents. Desired bytes derive from the complete approved plan after its identity exists, as the existing generated marketplace does. Apply rechecks the complete before image under both the home and project locks. Both locks must survive caller termination through the execution worker.

Preparation writes and verifies the complete immutable package cache and retained marker before activating it. An interrupted preparation leaves the previous project activation intact. After activation, a fresh native process must load the new exact cache bytes. Old inactive caches can be removed only after complete retained ownership and byte checks. Interruption during that cleanup must not change the active revision. Removal atomically removes the owned block before cleaning its inactive cache.

Inspection must not call the app-server listing operation or implicitly refresh another plugin. It must bind the exact project block, native cache path, complete payload, retained plan and marker. A whole-file digest guards a reviewed edit but must not turn an unrelated later setting change into plugin ownership drift. Parent configuration, trust and effective overrides remain part of qualification.

The native premise probe uses two trusted projects and one isolated ordinary home. It must prove activation only in the selected project, unchanged user-config bytes, same-version replacement through another immutable cache, removal and fresh-session discovery. The SDK acceptance must then cover stale reviews, unrelated project settings, two writers, caller termination before and after activation, replay and drift. Basic formats qualify first; this design does not grant project support to hooks, stdio or companion agents.

## Implementation sketch

The adapter adds `project: ProjectCapture` to ready plans for Codex project destinations. The capture contains `before: FileBasis` (absence, or digest and mode) and `previous: Registration | null`. The plan commitment includes the capture. The previous registration must derive from the before receipt's retained revision. Other destinations reject this field. No foreign config text is saved in a plan or marker.

The project adapter has four internal operations: capture the reviewed file state, check it before execution, inspect the active owned revision, and execute the approved transition. `project-document` owns TOML admission and the proved segment edit. `project-file` owns physical reads and atomic replacement. Existing lifecycle decisions and settlement continue to govern the operation.

SDK operations acquire the home lock, then `<project>/.pluginsdk/installer/writer.lock`. Both descriptors pass to the execution worker. The locks serialize different homes editing the same project as well as different projects sharing one home. An empty physical `.codex` directory allows Codex to report whether that project layer is trusted before any plugin configuration is written. An untrusted or disabled layer blocks inspection.

Each revision has its own retained marketplace root and native cache key. A complete, verified cache is prepared before activation. Inspection reads effective configuration with plugin startup tasks disabled and never requests app-server `plugin/list`. It also checks the ordinary effective plugins feature through the read-only native feature command. Any other effective selector for the same authored plugin is unowned and blocks adoption, including one owned through a different Codex home.

The registration and complete active cache determine plugin ownership; unrelated later settings do not change that ownership. Their whole-file digest still invalidates an earlier review. Successful replacement or removal cleans the previous cache only after checking its complete retained bytes. A terminated cleanup can retain an inactive cache, which does not reactivate the plugin. Retained SDK plans and revision packages remain recovery evidence. Explicit repair admits confirmed inactive project state; an active owned revision settles through the original plan.

## Progress

- [x] Ground: trace native commands, project loading, cache identity and refresh side effects.
- [x] Sketch: compare separate homes, refresh, mutable cache and immutable revision activation.
- [x] Agree: the active milestone instruction authorizes design and isolated qualification.
- [x] Prove: J1-J6, strict oracle and independent cases.
- [x] Port: complete pure TypeScript conformance before native adapter edits.
- [x] Implement: qualify native premises, then add the project adapter and focused SDK acceptance.
- [x] Scrap review: native evidence supports the selected activation and ownership contract.
