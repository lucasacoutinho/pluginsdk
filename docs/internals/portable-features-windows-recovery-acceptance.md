# Windows portable feature recovery

The private Windows x64 user candidates pass all seventeen interruption and explicit-repair cases on Claude Code 2.1.304 and Codex 0.163.0. This follows the [normal feature lifecycles](portable-features-native-windows-acceptance.md). Production profiles, automatic selection and the distributed runtime remain unchanged at this checkpoint.

## Reviewed operations

Each case starts in a fresh marked directory with private client homes, pinned binaries and the exact previously qualified packages. Every SDK operation runs a fresh caller through the public Installer layer and its detached transaction worker. The fixture observes execution through a compiled-only checkpoint overlay; product sources, native mutation order and retained-owner helpers keep their accepted bytes.

Both clients pass these seven cases:

| Interruption | Worker action | Fresh recovery and replay |
| --- | --- | --- |
| Before installation executes | Terminate | Not applied; native session confirms absence |
| After installation executes | Terminate | Installed generation one |
| Before replacement executes | Terminate | Not applied; generation one remains usable |
| After replacement executes | Terminate | Installed generation two |
| Before removal executes | Terminate | Not applied; generation one remains usable |
| After removal executes | Terminate | Removed; native session confirms absence |
| After installation executes and its caller is terminated | Release worker | Worker completes; fresh caller recognizes the installed receipt |

The remaining three cases interrupt a removal after native plugin unregister. Claude retains its marketplace. Codex retains either its marketplace and companion document, or only its companion after marketplace removal. Fresh applications of the original pending plan return `uncertain` without repeating execution. A separately reviewed repair plan binds the exact residual and surviving owned content. Repair executes once, replay makes no new mutation, and the original plan is rejected as stale afterward. The completed empty journal retains the repair plan ID.

All saved requests, replies, pending records and observer events decode through the authoritative Effect schemas. Main recomputes plan and bundle identities, checks receipt bindings, and compares the recorded configuration bytes before and after recovery and replay. Execution events independently show no additional entry for an interrupted operation. Before-execution cuts retain the prepared pending record; terminated workers leave that record unchanged. Released workers complete their installed journal despite caller termination.

## Native observations

| Evidence | Accepted result |
| --- | ---: |
| Separate interruption cases | 17 |
| Public SDK requests | 102: 31 plans and 71 applications |
| Typed replies | 85; the 17 controlled callers are intentionally terminated |
| Native registration mutations | 44 |
| Mutation-free recovery/replay checks | 20 |
| Native feature or absence sessions | 37 |
| Complete package-file observations | 288 |
| Complete Windows companion snapshots | 14 |
| Owner journals | 811 |
| Retained process identities | 3,386 |
| Additional controlled caller/worker handles | 34, all terminal and closed |

Installed outcomes execute actual MCP calls, startup hooks, prompt blocking and native agent dispatch through the pinned clients. Generation one excludes the child shell tool and rejects a forced invocation. Generation two advertises the host-default shell without executing it. Child requests retain the authored prompt and selected model. Codex's hook-definition update requires its native hash review; the SDK does not grant that approval.

The native programs preserve empty arguments, spaces, shell syntax, Unicode, literal environment values and packaged working directories. Main compares 272 retained postflight payload observations with the frozen bundles. Codex's generation-one loaded cache is removed during replacement; its sixteen captured file hashes are checked separately against the original bundle. They are not described as retained postflight bytes.

Fourteen companion snapshots bind exact bytes, default-stream status, attributes and DACL digests to the existing RF admission operation. Unrelated settings and sentinel files survive. The Windows metadata-and-rename implementation retains its previously documented limit: it does not provide an atomic compare-and-swap against arbitrary writers.

The provider is a deterministic loopback fixture driving real client protocols. These results do not establish external inference or third-party authentication.

## Ownership and cleanup

Every controlled process has a retained native birth, matching image and terminal observation. The caller and worker identities differ; the worker remains active after caller termination. Zero-timeout polling lets the native debug owner continue processing events. The unchanged owner verifier requires every retained handle to reach termination and close.

All seventeen outer jobs finish with zero active processes, closed job handles and disposed process objects before final inventory. Main accepts each case from its retained evidence. Cleanup then repeats owner verification and obtains a fresh full native inventory that must equal the accepted postflight inventory. Only that exact marked directory can be removed.

The seventeen accepted directories are removed after validation: 145,263 file records and 16,054,905,739 bytes. Personal client installations and prior protected roots are untouched.

Attempt 003 exposed a fixture comparison defect before installation or a controlled cut: the TOML parser returns null-prototype objects, while `structuredClone` normalizes their prototypes. Normalization at the settings read boundary fixes the value comparison; separate configuration-byte comparisons stay exact. All 35 observed identities close. Its failed directory remains preserved without a postflight inventory, cleanup or reuse; the corrected case uses a new directory.

The independent artifact verifier also initially assumed only the selected checkpoint was recorded. The observer records every reached point and pauses only at the selected one. The corrected verifier requires the exact saved event at that point and independently counts all execution entries and returns. No product or instrumentation change was needed.

## Evidence and next boundary

`.audit/probes/portable-features-windows-recovery/` retains the frozen design and seventeen-case matrix, exact overlay derivation, per-attempt artifacts, main acceptance and cleanup receipts, strict schema decoder, independent native-byte/event review and complete matrix verification. `acceptance.json` seals those files and the preceding normal-lifecycle evidence.

This gate carries forward the 318-property audit and changes no production model or implementation. Automatic format selection, the four qualified user-profile registrations and regeneration of the exact native-qualified runtime are the next integration step. Project feature profiles and source symbolic-link qualification remain open. macOS has no available host. Grok native tests, third-party authentication, CI, package-consumer and release-wide checks, and publication remain deferred.
