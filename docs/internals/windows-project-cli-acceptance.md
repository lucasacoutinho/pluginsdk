# Windows Codex project CLI acceptance

Codex 0.163.0 project installations using `agent_plugins_v2` are qualified on Windows x64 with Node 24.18.0. The production [profile table](../../src/installer/target/profiles.ts) now contains that exact row. Its bytes match the candidate used for native qualification. The public interfaces and pure models are unchanged.

The [design](windows-project-cli-design.md) uses the existing build and reviewed installation commands. This follows the accepted [project lifecycle](windows-activation-acceptance.md#codex-project-scope) and all seven [interruption cases](windows-project-recovery-acceptance.md). The CLI qualification adds no execution pauses or engine replacements.

## Accepted checks

| Check | Result |
| --- | --- |
| Profile policy before I/O | 1,590 candidate comparisons agree with the Compatibility Lean oracle. N1–N8 keep other platforms, versions, scopes and formats isolated. |
| Scoped compilation | 141 JavaScript and JSON files compile, including the dynamically selected transaction worker. The pinned package metadata supplies CLI package resolution. |
| Build preflight | Both generations build through the compiled CLI with automatic `definition.json` discovery. Each complete nine-file bundle matches its reference and captured build. |
| Native CLI | 17 commands and 171 recorded steps pass: build both generations, review and apply installation, replay, verify unchanged plans, replace and remove. |
| Native workers | All 17 callers finish through retained native handles. Each of the twelve worker births has exact completion evidence and one completed trace. |
| Mutation count | Install, replacement and removal each enter `Installer.executeOnce` once. Completed replay and unchanged planning enter it zero times. |
| Fresh discovery | Six Codex app-server sessions close through EOF with code 0. Project A discovers the active generation; sibling project B discovers neither generation. Removal leaves neither visible. |
| Payload and configuration | Eighteen file comparisons preserve the approved bytes. Replay preserves journal and project configuration bytes. Windows attributes and security metadata remain unchanged. Removal restores the original project text. User and sibling configuration remain unchanged. |
| Cache cleanup | Replacement removes the previous owned cache. Removal removes the final owned cache. |
| Inventory and retention | All 5,241 immutable stage files and all 5,786 original-root files match their pins. The 392 case files are retained with byte counts and hashes. |
| Owned stage cleanup | A fresh inventory and accepted validation receipt precede removal of all 5,633 stage files. The original runtime root is retained unchanged. |
| Promotion | The live table passes the same 1,590 Lean comparisons after copying the qualified profile bytes. Both existing profile tests, the scoped CLI and worker typecheck, and the diff check pass. |

The native run uses the emitted `.js` worker path through the compiled CLI. Its private overlay adds only the exact profile row and standard Effect worker tracing. The production promotion copies the qualified profile bytes unchanged and leaves the ordinary worker entry intact.

Main-thread validation independently decodes command results, plans, process witnesses, waits, worker events, traces, stored states and file bases. It verifies plan commitments, replay equality, payload hashes, configuration metadata and the retained manifest before cleanup.

The local evidence is `.audit/probes/windows-project-cli/`: `compiled-cli-validation.json`, `retained/manifest.json`, `cleanup.json`, the promotion records and the final `acceptance.json`. The predecessor is `.audit/probes/windows-project-recovery/acceptance.json` at SHA-256 `ec05838737cffefb2e5153ae97ed802e50dd5fb06d375227adb435cb786c16d8`.

## Scope

The enabled row has host `codex`, platform `win32`, version `0.163.0`, scope `project`, revision `codex-project-cache:1` and format `agent_plugins_v2`. Skills, supporting files and remote HTTP MCP declarations are covered. Windows user installations, other client versions, other formats, bundled stdio, hooks and agents require separate qualification. `preview` targets user installations and remains unavailable on Windows.

This is feature acceptance through a privately compiled runtime. Package-consumer, CI and release-wide checks remain deferred. The complete Windows release is not qualified. macOS remains deferred because no host is available. Third-party authentication and Grok Bot native testing remain deferred.
