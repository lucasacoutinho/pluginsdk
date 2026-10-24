# Linux Codex project portable admission

Codex 0.163.0 project installations on Linux now accept both portable formats through the ordinary SDK and CLI. One author definition builds the Claude and Codex packages. Bundled stdio selects portable v1; hooks or agents select portable v2. Consumers use the existing [project installation commands](../usage.md#install-for-a-project).

The change adds two formats to the existing Linux project profile. Its adapter revision and public interfaces stay unchanged. Windows has a separate profile and still requires its own portable project qualification. Unknown versions, platforms and unsupported client/format combinations continue to refuse.

## Evidence before admission

The private SDK passed [normal Linux lifecycles](codex-project-portable-linux-normal.md), [sixteen interruption and repair cases](codex-project-portable-linux-recovery.md), and [fourteen role refusal and coexistence cases](codex-project-portable-linux-refusals.md). Those checks cover complete payloads, real MCP calls, hook blocking, agent permissions, project isolation, locks, saved plans and explicit repair.

Main compared the production source and generated runtime with that qualified SDK. Exactly three files differed: the profile source and its generated JavaScript/map. Promoting those tested bytes makes all 721 runtime files match native acceptance. No I/O implementation or public schema changed.

## Production checks

The qualified and production registries each agree with Lean on 342 profile selections, including reversed enumeration and neighboring platform/version/client refusals. Their complete request and response bytes match. The updated public profile expectation fails before admission and passes afterward.

Eleven focused tests pass across profile selection, build format selection, project plans and preview. Scoped typechecking, strict Effect diagnostics for both changed TypeScript files and lint pass.

Four ordinary CLI builds discover `definition.json` automatically and produce both client packages without format or target flags. The two fixture generations exercise stdio-only and hook/agent definitions. All eight bundles match the previously qualified bytes exactly, covering 100 payload-file observations. This check does not run native clients or package-consumer/release gates.

The [checkpoint](../../.audit/probes/portable-project-codex-linux-admission/acceptance.json) binds the profile promotion, oracle comparisons, scoped checks, ordinary build outputs and predecessor native evidence. The shared Git index remains unchanged. macOS, Grok native testing, third-party authentication, CI, package-consumer checks and publication remain deferred. Windows project portable qualification and source symbolic-link coverage remain on the roadmap.
