# Windows Codex project portable admission

Codex 0.163.0 projects on Windows x64 now accept both portable formats through the ordinary SDK and CLI. The existing definition builds the Claude and Codex packages. Bundled stdio selects portable v1; hooks or agents select portable v2. Consumers use the existing [project installation commands](../usage.md#install-for-a-project).

The change adds two formats to one Windows project profile. Its adapter revision and public interfaces stay unchanged. Unknown versions, unsupported platforms and client/format mismatches still refuse.

## Native evidence

The private candidate passed [both normal lifecycles](codex-project-portable-windows-normal.md), [sixteen interruption and repair cases](codex-project-portable-windows-recovery.md), and [sixteen accepted role cases](codex-project-portable-windows-refusals.md). These gates cover complete payloads, real MCP calls, hook blocking, agent permissions, project isolation, lock ownership, saved plans and explicit repair.

The role gate retains two failed native fixtures and a local verifier counterexample. Its accepted successors use the same SDK bytes. The first coexistence attempt's client-probe failure has no definite diagnosed cause; the first stream fixture had an incorrect expected error. Their retained evidence remains part of the qualification record.

Exactly three source/generated files differed between production and the qualified candidate: the profile source, JavaScript and source map. Promoting those tested bytes makes all 721 source/runtime files match native qualification. No installer I/O implementation or public schema changed.

## Production checks

The qualified and production registries each agree with Lean on 342 profile selections, including reversed enumeration and neighboring version, platform and client refusals. Their complete request and response bytes match. The updated public expectation fails before admission and passes afterward. The 332 existing formal obligations carry forward.

Eleven focused tests pass across profile selection, format selection, project plans and preview. Scoped typechecking, strict Effect diagnostics for both changed TypeScript files and lint pass.

Four ordinary CLI builds discover `definition.json` and produce both client packages without format or target flags. Two generations of the stdio-only and hook/agent fixtures reproduce all eight qualified bundles exactly, covering 100 payload-file observations. This admission check does not rerun native clients, CI, package-consumer or release gates.

The [checkpoint](../../.audit/probes/portable-project-codex-windows-admission/acceptance.json) binds promotion, oracle comparisons, scoped checks, build outputs and the predecessor native evidence. The shared Git index remains unchanged. Source symbolic-link qualification remains separate. macOS has no available host. Grok native testing, third-party authentication, CI, package-consumer checks, release checks and publication remain deferred.
