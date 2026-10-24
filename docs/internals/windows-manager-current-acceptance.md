# Current Windows manager workflow acceptance

The compiled public Catalog → Distribution → Installer commands passed the complete Windows x64 lstack lifecycle. Main accepted all 28 stages, the retained records and the rendered UI. The disposable native root was removed after guarded inventory verification; all snapshots remain available.

The pilot used the two frozen lstack releases, `0.2.1` and `0.2.1-pluginsdk.1`. Each release has a Claude package and a Codex package containing 158 files and 34 skills. Cursor selects the Claude package. These are plugin release versions used to exercise updates; application versions do not select compatibility.

## Lifecycle results

| Operation | Claude | Codex | Cursor |
| --- | --- | --- | --- |
| First release | Installed | Installed | Installed |
| Completed replay | Skipped | Skipped | Skipped |
| Fresh verification | Unchanged | Unchanged | Unchanged |
| Interrupted second release | Installed | Unavailable | Unavailable |
| Replay after interruption | Skipped | Settled as installed | Uncertain |
| Explicit Cursor repair | Preserved | Preserved | Both complete residual packages archived |
| Reconciliation | Unchanged | Unchanged | Installed |
| Removal and completed replay | Removed | Removed | Removed |
| Fresh absence verification | Unchanged | Unchanged | Unchanged |

The Codex worker stopped before publishing its completed state, after native execution finished. The Cursor worker stopped after retiring the first package, with the second package staged. Each interruption used the exact process handle retained before request admission, with matching birth identity and executable evidence. Replay changed only the expected state and dead-owner records. It did not repeat native mutation.

Repair archived both 158-file Cursor packages with their original physical directory identities and complete bytes. Repair replay preserved them. Reconciliation installed a fresh second-generation copy, and removal retained that copy in history too. Unrelated configuration and peer installations passed their preservation checks.

## Fresh client discovery

Claude's real CLI listed one enabled managed package for each release and none after removal. Main separately verified its 34 installed skill files. This is package discovery and file evidence, not native Claude skill enumeration or model execution.

Codex's real app-server returned 34 enabled skills for each release and zero after removal. Main compared the raw native names, descriptions, marketplace identities and package paths, including the changed second-generation description.

Three fresh Cursor sessions showed one Local plugin and 34 distinct skills for each release, then empty Plugins and Skills views. Main reviewed all six post-command screenshots and the full UI inventories. Imports remained enabled; the separate default Claude home stayed empty.

## Evidence and scope

The run completed 30 public CLI commands, 41 transaction-worker requests, six direct client sessions and three GUI sessions. All 77 retained process handles closed. Every job established quiescence before external inventory or snapshot retention. Main rehashed all 2,134 input bindings and 28 mutable snapshots, decoded the actual CLI and worker frames, and independently checked ten installed or cached package trees. All four catalog acquisitions matched the original bundle bytes.

The compiled candidate receipt is `cbc3b77bd9e575fe213ae217c02768198818e2afc8eed50646c4a7ff0a3fe93f`. It binds 201 product inputs and ten bundled chunks. Final EOF cleanup preserved all 597 emitted production files byte for byte; its correspondence receipt is `.audit/probes/prelaunch-consolidation/final-source/correspondence.json`.

The detailed native receipt is `.audit/probes/prelaunch-consolidation/manager-native/attempt-007/main-checked.json`, SHA-256 `efab53d23ecfb117e6d27b64f16d7747bdf5dc44cf3f1210259bef4d6293cea1`. Its subordinate receipts retain raw discovery, package checks, schema checks and image review. Earlier harness failures and their guarded cleanup records remain separate from this accepted run.

This closes L7 in the [launch plan](launch-plan.md). It qualifies this skills-and-assets pilot's manager lifecycle. MCP authentication, model execution, deployed organization RBAC and other client surfaces retain their separate scope. Full CI, package-consumer and release gates remain deferred. Lean models and runtime evidence do not establish formal TypeScript refinement.
