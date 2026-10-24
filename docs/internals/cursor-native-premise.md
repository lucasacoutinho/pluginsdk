# Cursor native inspection premise

The installed Windows Cursor 3.26.16 passes isolated version and help commands. A registered development extension cannot use its internal MCP inspection API. Cursor rejects `getMcpLeaseServers` with the `cursor` proposal gate and identifies that proposal as available only to built-in extensions.

This establishes an inspection limit. The later [normal UI premise](cursor-ui-premise.md) observes local plugin, skill and MCP loading; the [local lifecycle check](cursor-local-lifecycle.md) adds replacement and fresh absence after removal. Tool calls, SDK-managed installation, hooks and agents remain unqualified for Cursor. The public support table is unchanged.

## Native evidence

The selected installation is `C:\Users\lcout\AppData\Local\Programs\cursor`, commit `8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40`. Its extension API reports version 1.128.0. The older installation on PATH is excluded.

The CLI premise runs `Cursor.exe` with its installed `out/cli.js` in Electron's Node mode. Both `--version` and `--help` exit and close successfully. The help output advertises a separate terminal-agent subcommand. The [pinned Agent premise](cursor-agent-premise.md) now records its command and MCP registration checks.

One ordinary production CLI build produces seven-file Claude and Codex bundles from the same definition. The fixture has one skill and a bundled stdio echo server. The exact Claude bundle is copied into the isolated home at `.cursor/plugins/local/cursor-premise-pilot`. No manifest, root variable or MCP configuration is rewritten.

The corrected normal-mode case registers `pluginsdkprobe.cursor-loading-premise` with `engines.vscode` set to `^1.128.0`. It uses no proposed API or smoke-driver flag. All three internal MCP methods are present, but calling `getMcpLeaseServers` fails at the proposal gate before the MCP service returns an inventory. There is no successful discovery or tool-call result.

Each native run has a fresh home, app-data directories, user-data directory, extension directory and project. Twelve installed files retain their hashes before and after the app runs. A Windows job owns each process tree before Cursor starts. Every accepted observation has a direct process close, zero surviving job descendants, complete retained runtime bytes and removal of its marked temporary root.

## Earlier probe errors

The earlier observations are retained separately and do not count as MCP evidence:

- Attempt 001 uses an invalid wildcard extension engine and reads gated metadata before reaching MCP.
- Attempt 002 is retired before launching Cursor after the engine rejection is found.
- Attempt 003 reads `extensionMode` from an extension descriptor. The shipped declarations place that property on `ExtensionContext`.
- Attempt 004 uses the registered extension and reaches the actual MCP API restriction.

## Other inspection routes

The installed extension host wraps the internal MCP methods in the same proposal check. Public extension APIs register servers and plugin paths, but provide no inventory or tool-call result. [Cursor's extension API reference](https://cursor.com/docs/extension-api) documents those registration operations.

The plugin-summary command requires `--enable-smoke-test-driver`. That flag changes experiment selection, so a smoke-mode result cannot qualify normal loading. Source inspection also finds that stable `vscode.lm.tools` returns an empty array and `invokeTool` rejects calls in this build. The MCP UI commands open settings, clear tokens or migrate grants. No direct tool-test command is identified.

The [separate terminal-agent premise](cursor-agent-premise.md) qualifies command behavior and explicit MCP metadata discovery on its pinned Windows release. Marketplace listing requires an account. The [IDE UI premise](cursor-ui-premise.md) now establishes local discovery without the private inspection API. Installation lifecycle remains open.

## Records

The private records are `.audit/probes/cursor-premise/attempt-001` for the CLI and `.audit/probes/cursor-loading-premise/attempt-004` for the registered-extension restriction. Their `main-acceptance.json`, retained runtime, frozen inputs and cleanup receipts record the bounds above. The parent `.audit/probes/cursor-loading-premise/acceptance.json` binds this checkpoint and its predecessor.
