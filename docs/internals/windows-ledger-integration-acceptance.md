# Windows retained ledger acceptance

The private execution entry now stores exact Windows writer identities in the existing pending transaction record. Nine native completion checks and six execution/recovery case groups pass on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. This accepts the retained-ledger integration for the cases below. Windows installation profiles remain disabled.

## Contract and implementation

The [selected design](windows-writer-recovery-design.md#transaction-integration) extends the private execution witness with `windows_writers`. Both ordinary and repair records retain the complete reviewed plan alongside the ordered writer list. `executeOnce` adapts the creation-gated service's callback to the caller's existing `saveState` operation. No separate ledger file or public interface is added.

`executionQuiescent` accepts only complete evidence for the entire ledger on Windows. Active or unknown evidence keeps the operation pending. Other platforms cannot validate that Windows witness. Legacy job-only records remain readable and pending because they lack the required identities.

This integration reuses the existing Z1-Z22 writer contracts and adds no proof obligations. Pure record-boundary conformance passed before execution I/O changed: four focused files passed fifteen tests, including seventeen completion requests compared with the Lean executable after crossing the JSON record boundary. Three focused integration files then passed nine tests. Scoped TypeScript checking, lint and Effect diagnostics passed, with no errors, warnings or messages across ten checked files. All nine isolated Linux Codex project recovery tests passed after integration.

## Native checks

The nine completion checks exercise the actual `executionQuiescent` entry: prepared, legacy job, foreign process group, empty ledger, active writer, unavailable writer, controlled changed creation time, duplicate terminated identity and mixed active/terminated evidence. Independent waits bracket each request. All nine measured handle counts are unchanged. Changed creation time is a controlled comparison, not actual PID recycling.

The six execution case groups use production locks, full retained records and the actual `executeOnce` entry. A separate recovery process acquires the production lock, loads the record and checks quiescence. It leaves the pending bytes unchanged and never invokes the recipe.

| Case group | Observed result |
| --- | --- |
| Original native worker | A no-op repair runs the unchanged product entry. Both Node and its Windows console helper are retained before continuation and exit with code zero. A fresh process loads the same complete repair record, including the original and repair plan identities. |
| Death before first retention | The root remains at its creation event. Killing the controller terminates it without script startup. Recovery reads the unchanged prepared record. |
| Death after first retention | The full pending record contains the paused root identity. A fresh read-only observer reports active. After controller death and exact handle completion, recovery reports quiescent and preserves the record bytes. |
| Death after continuation | The controlled root and detached child both start only after retention. Their ordered ledger also includes the console helper. After controller death, all three exact handles signal before recovery reads the same ledger. Neither script is replayed. |
| Detached-child retention failure | The third callback belongs to the detached Node child, after the root and console helper. Refusing that callback returns `StateUnavailable`, preserves the prior full-prefix bytes and prevents child startup. Production cleanup finishes the root, helper and denied child before returning. |
| Death during metadata write | The production `durableWrite` starts a synthetic 64 MiB metadata payload. A partial temporary file is observed while the controller is active. After termination and exact process waits, a fresh lock owner writes generation two to the same destination. Five reads and a delayed read preserve the new value. The old partial temporary file stays orphaned. |

The metadata sample contained 16,252,928 of 67,108,923 intended bytes. After controller completion, the orphan contained 17,825,792 bytes. This checks an actual interrupted production write with synthetic data; it does not qualify every metadata write boundary.

All 24 independent process handles signal before closure, all thirteen managed child processes are collected, and cleanup reports no errors. The outer process exits zero and its containment job closes. The staged native worker is restored to its original hash before the owned stage is removed.

## Evidence and limits

The reviewed harness, source hashes, raw observations and acceptance receipt are under `.audit/probes/windows-ledger-runtime/`. `first-run/` preserves an earlier three-of-six result. That harness waited for scripted startup while a console-helper creation callback still needed acknowledgement. The revised harness retains every native birth and identifies the scripted child separately. Product sources are identical across the two runs.

The first case uses the original native worker. The remaining cases replace only the staged recipe with a controlled fixture whose scripts stay alive until containment terminates them. The harness restores the original file and verifies its hash. The observer exercises record loading and quiescence under the lock; it does not run full engine inspection or settlement.

Initial owner-publication kills, other metadata crash boundaries, separate descendant debugging chains, read-only command containment, filesystem capture/publication and real Windows client lifecycle checks remain open. Process termination does not simulate power loss. No macOS host is available. CI, package-consumer and release-wide checks remain deferred.
