# Windows Codex user and preview acceptance

Codex CLI 0.163.0 user installations using `agent_plugins_v2` are qualified on Windows x64 with Node 24.18.0. The production [profile table](../../src/installer/target/profiles.ts) contains the exact candidate bytes used for native qualification. The existing Windows project profile is retained.

From a plugin directory, the existing command now supports Windows:

```sh
pluginsdk preview --target codex
```

Repeat the command after editing the plugin to replace its development copy. Use `pluginsdk preview --target codex --remove` to remove it. Preview keeps the same derived development identity across those edits.

The [design](windows-codex-user-design.md) reuses the existing compatibility policy, user recipe and reviewed lifecycle. The only product source change in this qualification is the profile row. Public schemas and pure models are unchanged.

## Accepted checks

| Check | Result |
| --- | --- |
| Profile policy | Both candidate and live tables pass 1,590 comparisons with the Compatibility Lean oracle. Only the two intended user queries become admitted; the existing Windows project queries retain their results. |
| Interruption recovery | Seven cases cover before/after install, replacement and removal, plus worker completion after caller termination. All 358 recorded steps, 36 callers, 36 workers and 36 fresh Codex sessions pass independent validation. Resuming the interrupted plan and replaying its completed result never re-enter execution. |
| Compiled lifecycle | 17 commands cover automatic definition discovery, build, plan, show, apply, replacement, removal, unchanged planning and completed replay. All twelve worker births have exact completion evidence. |
| Compiled preview | Five calls return `installed`, `unchanged`, `installed`, `removed`, `unchanged`. The development identity stays fixed when the source changes. All eight worker births complete. |
| Execution count | Install, replacement and removal each execute once in each compiled scenario: six executions across 22 commands. Completed replay and unchanged results execute zero times. |
| Discovery and bytes | Twelve fresh compiled-scenario Codex sessions verify both projects see the active user plugin and neither sees it after removal. Those scenarios compare 36 payload files; the recovery matrix adds 126 file comparisons. |
| Configuration and journals | Unrelated user TOML settings retain their parsed values across native rewrites. Both project configurations retain their exact bytes. Replay and unchanged preview calls preserve their configuration and journal bytes. A user installation uses one home lock. |
| Evidence retention | The recovery cases retain 1,535 files. Normal compiled commands retain 390 files; preview retains 242. Each retained manifest records byte counts and hashes. |
| Inventory and cleanup | All 5,101 recovery-stage and 5,243 compiled-stage immutable files match their pins. The original 5,786-file runtime root remains unchanged. Accepted receipts and fresh inventories precede removal of the two owned stages: 6,636 and 5,875 files. |
| Live promotion | The qualified profile bytes match the live source. Both existing profile tests, the scoped CLI/worker typecheck, source build and diff check pass. The public build contains the ordinary worker without private checkpoints. |

Exact caller, worker and retained native-writer completion precedes closed-case evidence reads, inventory and cleanup. Job accounting supplements those process witnesses. No new stage has unknown completion.

The recovery validator initially rejected an observed extended DOS path spelling, `\\?\C:\…`, for the same ordinary DOS marketplace path. A recorded validator successor admits only that exact alternate spelling in its marketplace-path comparison. The original validator and its first accepted receipt are preserved. This correction changed no staged or product runtime source and required no native case to be repeated.

The compiled snapshot adds only the candidate profile and standard Effect worker tracing. It has no engine pause hooks. The ordinary public CLI and worker are rebuilt from the promoted source.

## Evidence and limits

The recovery evidence is in `.audit/probes/windows-codex-user/`: seven validation receipts, retained case evidence, the validator-successor record and cleanup receipt. Compiled evidence is in `.audit/probes/windows-codex-user-cli/`: normal and preview validation receipts, retained manifests, cleanup, live profile comparisons, promotion checks and the final `acceptance.json`. Its predecessor is `.audit/probes/windows-project-cli/acceptance.json` at SHA-256 `b5cba155541181d7a6c29fa32a7d16fc60a8a261d8bef86db62b136078be2030`.

The new row has host `codex`, platform `win32`, version `0.163.0`, scope `user`, revision `codex-local-marketplace:1` and format `agent_plugins_v2`. It covers skills, supporting files and remote HTTP MCP declarations. Captured MCP declaration bytes do not establish third-party authentication or tool execution. Native user-configuration rewrites do not inherit the project-file adapter's text or security-metadata guarantees.

Other Windows client versions and formats, Claude Code, bundled stdio, hooks, agents and explicit repair need their own qualification. CI, package-consumer and release-wide checks remain deferred. The complete Windows release is not qualified. macOS remains deferred because no host is available; third-party authentication and Grok Bot native testing retain their deferrals. Earlier stages with unknown completion remain retained and untouched under the predecessor records.
