# Troubleshoot PluginSDK

## `publish` asks for a destination or a new build

Add the [publication configuration](publishing.md#configure-the-destination) to your definition and run `build` again. A definition change invalidates its captured build. For changed release content, increment the version before rebuilding.

If publication is `uncertain`, rerun `publish`. It inspects the destination before attempting another update. A rejected concurrent update also needs a rerun against the current branch.

## `preview` cannot find a client

Check that `claude` or `codex` is on `PATH`. Use `--target` to select one client. Preview reports a missing client when the other one is available; an unsupported installed version stops the operation before installation changes.

## The client or platform is unsupported

Check your client version against [Supported clients](compatibility.md). Use the client's configuration directory for `--home`. For Codex, that is normally `$HOME/.codex`; for Claude Code, `$HOME/.claude`.

Windows x64 supports user installations and preview for Claude Code 2.1.304 and Codex CLI 0.163.0, including bundled stdio MCP with Node 24.18+. Use `pluginsdk preview --target claude_code` or `pluginsdk preview --target codex` for a development copy.

Both clients support [project installations](usage.md#install-for-a-project) on Windows. Codex requires a trusted project with plugins enabled. Claude can list a project installation as disabled when you inspect it from a different project. Bundled stdio, hooks and agents require one of the client, version and scope combinations in [Supported clients](compatibility.md). macOS and clients outside that table are unavailable.

## A Windows working directory is too long

Choose a shorter client configuration directory and create a fresh plan. The limit applies to the installed server's directory, including the client's cache and the declared `cwd`. Moving only the source checkout may not shorten it.

Preview uses `CLAUDE_CONFIG_DIR` or `CODEX_HOME` when set. Explicit installation plans use `--home`. Keep the client and PluginSDK pointed at the same configuration directory.

## Planning returns `blocked`

Inspect the reported reason:

| Reason | Meaning | Next action |
| --- | --- | --- |
| `unowned` | Existing content cannot be attributed to this managed installation. | Inspect the native installation. Resolve the existing installation before creating a fresh plan. |
| `drift` | Managed content changed outside the reviewed operation. | Compare the change with your intended release, then resolve it before replanning. |
| `unknown` | PluginSDK cannot establish the current state. | Check client availability and file access, then retry planning. |

PluginSDK does not overwrite an installation merely because its name matches your plugin.

## Applying returns `stale_plan`

Create a fresh plan. The client version, destination or installation state has changed since the saved review. Inspect the new plan before applying it.

## Planning returns `pending`, or apply returns `uncertain`

Retain the saved plan. Apply that same plan again to inspect and settle the interrupted operation. If it remains uncertain, follow the [repair steps](usage.md#resume-an-interrupted-change).

A different plan cannot replace a pending change. Deleting the saved state removes information needed for recovery.

## A feature fails when building both clients

Check [feature limits](compatibility.md#feature-limits). Some native features have no equivalent in the other client. Use `--target claude_code` or `--target codex` only when you intend to distribute to that client alone.

## The plugin is installed but its MCP tools are unavailable

Open a fresh client session. Check that the endpoint is reachable from the client and that its authentication route is configured there. Then check the service's permissions for your user.

Building or installing a plugin does not start a remote MCP service or grant tool access. For a bundled stdio server, check that its declared runtime and captured dependencies are available.
