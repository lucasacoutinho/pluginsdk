# Supported clients and platforms

All installation profiles require Node 24+ and an exact supported client version. Bundled stdio MCP and command hooks require Node 24.18+ on the client's `PATH`. Claude Code and Codex packages are separate outputs from the same plugin definition.

| Platform | Client | Version | User installation | Project installation |
| --- | --- | --- | --- | --- |
| Linux | Claude Code | 2.1.303 | Skills, supporting files, remote HTTP MCP | Skills, supporting files, remote HTTP MCP |
| Linux | Claude Code | 2.1.304 | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents |
| Linux | Codex CLI | 0.162.1 | Skills, supporting files, remote HTTP MCP | Unavailable |
| Linux | Codex CLI | 0.163.0 | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents |
| Windows x64 | Claude Code | 2.1.304 | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents |
| Windows x64 | Codex CLI | 0.163.0 | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents | Skills, supporting files, remote HTTP MCP, bundled stdio MCP, hooks, agents |

On Windows, preview for your user with `pluginsdk preview --target claude_code` or `pluginsdk preview --target codex`. Both clients support the reviewed [project installation workflow](usage.md#install-for-a-project).

Maintainers can review the [user feature qualification](internals/portable-feature-defaults-acceptance.md), [Claude Linux project qualification](internals/portable-project-stdio-linux-acceptance.md), [Claude Windows project qualification](internals/portable-project-claude-windows-acceptance.md), [Codex Linux project qualification](internals/codex-project-portable-linux-admission.md), and [Codex Windows project qualification](internals/codex-project-portable-windows-admission.md).

macOS installation is unavailable. ChatGPT, Cursor, Grok Bot and Meta Muse do not have installation adapters. Claude Desktop and Claude web are different products from Claude Code and are not covered by its support.

## Feature limits

Remote HTTP MCP declarations support literal URLs and headers across both clients. Environment-backed headers are available for Claude-only builds. A build for both clients rejects declarations that one cannot preserve. Authentication and backend RBAC remain the responsibility of your services.

Codex project installations require a trusted project with plugins enabled. An existing effective configuration for the same plugin ID blocks installation. Resolve that installation before creating a project plan. See [Project installation](usage.md#install-for-a-project).

`build` packages bundled stdio MCP, hooks and agents for both clients from one definition. These packages support the newer Linux and Windows user profiles above, Claude Code 2.1.304 projects on Linux and Windows, and Codex 0.163.0 projects on Linux and Windows. Stdio servers and hook commands on Linux require `/bin/sh`, GNU `/usr/bin/env` 9.4 and Node with `process.execve`. On Windows, each packaged command's working directory must fit within 258 UTF-16 units. PluginSDK checks that limit before retaining an installation plan; use a shorter client configuration directory if it refuses the destination.

Linux Claude Code supports server startup and direct-process shutdown. It can leave persistent descendants running after their parent exits. Do not rely on it to stop those descendants.

Hooks support synchronous `SessionStart` and `UserPromptSubmit` commands. New or changed Codex hook definitions require native approval in Codex. Review hook code when updating a plugin.

Agents support a shared prompt, description, optional per-client models and shell-tool policy. Other agent controls and hook events are not available.

## Client upgrades

After changing client version, create a fresh installation plan. A previously reviewed plan is tied to its client version and is rejected after that version changes.

An installation can remain owned across the supported versions when its package features are supported by both. An unknown client version blocks installation until it is qualified.

Maintainers can find the native evidence and exact format revisions in the [compatibility record](internals/compatibility-design.md).
