# Executable-intent integration acceptance

Authors can declare executable source files in the existing definition and build Claude and Codex packages with one command. The optional [`executables` field](../authoring.md#executable-files) uses exact paths relative to the source root. An empty list treats every captured source file as data; omission keeps Linux permission discovery. Duplicate or uncaptured declarations fail with an `invalid_executable` issue.

[`capture`](../../src/compiler/source/capture.ts) retains one admitted observation per logical source path, resolves intent once and then projects skills and assets. Skill path shortening happens after resolution. Shared agent prompts reuse the admitted bytes; generated documents retain renderer-owned permissions.

[`readPayload`](../../src/installer/payload/read.ts) owns complete payload comparison for ordinary and Codex-project inspection. Both callers validate retained plan/bundle binding before invoking it. The reader binds observed paths and digests, reconstructs flags through the pure model and retains exact full-byte equality. An intact tree keeps the previous fingerprint; known path, byte or intent drift receives a commitment of the complete observed tree. Unavailable or unstable native observations remain unavailable.

## LDD evidence

The original sixteen properties cover source selection and payload binding. EI17-EI20 add exact staged intent, preserved read/write bits, unchanged matching modes and owner-execute addition when needed. All twenty certificates pass the scoped exact-type and axiom audit. The focused build has no warnings. The pure acceptance receipt predates production I/O edits and records their unchanged hashes at that checkpoint.

Six TypeScript tests cover 4,307 oracle comparisons: 57 source/payload examples, 3,208 generated source/payload cases, 18 staging examples and every one of the 512 permission values with both staging flags. The source/payload wire checker rejects 515 malformed requests and ten precise fractional values. The staging checker rejects 78 malformed requests and six precise fractional values; each checker accepts nineteen exact integral numeric forms.

All twenty obligations are registered, bringing the deferred combined gate to 238. This acceptance uses the scoped audit and checkers; the combined gate was not run.

## Linux behavior

| Check | Result |
| --- | --- |
| Source capture | Five tests pass for discovery, explicit empty lists, exact names and Unicode, missing/duplicate declarations, path projection, shared prompts and generated-file intent. |
| Payload inspection | Four tests pass for intact trees, byte/mode drift, missing/extra paths and symlink refusal. A literal independently computed fingerprint checks compatibility with the previous intact-tree commitment. |
| Staging | Five isolated child tests pass with exact bytes, exclusive-create collision preservation and cleanup. Read/write permissions remain restricted by each umask. |
| CLI | One selected test builds both client formats from one definition, checks file bytes/flags and rejects an absent declared path. Four unrelated publication cases were excluded. |
| Focused regressions | All 46 compiler, asset, agent, hook, local-MCP, project-build and storage checks pass. |
| Static checks | Scoped TypeScript, lint and strict Effect diagnostics pass. Effect reports zero errors, warnings and messages across seventeen configured files. |
| Real clients | Three selected lifecycle cases pass in isolated homes and a separate network namespace: Claude Code 2.1.304 user repair/install/remove, Codex 0.163.0 user repair/install/remove, and Codex 0.163.0 project install/replacement/stale review/removal/replay. Fifteen unrelated native cases were excluded. |

The native baseline reproduced a staging defect: umasks 0111, 0177 and 0777 removed every requested execute bit. The corrected [`stageFile`](../../src/installer/storage.ts) reads the created file's mode through its writable handle and applies the proved adjustment before flushing that handle. It preserves matching modes and adds only owner execute when true intent is missing.

| Umask | Executable file before | Executable file after | Data file after |
| --- | --- | --- | --- |
| 0022 | 0755 | 0755 | 0644 |
| 0077 | 0700 | 0700 | 0600 |
| 0111 | 0644 | 0744 | 0644 |
| 0177 | 0600 | 0700 | 0600 |
| 0777 | 0000 | 0100 | 0000 |

These checks create traversable parents before changing the child process's umask. The observer temporarily adds owner read where needed to inspect bytes, then restores the recorded mode. They establish file intent and unchanged data permissions, not support for inaccessible directory trees or successful shell startup under every mask.

Main review verified the negative baseline, corrected a case-collision fixture without weakening compiler policy, retained the full-byte comparison and checked the unchanged native profile table. Source hashes, the prior pure receipt, native raw observations, structured test results and check outputs are sealed under `.audit/probes/executable-intent-integration/`. The baseline fixture is retained separately; a later cleanup-helper refactor removes an unsafe-finally diagnostic.

## Remaining work

Production capture and payload traversal remain Linux-only. The subsequent [Windows file component](windows-executable-intent-acceptance.md) qualifies retained intent without enabling a profile. Root-session integration, complete-path budgets, source symbolic-link coverage, materialization, reader integration, activation and full Windows client lifecycle remain open. The seven existing native profile rows remain Linux-only; no Windows profile was added. macOS has no qualification host and remains deferred. CI, package-consumer and release-wide checks remain user-deferred.
