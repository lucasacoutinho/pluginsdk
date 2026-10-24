# Cursor IDE local plugin loading premise

Windows Cursor 3.26.16 loads the unchanged SDK-built Claude package from its user-local plugin directory. The native UI lists the plugin, discovers its skill and shows its MCP server connected with one tool enabled. The server's own trace confirms initialization, tool discovery and shutdown.

This establishes local loading in the tested IDE context. The later [local lifecycle check](cursor-local-lifecycle.md) adds two package generations, replacement and fresh absence after removal. SDK ownership, drift handling and a public Cursor adapter remain open. No tool invocation, hooks, agents or organization marketplace operation is tested here.

## Package and execution

One production CLI build produces Claude and Codex bundles from the same fixture definition. The definition contains one skill and a bundled stdio MCP server. The seven Claude package files are copied without changes to `<isolated-home>/.cursor/plugins/local/cursor-ui-pilot`.

The client is pinned to commit `8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40`. Twelve installed files keep their hashes before and after the run. Node 24.18 is supplied in the private environment for the bundled runtime.

The IDE runs with fresh home, app data, user data, extension directory and project. An ordinary development extension test runner calls the public commands that open Plugins, Skills and MCPs. It requests no proposed API and uses no smoke-driver flag. The title and workbench marker identify the owned window before loopback CDP captures it. The screenshots show the unauthenticated client.

## Observed components

| View | Native observation |
| --- | --- |
| Plugins | `Cursor Ui Pilot` appears under Installed with a Local badge. |
| Skills | `ui-evidence` appears under the plugin with its authored description. |
| MCPs | `premise` appears under Connected with a Plugin badge and one tool enabled. |

The plugin display name is humanized, and the MCP row does not expand the tool's name. The raw substring checks therefore report false for `cursor-ui-pilot` and `ui_echo`. Main inspects the actual rows and screenshots; the raw results remain unchanged.

The server starts once and records `initialize`, `notifications/initialized`, `tools/list` and one stdin EOF. The app exits and closes without timeout or forced termination. The owning Windows job reports no surviving descendants. All seven installed package files retain their bytes.

## Evidence and remaining work

The private record is `.audit/probes/cursor-ui-premise/attempt-001`. It contains four screenshots with text and accessibility snapshots, the server trace, frozen inputs, independent `main-acceptance.json`, `main-visual-review.json` and cleanup receipt. All 262 runtime files are retained before removing the temporary root.

The [local lifecycle check](cursor-local-lifecycle.md) now covers two package generations, replacement and fresh absence after removal. An SDK ownership model, pure conformance and native recovery checks are still required before product I/O. Team policy and authenticated marketplace behavior need their own qualification. The [earlier inspection limit](cursor-native-premise.md) and [separate terminal-agent checks](cursor-agent-premise.md) retain distinct scopes.
