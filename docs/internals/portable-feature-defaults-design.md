# Portable feature defaults

## Consumer behavior

An author keeps one definition, hook programs, MCP implementation and agent prompt. `pluginsdk build` discovers the definition and emits the Claude and Codex packages. `pluginsdk preview` uses the same recommendation for the author's user installation. No wrapper, platform branch or portable-mode option is added.

The selected policy maps an existing input to its client-specific format:

| Feature facts | Claude | Codex |
| --- | --- | --- |
| Any agents or hooks | `claude_code_portable_v2` | `codex_plugin_portable_v2` |
| Neither, with bundled stdio MCP | `claude_code_portable_v1` | `codex_plugin_portable_v1` |
| None of these features | `claude_code_v2` | `agent_plugins_v2` |

The public input remains the client and three Boolean feature facts. No platform, version or scope is introduced into this pure selection contract. Preview and Installer retain their separate exact-profile admission.

## Decision and ownership

An explicit portable-mode flag would make authors coordinate build and preview configuration and duplicate an existing compatibility choice. Separate Windows definitions would split shared plugin ownership. Both are rejected.

Automatic selection remains in the existing `BuildFormat` module. It changes the two already exhaustive agent/hook branches; stdio-only and basic outputs stay stable. Existing compiler formats remain readable and available explicitly. The compiler's complete-bundle commitments and Installer ownership model retain their existing responsibilities.

Both legacy and portable hook producers reject environment captures. Portable v2 therefore does not remove an accepted hook environment-reference feature. Existing literal process fields, synchronous events, per-client model selection and shell-tool policy retain their represented meanings.

The profile change will add v2 only to the four qualified user rows: Claude Code 2.1.304 and Codex 0.163.0 on Linux and Windows x64. Project rows and other versions remain subject to their existing qualification boundaries.

The runtime TypeScript implementation already matches the accepted private candidate. The generated production artifact is older. Regeneration must reproduce the exact 323,628-byte native-qualified runtime, SHA-256 `1af914d102843fb1c8dcda0825aad46328073394f27c4d6afeb1cb08e9085cf2`.

## LDD order

1. Update the expectations of BF1 and BF2 to portable v2. Keep BF3 stdio-only and BF4 basic unchanged. Prove all four obligations over the existing input type.
2. Recompile the strict existing wire against that private model and compare every one of the sixteen inputs with independently authored expectations. Retain the existing 33 malformed request refusals.
3. Implement the pure TypeScript selector with schema-derived types and exhaustive Effect Match. Establish the same finite oracle conformance before changing project or installation I/O.
4. After the complete Windows recovery matrix is accepted and sealed, integrate the reviewed pure artifacts. Update only the four evidenced profile rows and regenerate the exact qualified runtime.
5. Run scoped proof, oracle, format-projection, profile-admission and compiler checks. Ordinary CLI builds of the two accepted fixture definitions must reproduce all four native-qualified bundles and their complete bytes. Compare emitted executable modules with the sealed native SDK. The selector and profile modules change; the existing four-site Windows owner observation overlay is checked separately against unchanged production bytes.
6. Update user-facing compatibility and authoring instructions to describe the resulting supported workflow. Retain exact versions, scope limits, native hook review, and the lack of macOS qualification.

The pure candidate may be prepared while native recovery runs. It may write only within this phase; the 183 sources pinned by the recovery controller, enabled profiles, runtime asset and public docs remain untouched until that recovery seal exists. Production promotion needs main-thread inspection and acceptance of both phases.

## Acceptance and limits

Main must inspect the Lean changes, oracle provenance, TypeScript function and all integrated diffs. All sixteen inputs must conform; malformed inputs must fail in both authoritative decoders. Profile tests must admit only the four supported user tuples and refuse project, macOS, unknown-version and cross-client tuples.

No new native lifecycle is claimed by pure conformance or a successful build. Native premises come from the retained private Linux and Windows normal lifecycles and the separately accepted Windows interruption/repair matrix. No client, schema, native event, authentication flow or deployment adapter is added here.

CI, package-consumer and release-wide checks, publication, Grok native tests and third-party authentication remain deferred. No macOS host is available.
