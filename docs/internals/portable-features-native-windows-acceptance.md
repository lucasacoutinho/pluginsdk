# Portable features on Windows

Claude Code 2.1.304 and Codex 0.163.0 pass complete private Windows x64 user lifecycles. One definition builds both clients' packages and preserves MCP, hook and agent behavior across installation, replacement and removal. Production profiles, automatic format selection and the distributed runtime remain unchanged. Interruption and explicit repair are the next qualification gate.

## Source and inputs

This gate follows [Windows companion integration](windows-companion-integration-acceptance.md) and [Linux feature acceptance](portable-features-native-linux-acceptance.md). The 318-property audit and accepted pure conformance remain prerequisites. No production source, domain contract or author configuration changes in this gate.

The private SDK contains 718 source and compiled files. It admits portable v2 only on the two pinned Windows user profiles. Its shared process runtime is the accepted 323,628-byte Linux artifact, SHA-256 `1af914d102843fb1c8dcda0825aad46328073394f27c4d6afeb1cb08e9085cf2`. The ordinary Installer still uses its detached transaction worker and native recipe worker.

One definition has two versions. Each builds a sixteen-file Claude package and a sixteen-file Codex package. All four packages match the Linux reference byte for byte. Each contains a skill, stdio MCP, `SessionStart` and `UserPromptSubmit` hooks, and a plugin-qualified agent. Literal arguments include an empty string, spaces, shell syntax and Unicode. The environment value contains literal `${UNCHANGED}` text.

Claude's executable matches its official signed manifest. Codex's archive matches its npm integrity metadata and verified registry signatures. The Windows runtime closure contains thirty lock-pinned packages, including required peer dependencies. All archive contents, manifests, checksums and extracted files pass independent main-thread verification. Optional peers and incompatible optional platform packages remain distinct in the acquisition record.

## Native results

| Check | Claude | Codex |
| --- | --- | --- |
| Complete SDK lifecycle | 12 operations pass | 12 operations pass |
| Mutation-free replay | 3 pass | 3 pass |
| MCP calls, startup context and prompt blocking | Both versions pass | Both versions pass |
| Native agent prompt, model and tool policy | Both versions pass | Both versions pass |
| Windows companion content and metadata | Not used | Both versions match |
| Fresh session after removal | Pass | Pass |
| Final owner verification | 77 owners, 530 identities pass | 90 owners, 322 identities pass |

The accepted Claude record is `attempt-004/claude-main-verification.json` under `.audit/probes/portable-features-native-windows/`. Receipts bind the reviewed plan and bundle digest. Main inspection checks all twelve saved results, three exact replays, six native registration mutations and 32 payload file observations. Nine fresh native feature sessions cover both versions and absence after removal. The postflight inventory contains 8,160 files and preserves every immutable input.

The accepted Codex record is `attempt-005/codex-main-verification.json`. Its twelve SDK operations include three exact replays and six registration mutations. Three native app-server sessions cover both versions and absence after removal. Main inspection compares 64 payload file observations and both companion documents. Its 9,018-file postflight preserves every immutable input. The authoritative Effect schemas decode all 24 SDK request/result pairs across the two clients.

Together the accepted runs cover twelve native feature sessions, 96 payload file observations and 852 retained process identities across 167 owner journals. Both direct owner process objects are disposed after their jobs report zero active processes and close.

Both clients dispatch `portable-feature-pilot:auditor`. Generation one uses `claude-haiku-4-5` or `gpt-6-luna` and excludes the shell tool. A forced call receives a native tool error. Generation two uses `claude-sonnet-4-6` or `gpt-6.1-sol` and advertises the host's shell tool. The fixture does not execute that advertised shell in generation two.

Codex's native hook definitions start untrusted. The harness reviews their exact current hashes through the native configuration API. Changing the prompt hook timeout from 30 to 31 seconds changes its hash and requires another review. The startup hook definition remains unchanged and retains its native trust. These approvals remain separate from the SDK's complete-bundle commitment.

The Codex companion reads retain the exact authored bytes, attributes, DACL digest and default-stream state. They pass the existing Windows file-admission operation. This adds native composition evidence to the preceding file-component qualification without claiming POSIX mode semantics on Windows.

## Ownership and retained failures

Every run uses a fresh marked Windows Temp root, private client homes, private projects and verified Linux inputs. A held Windows job owns the caller. Native debug owners record process identities before resume. The final verifier requires each retained identity's terminal wait, matching observation and closed handle. The verifier is unchanged.

Intermediate checks distinguish the caller's recorded startup console from later command and worker processes. A transient image-query failure remains an unknown observation until a later lookup proves termination. Other errors and handle-close failures still refuse the check.

Earlier failed attempts remain evidence:

- Attempt 001 exposes missing required peer dependencies before a client starts. Its root has no causal owner journal and remains preserved.
- Attempt 002 completes the first backend controls, then exposes the startup-console scope error. Evidence recovery also corrects an unsupported PowerShell parameter combination. The unchanged verifier proves all eleven process identities stopped and closed.
- Attempt 003 returns a completed install receipt, then exposes a process image-query race. All 84 identities pass final verification.
- Attempt 004 completely qualifies Claude. Its Codex run passes both feature generations but reaches the 240-second caller deadline after removal planning. Interrupted inner journals lack terminal records, so that Codex run has no passing lifecycle or cleanup claim.

The accepted Codex-only successor uses a measured 420-second caller deadline, a 480-second outer job deadline and a 540-second controller deadline. Per-command, SDK, protocol and quiescence limits stay unchanged. It uses a fresh root and preserves the accepted Claude result.

Only the successful successor root is removed. Before removal, the main thread repeats owner verification and a complete native inventory, which matches the accepted 9,018-file postflight exactly. The cleanup receipt records 953,683,335 bytes removed. Attempt 004's root remains preserved because its later Codex interruption lacks complete ownership records, even though its earlier Claude checkpoint passed. No failed or older protected root is inventoried for cleanup or removed.

## Remaining gates

The static provider binds to loopback and drives real client protocols. These checks do not exercise external inference or third-party authentication. Personal client installations and older Windows scratch trees are not qualification inputs.

Interruption and explicit repair remain required before portable v2 profile promotion. The Windows file owner's documented rename limit still applies. macOS has no available host. Grok tests, third-party authentication, CI, package-consumer checks and release publication remain deferred.
