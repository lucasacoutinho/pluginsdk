# Cursor IDE local plugin lifecycle

Windows Cursor 3.26.16 reloads two generations of an unchanged SDK-built package and stops discovering the plugin after its local directory is removed. The same isolated home and user-data directory are retained across three fresh IDE sessions.

This qualifies native local loading, replacement and removal in that context. A private harness changes the package directory while Cursor is closed. The public SDK Cursor adapter, its ownership rules and recovery behavior remain open.

## One definition, two releases

Each release defines the same plugin, `cursor-ui-lifecycle`, with one skill and a bundled stdio MCP server. Two ordinary production CLI builds produce four complete Claude and Codex bundles. Each bundle has seven files. Independent decoding verifies every payload and bundle commitment.

The exact Claude package is copied to `<isolated-home>/.cursor/plugins/local/cursor-ui-lifecycle`. No manifest, MCP configuration, root variable or runtime is rewritten for Cursor.

| Fresh session | Skill shown in Cursor | MCP tool reported by the server |
| --- | --- | --- |
| Install 1.0.0 | `lifecycle-evidence`, description `Cursor lifecycle generation one.` | `lifecycle_one` |
| Replace with 1.0.1 | Same skill, description `Cursor lifecycle generation two.` | `lifecycle_two` |
| Remove the package | Native Plugins and Skills views show their empty states. | The plugin MCP row is absent; the trace records no new startup or request. |

Both installed sessions show `Cursor Ui Lifecycle` with a Local badge. Their MCP views show `lifecycle_server` with a Plugin badge and one tool enabled. Tool names come from the retained `tools/list` responses; the UI row does not expand them. The separate built-in Computer Use server remains visible after removal.

## Native execution and retained evidence

The client is pinned to commit `8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40`. All twelve installed client pins remain unchanged before and after execution. Node 24.18 runs from the private root. Each window uses the same private project, home, app data, user data and extension directory, with a fresh loopback debugging port. No existing account or credentials are borrowed.

An ordinary development-extension test runner opens Plugins, Skills and MCPs through their public commands. It requests no proposed API and uses no smoke-driver flag. A nonce title and workbench marker identify each window before capture. All nine post-command screenshots are inspected by main.

Each generation starts one fixture server. Its trace records initialization, the correct release version, its tool-list response and stdin EOF. Cursor closes normally before the next package change. Exact package bytes match the corresponding SDK release before and after each installed session. The third session leaves the trace unchanged. The Windows job closes with no surviving descendants.

The private record is `.audit/probes/cursor-ui-lifecycle/attempt-001`. It retains twelve screenshots with text and accessibility snapshots, both server exchanges, frozen inputs, main acceptance, visual review and cleanup receipts. All 357 runtime files are retained and compared with the native inventory before removing the owned temporary root. An acceptance-checker path error is preserved with its correction; it did not require another native run.

## SDK admission

The [ownership model](cursor-ownership-design.md), [physical claims](windows-physical-claims-acceptance.md), [rooted observation](windows-local-observation-acceptance.md) and [private local installer](windows-local-execution-acceptance.md) pass their component gates. Installer target integration and explicit local recovery remain next. Actual SDK install, update, remove, drift and interruption checks must pass before a public support row.

Tool invocation, hooks, agents, authenticated marketplaces, organization policy and other Cursor versions or platforms need separate evidence. The [initial UI check](cursor-ui-premise.md), [private inspection limit](cursor-native-premise.md) and [terminal-agent registration check](cursor-agent-premise.md) retain their own scopes.
