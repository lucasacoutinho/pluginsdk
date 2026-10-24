# Private Cursor SDK recovery

The unchanged private Cursor target passes seven recovery cases through the actual `Installer.plan/apply` service and transaction worker. Two native gates cover interrupted staging, replacement, removal and cleanup, changed reviews and claims, and active or unverifiable prior owners. A fresh review can finish an interrupted cleanup; retrying the same cleanup performs inspection only.

Production still has no qualified Cursor profile. [Fresh IDE discovery](cursor-sdk-ui-acceptance.md) now passes for SDK-managed packages; production admission and caller coverage remain open. This evidence covers process interruption at observed native rename boundaries. It does not establish power-loss durability, Cursor tool calls, hooks, agents or release readiness.

## Candidate and checks

The candidate is byte-identical to the [normal SDK candidate](cursor-sdk-target-acceptance.md): Windows x64, user scope, Cursor IDE 3.26.16 at commit `8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40`, profile `cursor-local-directory:1`, and package format `claude_code_portable_v1`. The author definition, skill and MCP program are unchanged.

The existing LC1–LC12 and R1–R8 proofs and TypeScript conformance checks precede this I/O gate. Scoped typechecking, lint and strict Effect diagnostics cover 199 candidate and entry files without errors, warnings or messages. The complete candidate remains bound to the normal gate's 206 files. Formal refinement of the handwritten TypeScript remains open.

A worker-only Node preloader observes successful native renames and suspends selected transaction workers before their next step. It preserves native arguments, return values and Win32 last-error state. The parent retains each worker's process handle, PID and creation time; interruption targets only that identity. Product source and the worker request protocol are unchanged.

## Native cases

| Case | SDK requests | Actual repair comparisons with Lean | Result |
| --- | ---: | ---: | --- |
| Partial stage | 8 | 4 | Ordinary retry remains uncertain; reviewed cleanup archives the partial package; replay makes no move; fresh installation succeeds |
| Interrupted cleanup | 13 | 8 | Replacement leaves staged and retired roots; cleanup stops after one archive; the same cleanup retry makes no move; a fresh successor archives the remainder |
| Changed owned role | 7 | 6 | Moving an approved stage to live invalidates the old review; a new review cleans the still-owned root |
| Changed claims | 9 | 7 | Changed bytes and missing claims refuse ownership; an ordinary file refuses inspection; a stale apply makes no move |
| Active prior owner | 5 | 3 | A second request opens the lock file but cannot inspect or reply while the original worker holds the lock; recovery succeeds after both workers terminate |
| Unknown prior owner | 5 | 3 | The real process lookup returns unknown under denied query rights; the SDK refuses before capture; recovery succeeds after the retained process object is released |
| Interrupted ordinary removal | 12 | 4 | Removal stops after retirement; original retry makes no move; fresh repair archives the retained root; repair replay, fresh installation and normal removal succeed |
| Total | 59 | 35 | All seven cases pass across two native gates |

All 35 comparison inputs come from retained SDK records and fresh native observations. Main independently checks the SDK replies, process identities, native rename bytes and path bindings, journals, payloads, physical roots and no-move controls. Four completed repair replays and one retry of a pending cleanup preserve package state without another rename. The original interrupted installation and removal retries also make no move.

Nine workers undergo controlled interruption. All 59 recorded worker identities terminate, all 59 parent-retained process handles close, and both owning Windows jobs have no survivors. Worker FileApi handles, separate process-observation handles and Node internals are outside that handle counter. The four pinned command-client files are unchanged before and after each execution.

## Interrupted removal

The separate removal gate uses the same 206 candidate files and native entry. It reuses the accepted source checks after verifying byte equality, then rebuilds the three native outputs and checks the observer offline before execution. Five plans and seven applies run through the actual service and worker.

Generation A's live root moves to retired before interruption. Package inspection starts after the retained worker has terminated. The original removal retry preserves the pending record, bytes and physical roots without another rename. Fresh repair archives that exact root, returns absence and binds an empty journal to the repair ID. Replay preserves that journal and the package inventory. Generation B then installs and undergoes an ordinary reviewed removal; both generations remain byte-exact under their original root identities in history.

Main's independent reader binds the saved SDK inputs and replies, verifies the raw native rename arguments, compares all four actual repair frames with Lean, and checks both archived packages against the fourteen authored fixture files and the native postflight inventory. The accepted attempt is `.audit/probes/cursor-sdk-removal/attempt-001`. All 267 default-stream runtime files are retained and compared with the quiescent source before accepted-root cleanup.

## Retention and limits

The first attempt completed an SDK operation without reaching its intended checkpoint because the observer compared DOS paths with the installer's Volume GUID paths. This was a harness failure. Its closed runtime and original inputs are retained; its Windows root remains protected. The corrected observer binds the configured home to the GUID name obtained from that same opened home and retains both names for independent checking.

The accepted six-case attempt is `.audit/probes/cursor-sdk-recovery/attempt-002`. All 526 default-stream runtime files are retained and compared with the quiescent source before removing only its accepted marked root. The separate removal gate retains another 267 files before its accepted-root cleanup. Fourteen older protected roots, including the failed first attempt, remain untouched. Each cleanup receipt binds its exact accepted receipt.

The evidence remains private under `.audit/probes/cursor-sdk-recovery` and `.audit/probes/cursor-sdk-removal`. CI, package-consumer checks, release-wide checks, publication, third-party authentication, native Grok testing and macOS qualification retain their existing deferrals.
