# Portable features on Linux

The private SDK candidate passes complete user-scope lifecycles on Claude Code 2.1.304 and Codex 0.163.0. One definition produces each client's portable v2 package with a skill, stdio MCP server, both supported hook events and a plugin-qualified agent. Production profiles, automatic format selection and the distributed runtime remain unchanged.

## Scope and artifacts

This gate follows [compiler acceptance](portable-features-compiler-acceptance.md). Its 310 proof certificates, frozen format expectations and compiler conformance remain the prerequisite; this gate adds native evidence without changing their contracts or implementation.

The candidate copies the accepted source and adds v2 only to the two pinned Linux user profiles. Its runtime is regenerated with the normal repository build root and existing bundler options. The substantive diff adds the two format literals and relocates shared schema ownership. The qualified artifact is 323,628 bytes, SHA-256 `1af914d102843fb1c8dcda0825aad46328073394f27c4d6afeb1cb08e9085cf2`. The production runtime retains its previous bytes.

The main artifacts are under `.audit/probes/portable-features-native-linux/`:

- `baseline.json`, `design.md` and the candidate retain the source boundary and selected experiment.
- `fixture-build.json`, `source/`, `bundles/` and `packages/` bind two versions to four deterministic complete builds.
- `attempt-004/codex/evidence/` and `attempt-006/claude/evidence/` contain the accepted reports, protocol, process inventories and SDK requests/results. Each attempt retains its exact harness snapshot and candidate hashes.
- `inspect-native.py` and `native-inspection.json` independently check receipts, package hashes, raw child requests, tool errors, native trust and removal.
- `acceptance.json` seals these records and names the predecessor checkpoint.

Each package has sixteen files: three process descriptors, three shell sidecars and one shared runtime, alongside the native documents and captured author content. Program arguments use captured file references before changing cwd. Empty arguments, spaces, shell syntax, Unicode and the literal environment value survive both clients.

## Observed behavior

| Check | Claude | Codex |
| --- | --- | --- |
| SDK plan/apply operations | 12 | 12 |
| Native registration mutations | 6 | 6 |
| Completed replays with no new mutation | 3 | 3 |
| Real MCP initialization and echo calls | Both versions | Both versions |
| Startup context and prompt blocking | Both versions | Both versions |
| Qualified agent dispatch | Both versions | Both versions |
| Fresh session after removal | Pass | Pass |
| Direct command handles closed | 20 | 14 |

The SDK installs, replaces and removes each complete bundle. Receipts bind the exact reviewed plan and bundle digest. Present and absent fixed points agree with native observation. All six replay checks issue zero new registration mutation. Native discovery after removal omits the role, MCP server and startup context; the Codex companion is absent.

MCP evidence includes real native `initialize`, `notifications/initialized`, `tools/list` and `tools/call` traffic. Responses change from `feature-one:safe-marker` to `feature-two:safe-marker`. Native protocol metadata is retained alongside the unchanged tool name and authored arguments.

Both clients execute real `SessionStart` and `UserPromptSubmit` events. The startup marker reaches the static provider's request. A marked prompt produces the generation's block reason without increasing the provider request count. Each block follows a successful native provider control.

Codex initially reports both hooks untrusted. The harness explicitly reviews their current hashes through its native configuration API and confirms trusted status before execution. Generation two changes the prompt hook timeout from 30 to 31 seconds: that definition becomes `modified` and needs review again. The startup hook's native definition and hash remain unchanged, so it stays trusted despite changed referenced program bytes. Native hook trust therefore does not replace the SDK's complete-bundle commitment. PluginSDK does not write these trust approvals.

Each client dispatches `portable-feature-pilot:auditor`. Distinct child requests contain the complete authored prompt and selected model. Generation one uses `claude-haiku-4-5` or `gpt-6-luna`; generation two uses `claude-sonnet-4-6` or `gpt-6.1-sol`. Under `shell: deny`, Bash is absent from Claude's child tool catalog and a forced call returns `No such tool available: Bash`. Codex omits the nested shell capability and rejects its forced call with `TypeError: tools.exec_command is not a function`. Neither sentinel exists. Under `host_default`, the new child advertises its shell without executing it. These results establish native tool exclusion.

Payload checks cover 96 file observations across both versions and clients. Main-thread inspection rehashes the 64 retained source files. It compares the 32 recorded Codex cache files against their exact bundles and confirms those cache directories were removed by native uninstallation. Codex companion bytes and mode `0600` match their reviewed captures before removal.

## Controls, failures and limits

Every accepted client runs in a fresh user, network, PID and mount namespace with a private home and pinned binaries. The provider binds only loopback in that namespace. Static responses drive native protocols; they do not exercise external inference or third-party authentication. Parent-death binding, bounded output, held direct-child handles and final process inventories govern cleanup. Both accepted runs close the provider, require no forced cleanup and leave no live namespace process.

Earlier attempts remain retained. The first caught a fixture readline/EOF defect before a native client started. Later attempts corrected the pinned Codex namespace/custom-call shape, an unapproved Claude fixture tool and Claude's default asynchronous agent dispatch. Attempt four's Claude command reached its deadline and required forced termination; it contributes no passing lifecycle evidence. The accepted Claude fixture explicitly allows only its echo tool and Agent dispatch and requests a foreground agent because the next assertion depends on its result.

This qualifies the private Linux user candidate. Windows companion storage and complete Windows feature lifecycles remain open before profile promotion. macOS has no available host. Native Grok tests, third-party authentication, CI, package-consumer checks and release publication remain deferred. Personal client installations and the protected Windows roots were not used.
