# Supported clients and platforms

PluginSDK builds one Claude Code package and one Codex package from the same definition. Cursor uses the Claude-compatible package. Installation checks the client's native contract, platform, scope and the features the package needs. Client version strings are recorded for diagnostics; they are not an allowlist.

Run the CLI with Node 24+. Bundled stdio servers and command hooks also need Node 24.18+ on the client's `PATH`.

| Platform | Client | User installation | Project installation |
| --- | --- | --- | --- |
| Linux | Claude Code | Skills, assets, remote and bundled MCP, hooks, agents | Same features |
| Linux | Codex CLI | Skills, assets, remote and bundled MCP, hooks, agents | Same features |
| Windows x64 | Claude Code | Skills, assets, remote and bundled MCP, hooks, agents | Same features |
| Windows x64 | Codex CLI | Skills, assets, remote and bundled MCP, hooks, agents | Same features |
| Windows x64 | Cursor IDE | Skills, assets, remote and bundled MCP | Unavailable |

Preview in available local clients with `pluginsdk preview`. Use `--target claude_code`, `--target codex` or `--target cursor` to select one client. See [Publishing](publishing.md#preview-locally) for Cursor's shared-source behavior and [Manage installations](usage.md#install-for-a-project) for project scope.

macOS installation is unavailable. ChatGPT, Grok Bot and Meta Muse have no installation adapters. Claude Desktop and Claude web are separate products from Claude Code and are not covered by its adapter.

## Feature limits

Remote HTTP MCP declarations support literal URLs and headers across both package clients. Environment-backed headers are available for Claude-only builds. A build for both clients rejects declarations that one cannot preserve. Your services authenticate users and enforce backend tool permissions.

Codex project installations require a trusted project with plugins enabled. An existing effective configuration for the same plugin ID blocks installation. Resolve that installation before creating a project plan.

On Linux, bundled stdio servers and hooks require `/bin/sh`, Node with `process.execve`, and `/usr/bin/env` supporting `-u` and `-S` environment expansion. PluginSDK probes these operations. On Windows, each packaged command's working directory must fit within 258 UTF-16 units. Use a shorter client configuration directory if planning refuses that path.

Linux Claude Code can leave persistent descendants running after their parent exits. Account for those processes when writing your server's shutdown behavior.

Hooks support synchronous `SessionStart` and `UserPromptSubmit` commands. New or changed Codex hooks require native approval. Agents support a shared prompt, description, optional per-client models and shell-tool policy. Other agent controls and hook events are unavailable. Cursor rejects packages requiring hooks or agents.

## Client upgrades

A client version change alone does not invalidate an installation review or remove PluginSDK's ownership of a package. Changes to the physical destination, adapter contract, installed contents or reviewed configuration still require a fresh review. Native commands and responses must continue to satisfy the adapter's contract.

Maintainers keep exact tested binary versions and hashes in the [native evidence records](internals/README.md). The [current launch plan](internals/launch-plan.md) distinguishes existing evidence from qualification still in progress.
