# Define a plugin

A plugin is a JSON definition plus the content it names. Paths are relative to the definition's directory unless you pass `--root`.

## Definition fields

```json
{
	"id": "release-notes",
	"version": "1.0.0",
	"description": "Draft release notes from repository history.",
	"skills": ["skills/release-notes"],
	"mcp": {}
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable plugin name. Use lowercase letters, digits, dots and hyphens. |
| `version` | Yes | Package version, such as `1.0.0`. |
| `description` | Yes | What the plugin does. |
| `skills` | Yes | Directories containing `SKILL.md`. Use an empty array for a tools-only plugin. |
| `mcp` | Yes | Named remote or stdio MCP servers. Use an empty object when there are none. |
| `assets` | No | Additional files or directories to include in the package. |
| `executables` | No | Source files to mark executable in each client package. |
| `hooks` | No | Named commands for supported client events. |
| `agents` | No | Named agents with shared Markdown prompts. |
| `publish` | No | [Publication destination](publishing.md), required by `publish`. |

Build the Claude Code and Codex packages with one command:

```sh
npx pluginsdk build
```

The command finds `definition.json` in the current directory. You can also pass its path explicitly. Use `preview` to try current changes locally and `publish` to release the captured build through the configured destination.

Use `--target claude_code`, `--target codex`, or `--target cursor` for one build target. Cursor uses the Claude-compatible package. Every build writes its packages and a publication snapshot into the output directory. See [Supported clients](compatibility.md) for platform and feature limits.

## Skills and supporting files

Each listed skill directory contains a `SKILL.md` with a name and description:

```markdown
---
name: release-notes
description: Use when drafting release notes from repository history.
---

Read the selected commit range and draft notes with the packaged template.
```

Files below that directory are included automatically. Put templates, runbooks and reference documents beside the skill, then use relative links from `SKILL.md`.

Use `assets` for files outside skill directories, such as an existing MCP server or hook program. All captured content must stay within the source root. Source paths cannot contain `..` segments.

The [release notes example](https://github.com/lucasacoutinho/pluginsdk-examples/tree/main/release-notes) shows a complete skill and template. The [platform tools example](https://github.com/lucasacoutinho/pluginsdk-examples/tree/main/platform-tools) shares two workflows across clients. The [Schemaloom plugin](https://github.com/lucasacoutinho/pluginsdk-examples/tree/main/public-marketplace/schemaloom) bundles a stdio MCP server.

## Executable files

Declare packaged commands once for both Claude and Codex:

```json
{
	"assets": ["tools"],
	"executables": ["tools/report.sh"]
}
```

This fragment includes the `tools` directory and marks `tools/report.sh` executable. All other captured source files are treated as data, regardless of their filesystem permissions. Use `"executables": []` to treat every captured source file as data.

Paths must name captured files relative to the source root, using exact spelling. For a script inside a skill, use its source path, such as `skills/release-notes/scripts/report.sh`. Duplicate declarations, directories and files outside the captured content fail the build. Generated manifests, agent documents and launchers receive their permissions from the compiler.

If you omit `executables`, the Linux builder reads each file's execute permission bits. On Windows, include `executables` explicitly. An explicit list avoids depending on checkout permissions. Installation preserves executable intent while retaining read and write restrictions imposed by the environment.

## Remote MCP services

Declare the endpoints of services you already run:

```json
{
	"mcp": {
		"services": {
			"url": "https://services.acme.internal/mcp",
			"headers": {}
		},
		"deployments": {
			"url": "https://deployments.acme.internal/mcp",
			"headers": {}
		}
	}
}
```

URLs use HTTPS, or HTTP on loopback for local development. `headers` is required. Literal headers work on both clients. Strings are literal: writing `${TOKEN}` does not read an environment variable.

Claude-only builds also accept an explicit environment header:

```json
{
	"Authorization": {
		"type": "environment",
		"name": "INTERNAL_MCP_TOKEN",
		"prefix": "Bearer "
	}
}
```

That object goes inside `headers`. A build that includes Codex rejects it. PluginSDK does not set up third-party sign-in or grant backend permissions. Keep credentials out of the shared definition and use the service's supported authentication route in each client.

## Bundled stdio MCP servers

Package an existing server and its dependencies through `assets`:

```json
{
	"assets": ["tools/release-audit"],
	"mcp": {
		"release-audit": {
			"type": "stdio",
			"command": "node",
			"args": [{ "file": "tools/release-audit/index.mjs" }]
		}
	}
}
```

A bare `command` names a runtime on the client's `PATH`. `{ "file": "..." }` names a captured executable or argument file. String arguments stay literal. Optional `cwd` is a packaged directory and defaults to the package root. Optional `env` supplies named values. Portable builds reject environment names that differ only by case.

The client starts the server when needed. PluginSDK packages the files and generates the native launchers. It does not install the server's runtime or fetch undeclared dependencies.

Bundled stdio servers use the same build and preview commands. They need Node 24.18+ on the client's `PATH`. Claude Code and Codex support them in user and project scope; Cursor supports user scope. See [Supported clients](compatibility.md) for runtime requirements.

## Command hooks

Hooks use the same command, argument, working-directory and environment fields as stdio servers:

```json
{
	"assets": ["tools/session-context.mjs"],
	"hooks": {
		"team-context": {
			"event": "SessionStart",
			"command": "node",
			"args": [{ "file": "tools/session-context.mjs" }],
			"timeout": 30
		}
	}
}
```

Supported events are `SessionStart` and `UserPromptSubmit`. Commands receive the native event JSON on stdin. `timeout` accepts 1–600 seconds and defaults to 30. Environment references are unavailable for shared hooks.

Codex requires native approval for newly installed hooks. See [Supported clients](compatibility.md) before distributing a hook.

## Shared agents

An agent points to a Markdown prompt:

```json
{
	"agents": {
		"incident-analyst": {
			"description": "Analyze incident evidence and produce an investigation report.",
			"prompt": "agents/incident-analyst.md",
			"shell": "deny"
		}
	}
}
```

For a plugin named `platform-tools`, the qualified agent name is `platform-tools:incident-analyst`. PluginSDK generates the native agent files and manages them with the installation.

Omit `models` to use each client's configured selection. To choose models explicitly, supply both client names:

```json
{
	"models": {
		"claude_code": "haiku",
		"codex": "gpt-6.1-sol"
	}
}
```

`shell` accepts `deny` or `host_default`, which is the default. This controls the native shell tool, not MCP service permissions. Other agent controls are rejected.

Stdio servers, hooks and agents have narrower [client and platform support](compatibility.md#feature-limits) than basic skills.
