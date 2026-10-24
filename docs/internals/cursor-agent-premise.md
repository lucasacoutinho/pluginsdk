# Cursor Agent native MCP premise

Windows Cursor Agent `2026.10.22-27dcf5f` initializes the SDK-built portable MCP payload and discovers `echo(value)` after explicit user MCP registration. A fresh command reports no configured server after that registration is removed. The seven package files retain their bytes.

This qualifies registration and metadata discovery in the terminal client. The IDE's [UI loading check](cursor-ui-premise.md) and [two-generation local lifecycle](cursor-local-lifecycle.md) have separate evidence. Terminal plugin lifecycle, hooks, agents and tool invocation remain unqualified. No public SDK Cursor adapter or support row is enabled.

## Accepted native checks

The official versioned Windows archive contains 411 pinned files. The installer is retained as provenance and never executed. Each run uses a fresh home, config directory, data directory, app data, project and compile cache. `--disable-auto-update` is set on every command.

| Case | Native result |
| --- | --- |
| Version and root help | Two commands exit successfully and identify the pinned release. |
| Management capabilities | Six queries establish the plugin and MCP command trees, empty MCP state, required marketplace authentication and the local-runtime restriction. |
| MCP registration | Three commands test the plugin-directory boundary, explicit registration and absence after removal. The registered server completes two initialization and tool-list exchanges. Both connections close. |

All eleven accepted commands exit and close without timeout or forced termination. Their three Windows jobs report zero surviving descendants. Runtime bytes are retained before the accepted temporary roots are removed.

## Plugin and marketplace limits

The `plugin` command exposes marketplace add, list, update and removal. It has no standalone plugin install, list or removal command. A normal `plugin marketplace list --format json` exits with code 1 and requires authentication.

`--authless` exits with code 2 in this archive and identifies `agent-cli-local` as the required runtime. The local marketplace branch found in the source does not establish support in the shipped terminal client.

The root `--plugin-dir` flag does not supply a server to the MCP inspection command. Requesting the plugin server identifier through `mcp list-tools` returns not found without starting the server. This does not determine how agent mode loads plugins.

## MCP registration and shutdown

The fixture uses the exact Claude bundle from the earlier ordinary SDK build. A separate user MCP configuration binds the staged Node 24.18 runtime to `.psdk/runtime/process.mjs`, the package root and `.psdk/mcp/0.json`. That registration also supplies the isolated profile and trace environment.

The actual Cursor process initializes the server and lists `echo(value)`. Independent server records contain `initialize`, `notifications/initialized` and `tools/list`. No `tools/call` is sent. The CLI has no direct tool-call command in this release.

The accepted successor captures the server trace before and after each command. Both observed connections start and close during the registered metadata query. The complete trace remains unchanged after registration removal.

## Retained counterexample

Attempt 003 completes the same three CLI operations, but the probe incorrectly requires exactly one MCP connection. The trace contains two complete start and EOF pairs, and the Windows job reports no surviving process. The cause of the second connection is not established by that trace.

That attempt remains failed and separate. Its physical root `p-d3d897f853873ab2` is preserved without further inspection. Attempt 004 replaces the fixed count with complete connection accounting and a per-command trace comparison. The package and client bytes are unchanged.

## Records and remaining work

The records are under `.audit/probes/cursor-agent-premise`: `download.json`, `client-pin.json`, `cli-facts.md`, frozen inputs and per-attempt native output. Accepted attempts 001, 002 and 004 include independent `main-acceptance.json`, retained runtime and cleanup receipts. The parent `acceptance.json` binds this checkpoint to the earlier IDE premise.

Cursor's target design must account for plugin loading, marketplace authentication and MCP registration as separate operations. Plugin lifecycle qualification and an LDD model remain prerequisites to product I/O. The [IDE inspection limit](cursor-native-premise.md) retains its own evidence.
