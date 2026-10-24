# Preview routing

Default preview must make one authored plugin available in the selected clients without installing a second copy into a client that already imports the selected provider's copy.

The [native counterexample](../../.audit/probes/cursor-callers/preview/attempt-002/counterexample-main-checked.json) completes six compiled CLI commands and ten actual Installer requests on Windows. Explicit Cursor installation, replay and update succeed. Two fresh windows show the expected 34 skills. Default preview then installs Claude and Codex while leaving the Cursor copy in place. A third fresh Cursor window shows two plugin rows and a generic Plugins group headed `68`, with duplicated visible skill names. All sixteen retained process witnesses terminate, the three GUI children close normally and the owning job has no descendants. The 2,081 runtime files and six main-reviewed post-command screenshots remain retained. This is a failed default-preview gate, not a qualification.

The source-only prediction that both copies would receive the same humanized title was also false. The local row uses a humanized name, the imported row uses the raw manifest name, and skill grouping loses the per-plugin distinction. The correction must remove the extra managed copy rather than accept a different grouping of duplicate skills.

## Selected interface

| Alternative | Result |
| --- | --- |
| Install independently into every detected client | Reproduces the duplicate-source counterexample. |
| Omit Cursor from the result | Hides which source supplies a requested client. |
| Route through a qualified selected provider | Retains every requested client in the result, keeps one effective source, and exposes the provider. Selected. |

Keep Compiler, Installer, ReleaseCatalog and Distribution as the public modules. Preview owns this author-workflow coordination. Installer continues to own each physical target, reviewed change, receipt and recovery. The routing policy is a small pure module; it introduces no resource-graph framework or author configuration file.

`routePreview` takes a client, desired presence and provider evidence. The evidence is `none`, `qualified` or `unqualified`. `qualified` means the selected Claude destination is the exact physical source imported by the qualified Cursor profile and the requested feature semantics have native evidence. The I/O boundary must establish those facts. Matching package families alone does not establish them. A disabled native import preference means there is no effective provider, so Cursor retains a direct installation.

The result is one of:

- `direct`: the requested client and desired presence.
- `inherited`: Cursor uses the selected Claude source; its own managed local intent is absent.
- `blocked`: a linked import cannot preserve the requested semantics with the available qualification.

An inherited result is available only for a present request. Removal still plans absence for every selected physical target. Explicit single-client preview retains direct installation semantics; it does not remove a provider that the caller did not select. Native import from an unselected installation can remain visible after removing a local copy, and the CLI documentation must explain that distinction.

`mayApplyInherited` accepts a confirmed provider outcome. It authorizes local cleanup only after successful installation or a matching unchanged observation. `finishPreview` reports `inherited` only when the provider is confirmed and the local cleanup is removed or unchanged absence. An uncertain dependency remains uncertain; other unsuccessful combinations report not applied. Direct completion statuses retain their meaning.

The user-facing inherited result must name `claude_code` and its home. Its schema must make it impossible to attach inherited status to Codex, Claude or an unspecified provider. It changes no backend authorization, credentials or native account ownership.

## Execution

1. Discover qualified client versions and build the same two package families before creating configuration homes.
2. Resolve homes physically and establish the native import relationship, committed import preference and requested feature qualification. Reject an unsupported relationship before applying installation changes.
3. Review all selected physical intents, including absence for an inherited Cursor route.
4. Apply direct provider changes. Preserve the existing Cursor installation when its provider is unavailable, not applied or uncertain.
5. Confirm the provider's desired owned state and import evidence before local cleanup. Apply only the reviewed Cursor absence change.
6. Confirm the provider, local absence and import evidence before reporting inherited availability. Keep uncertain outcomes visible and retain existing recovery records.

The workflow does not promise atomic changes across independent clients or immunity to later native edits. It must not report inherited success from stale planning evidence after a provider failure. Interruption can temporarily leave both copies; a subsequent preview must converge through the existing reviewed lifecycle.

Start native inheritance qualification with the real skill-only lstack pilot. MCP, hook and agent inheritance require their own preserved semantics and client evidence before their provider binding can be marked qualified. An unsupported requested feature must fail rather than fall back to a duplicate or disappear silently. Managed distribution remains a separate caller gate; explicit physical destinations do not acquire a new source alias implicitly.

The [pinned preference source](../../.audit/probes/preview-routing/preference-main-facts.json) identifies `cursor/thirdPartyExtensibilityEnabled` in application storage. Preview reads only that key through a scoped read-only SQLite connection, including committed WAL changes. A missing database or row uses the native default, enabled; malformed or unreadable storage fails. Preview changes no import preference. The supported premise is the normal default desktop data directory. Portable and custom data directories require their own binding. Stored preferences do not establish every running GUI's cached state, and per-workspace plugin overrides remain native client choices.

The [runtime source check](../../.audit/probes/preview-routing/runtime-main-checked.json) covers 26 focused tests: pure policy and public result schemas, Installer dependency barriers, actual temporary SQLite reads and existing CLI refusal behavior. Scoped TypeScript, lint and Effect diagnostics pass. The coordinator and its pure model now live together under `src/project/preview/`. Fresh Windows CLI and UI qualification remains open; the old candidate and its two retained failed roots remain unchanged.

## Obligations

All ten obligations below have checked certificates for the executable Lean model. The scoped audit inspects their exact types and transitive axioms; only standard foundational axioms occur. The TypeScript port agrees with Lean for all 66 values in the finite input domains and 26 independent examples. Thirty malformed requests reject in both strict decoders. Runtime integration and native qualification remain pending; conformance is not a formal TypeScript refinement proof.

| Property | Required behavior |
| --- | --- |
| PV1 | Claude and Codex always retain direct routing. |
| PV2 | Cursor without a selected provider retains direct routing. |
| PV3 | Qualified present Cursor requests use the selected provider and require local absence. |
| PV4 | Unqualified linked present requests reject. |
| PV5 | Absent requests always use direct absence. |
| PV6 | Inherited routing occurs exactly for present Cursor with qualified provider evidence. |
| PV7 | Local cleanup is authorized exactly for successful provider evidence. |
| PV8 | Inherited completion occurs exactly for a successful provider and confirmed local absence. |
| PV9 | Failed inheritance preserves uncertainty and otherwise reports not applied. |
| PV10 | Direct completion preserves the original local status. |

Lean proves the pure policy relative to the supplied evidence. A handwritten TypeScript port and the native import behavior remain separate correspondence and trust boundaries. Existing TypeScript refinement limits, native host limits and deferred release gates remain visible.
