# Codex project portable packages on Linux

Both portable formats pass complete normal SDK lifecycles on isolated Linux Codex 0.163.0 hosts. They also pass [Linux interruption and repair](codex-project-portable-linux-recovery.md) and [role refusal and coexistence](codex-project-portable-linux-refusals.md). The [qualified Linux profile is enabled](codex-project-portable-linux-admission.md). Windows portable project qualification remains separate.

The public caller uses the existing project destination and `Installer.plan/apply`. Each run installs generation one, verifies a fresh native session, replays without another worker, plans the same contents as unchanged, replaces with generation two, and removes the plugin. A second project shares the same ordinary Codex home. Its sessions remain usable and omit the plugin before installation, after both generations, after a preview for that second project, and after removal.

| Evidence | Portable v1 | Portable v2 |
| --- | --- | --- |
| Accepted final SDK bytes | [Attempt 007](../../.audit/probes/portable-project-codex-linux/attempt-007/main-acceptance.json) | [Attempt 006](../../.audit/probes/portable-project-codex-linux/attempt-006/main-acceptance.json) |
| Public SDK requests | 13 | 13 |
| Replays without a new worker or changed journal/config | 3 | 3 |
| Fresh native sessions | 9 | 9 |
| Second-project absence sessions | 5 | 5 |
| Real MCP calls | 2 | 2 |
| Complete files per generation | 9 | 16 |
| Payload-copy files independently rehashed | 36 | 64 |
| Direct commands exited and closed | 26 | 26 |

MCP evidence records native discovery, real echo calls, literal arguments and environment values, and the actual cache working directory. V2 additionally records startup context reaching inference, blocked prompts producing no inference, and two real native subagent threads. The first agent uses its selected model and rejects an attempted shell call. The update uses its new model and advertises the host's default shell tool. Removal is checked in fresh sessions.

Native hook approval writes reviewed hashes to Codex's user configuration. The runner separately records those explicit client actions. Every SDK operation preserves the resulting user config, and independent checks reject changes outside the reviewed hook hashes. Project B bytes remain unchanged. Project A returns to its original bytes after removal. No user companion directory or project agent copy is created.

## Native wire correction

The initial agent installation safely returned `uncertain`: Codex's `config/read` serializes absent optional declaration fields as `description: null` and `nickname_candidates: null` in its merged config. Per-layer TOML retains only the explicitly declared `config_file`. The original reader incorrectly required both representations to have one key.

A focused regression fails before the correction and passes afterward. An Effect schema now decodes the merged native declaration. Schema-derived equivalence verifies the exact path and null defaults; metadata overrides, extra fields and incomplete declarations remain refused. All 55 focused tests, scoped typechecking, Effect diagnostics and lint pass. The pure activation models and 332 registered proof obligations remain unchanged.

Two early fixture failures and both native observation failures are preserved. An earlier stdio run also passed on the preceding reader. Qualification metrics above use the two runs with identical corrected SDK bytes. The main thread checks raw SDK wires and plan commitments, protocol replies, provider requests, payload bytes, config beforeimages and process closure. Native descendant exit statuses are retained, including nonzero exits; no fixture termination is presented as clean completion.

Accepted fixture trees are copied and rehashed before their owned runtime directories are removed. Failed roots remain intact. The [checkpoint](../../.audit/probes/portable-project-codex-linux/acceptance.json) retains the source and evidence bindings. It adds no CI, package-consumer, release, publication, macOS or third-party authentication acceptance.
