# Windows stdio launcher premises

The private generated-launcher prototype passes on Windows Claude Code 2.1.304 and Codex 0.163.0. Both clients start package-local Node servers through an added Node launcher. The wrapper preserves ten literal arguments, a literal environment binding and the requested working directory. Paths contain spaces and Japanese characters.

This is evidence for the [encoding design](windows-stdio-design.md). Production schemas, compiler models, generated formats and compatibility profiles are unchanged. The new encoding still requires Lean properties, oracle conformance and SDK-built native acceptance.

## Client observations

| Check | Claude Code | Codex |
| --- | --- | --- |
| Native commands in the successful attempt | 8 | 6 |
| Connected and listed the fixture's tools | All three configurations | All three configurations |
| Direct tool calls | No CLI route was used | Three echo calls returned the expected text |
| Direct process cwd control | Configured cwd was ignored; the project directory was used | The configured package directory was used |
| Wrapped process cwd | The requested package directory | The requested package directory |
| Mock server starts | 3 | 6 |
| Additional interval descendants | 1 | 2 |
| Independently retained process births | 56 | 36 |
| Recorded wait, final observation and close operations | 168 | 108 |

Each client exercised a direct server, a wrapped server that exits on EOF, and a wrapped server configured to remain alive after EOF with an additional descendant. Every wrapped startup preserved the complete argument sequence, including an empty string, whitespace, quotes, a trailing backslash, a newline, Unicode, literal placeholders and shell punctuation. The server logs also preserved the literal environment value.

Claude's logs contain EOF for each server. Codex's logs contain no EOF; its sessions still complete all observed process families. The evidence supports process termination, not a promise of graceful MCP shutdown on Codex.

The command owner observes native process creation under a debugger. Before resuming each birth, the probe retains an independent process handle and persists its PID, creation time and image. Normal command completion requires the owner's complete writer ledger. The main-thread validator separately requires a signaled wait, a matching terminated witness and successful closure for every retained handle. Timeout or forced owner cleanup fails the client premise.

## Corrected setup attempt

The first Codex attempt stopped at marketplace registration with exit code 1, before any MCP server started. Its configured `CODEX_HOME` directory did not exist. The pinned [Codex home resolver](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/utils/home-dir/src/lib.rs#L7-L8) requires an existing directory.

The failed attempt and its four completed process births remain retained. Creating that directory was the only correction before rerunning the unchanged driver and native packages. The second attempt passes. The qualified byte channel drains stderr, so the first attempt's exact native error text was unavailable; the missing-directory diagnosis follows the source contract and the successful controlled correction.

## Linux transfer primitive

A separate Node 24.18.0 check transfers execution through `/bin/sh` to a final Node process. The original and final PID and working directory match. Ten literal arguments and the fixture environment value survive. This supports reusing the existing POSIX launcher beneath a portable entry point. It does not qualify a generated package or a native client session on Linux.

## Retained evidence and cleanup

The receipts are under `.audit/probes/windows-stdio-premise/`:

- `main-validation.json` checks both successful clients and their mock-server logs.
- `retained/claude/` contains Claude's commands, births, waits and server logs.
- `retained/codex/` preserves the failed setup attempt.
- `home-ready/retained/codex/` contains the successful corrected attempt.
- `posix-transfer-validation.json` records the Linux transfer primitive.
- `cleanup.json` records removal after all three attempts' process handles completed.

The isolated Windows stage was removed: 5,111 files and 888,043,600 bytes. Prior protected roots were preserved. The scoped TypeScript build and strict Effect diagnostics pass with zero errors, warnings or messages. CI, package-consumer, release, provider authentication, Grok and macOS checks did not run. No macOS host is available.
