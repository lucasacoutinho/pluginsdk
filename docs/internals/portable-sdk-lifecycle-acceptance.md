# Portable SDK lifecycle acceptance

One definition builds Claude and Codex packages with a shared portable launcher. A private SDK candidate passes installation, replacement with a changed backend, replay, removal and unchanged-state checks on Linux. The [Windows successor](portable-sdk-windows-lifecycle-acceptance.md) also passes both clients through the public Installer API after adding process-directory admission. The subsequent [automatic build gate](portable-defaults-acceptance.md) promotes the qualified profiles and default stdio selection.

The candidate copies the SDK emitted at the [runtime-admission checkpoint](launcher-runtime-admission.md). Its only SDK byte change admits portable formats in four existing user profiles. No project profile is added. The packaged runtime retains SHA-256 `9d1c4f65bd1329f9a9f9dd3679a74ce2b10478cf3182310e71b8ec655d91e0c2`.

The first version is the exact source used in [native package acceptance](portable-stdio-native-acceptance.md). The replacement changes the plugin and MCP server versions from `1.0.0` to `1.0.1`, and the real echo response from `portable:safe-marker` to `portable-two:safe-marker`. Launch arguments, environment values, working directories and validation guards stay identical. Eight held-process backend checks pass before the client sessions run.

| Linux client | SDK results | Native evidence |
| --- | --- | --- |
| Claude Code 2.1.304 | Twelve plan/apply operations pass; six native mutations; three exact replays produce no new mutation. | Both versions' direct and wrapped servers connect. Both 13-file source payloads match the bundles. |
| Codex 0.163.0 | The same twelve operations, six mutations and three replays pass. | All three servers return the expected echo response in each version. Source and loaded-cache payloads match all 13 bundle files in both versions. |

Both clients finish unchanged-present checks after installation and replacement, then unchanged-absent after removal. Receipts bind the reviewed plan and exact bundle digest. All native command handles close. No live process remains before either private PID namespace exits; neither controller times out or forces cleanup.

Claude Linux qualification covers startup and direct-process shutdown. Its separately documented persistent-grandchild limitation remains open; that deliberate fixture case is excluded from this lifecycle session. Codex includes the persistent descendants and observes their termination.

Evidence is retained under `.audit/probes/portable-sdk-lifecycle-update/`, including exact sources and bundles, the eight backend checks, per-client SDK inputs and outcomes, native inventories, protocol frames and independent main-thread validation. The two preceding fixture errors are preserved under `portable-sdk-lifecycle/` and `portable-sdk-lifecycle-evidence/`. Neither failed run qualifies a complete lifecycle.

The [Windows successor](portable-sdk-windows-lifecycle-acceptance.md) qualifies the runtime preflight, refusal before durable installation state, and complete SDK lifecycle for both user-scope profiles. Its emitted SDK includes the separately proved directory admission model. macOS has no available host. CI, package-consumer and release checks, publication, third-party authentication and Grok native tests remain deferred.
