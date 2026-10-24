# Codex project portable recovery on Linux

Both portable formats pass sixteen interruption, surviving-worker and explicit-repair cases on isolated Linux Codex 0.163.0 hosts. Every case uses the same private SDK bytes as the [normal lifecycle qualification](codex-project-portable-linux-normal.md). The [role refusal and coexistence gate](codex-project-portable-linux-refusals.md) completes the remaining Linux reader coverage. The [qualified Linux profile is enabled](codex-project-portable-linux-admission.md); Windows portable project qualification remains separate.

The public interface stays `Installer.plan/apply`. After an interrupted apply, a fresh process submits the identical reviewed plan. Installer observes the native state and settles the pending operation without executing it again.

## Interruption behavior

The twelve interruption cases cover install, replace and remove for both formats. Each starts with an existing project config containing unrelated settings. The native worker pauses immediately before its atomic config rename or after that rename and the config directory sync. The harness then terminates the caller and worker through separately owned pidfds.

| Operation | Before activation | After activation |
| --- | --- | --- |
| Install | `not_applied`; plugin absent | `installed`; first generation usable |
| Replace | `not_applied`; previous generation usable | `installed`; new generation usable |
| Remove | `not_applied`; previous generation usable | `removed`; plugin absent |

Recovery preserves the full original plan and its pending execution record until settlement. Replay returns the same outcome while preserving the settled journal, config bytes and worker count. A fresh Codex session checks the expected skill and real MCP call. Portable v2 additionally exercises the selected agent model and shell policy, startup context and prompt blocking. Five blocked turns produce no provider inference. Another project sharing the ordinary Codex home remains usable and omits the plugin.

## Surviving workers and repair

Two cases terminate only the caller before activation. The worker retains both home and project writer leases. A contender using another home blocks on the project lease; a contender using another project blocks on the home lease. Both remain blocked until the worker resumes. After release, the foreign-home request reports unowned state and the other project's request remains a separate reviewed install. Fresh recovery settles the original operation without another worker.

Two inactive-install cases request explicit repair before normal recovery. Each repair has a new commitment that references the interrupted plan and verified absence. Applying and replaying repair start no native worker and preserve the project config. The original plan then rejects with `stale_plan`. Prepared inactive revisions and cache files remain retained after settlement.

## Evidence

| Check | Result |
| --- | --- |
| Native cases | 12 interruption, 2 surviving-worker, 2 repair |
| Public SDK requests | 88 |
| Fresh native sessions | 64 |
| Second-project absence sessions | 32 |
| Recovery or replay installation workers | 0 |
| Real MCP calls | 10 |
| Native agent threads | 5 |
| Complete payload-copy files independently rehashed | 550 |
| Owned pidfds closed | 32 |
| Direct commands exited and closed | 216 |
| Retained runtime files copied and independently rehashed | 1,928 |

Sixteen caller terminations and fourteen worker terminations are intentional test inputs. Other direct commands exit normally. PID 1 records adopted descendants and their actual exit statuses, reaps the namespace, and closes all process controls. Every accepted case finishes without a timeout, unexpected forced termination or surviving process. Accepted runtime trees are copied and verified before their owned scratch directories are removed.

The main thread independently decodes every public request/reply and reviewed-plan commitment. It checks native protocol replies, provider records, exact hook approvals, pending and settled journals, config beforeimages, payload bytes, inherited lease descriptors and process closure. The [matrix record](../../.audit/probes/portable-project-codex-linux-recovery/matrix-acceptance.json) links every case and cleanup receipt; the [checkpoint](../../.audit/probes/portable-project-codex-linux-recovery/acceptance.json) binds the complete predecessor and successor evidence.

This phase changes no production source, public schemas or profiles. The 332 registered proof obligations and 342 private profile-oracle comparisons carry forward unchanged. The separate role gate now qualifies conflicts, incomplete inventory, changed role files and saved plans after foreign edits. Windows portable project qualification remains separate. macOS has no available host; CI, package-consumer checks, release, publication and third-party authentication remain deferred.
