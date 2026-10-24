# Install, update and remove a plugin

Use a built package and an existing [supported client configuration](compatibility.md). The commands below manage the release notes plugin in Codex. For Claude Code, use `--host claude_code`, its bundle and `$HOME/.claude`.

## Review an installation

```sh
npx pluginsdk plan .pluginsdk/build/codex.bundle.json \
	--host codex --home "$HOME/.codex" \
	--out .pluginsdk/codex.plan.json
npx pluginsdk show .pluginsdk/codex.plan.json
```

Planning saves a review without changing the native installation. The review includes the client version, destination, current state and files to install.

Apply a `ready` plan after reviewing it:

```sh
npx pluginsdk apply .pluginsdk/codex.plan.json
```

`unchanged` means no installation change is needed. A `blocked` or `pending` result needs attention before another change. See [Troubleshooting](troubleshooting.md).

The home is the client's configuration directory, such as `$HOME/.codex`, rather than your user home. Keep saved plans available for recovery.

## Update a plugin

Edit your definition or content, then build again:

```sh
npx pluginsdk build examples/release-notes/definition.json
```

Create a fresh plan with the installation command above. Review the replacement and apply it. PluginSDK uses the captured package bytes, so later source edits cannot alter that plan.

Reapplying a completed plan returns its recorded result without repeating the native change. To inspect the current installation, create a fresh plan.

## Install for a project

Add the project root to the plan. For Codex 0.163.0, use a project already trusted by Codex with plugins enabled:

```sh
npx pluginsdk plan .pluginsdk/build/codex.bundle.json \
	--host codex --home "$HOME/.codex" --project "$PWD" \
	--out .pluginsdk/codex-project.plan.json
npx pluginsdk show .pluginsdk/codex-project.plan.json
npx pluginsdk apply .pluginsdk/codex-project.plan.json
```

Codex keeps its ordinary home and authentication. PluginSDK updates the project's `.codex/config.toml` while preserving unrelated settings. The review includes the config file's digest and permissions. If that file changes after review, create a fresh plan.

For a supported Claude Code version on Linux or Windows:

```sh
npx pluginsdk plan .pluginsdk/build/claude_code.bundle.json --host claude_code --home "$HOME/.claude" --project "$PWD" --out .pluginsdk/claude-project.plan.json
npx pluginsdk show .pluginsdk/claude-project.plan.json
npx pluginsdk apply .pluginsdk/claude-project.plan.json
```

Claude enables the plugin through the selected project's `.claude/settings.json`. It stores marketplace metadata in its shared home, so another project may list this installation as disabled.

Project scope supports skills, supporting files and remote HTTP MCP declarations on the [listed versions](compatibility.md). Bundled stdio, hooks and agents also work in Claude Code 2.1.304 projects on Linux and Windows, and Codex 0.163.0 projects on Linux and Windows, using the same built packages.

A conflicting agent name or an edited installed package blocks replacement and removal. Resolve the conflicting name or restore the reviewed contents, then create a fresh plan.

PluginSDK serializes operations that share a client home or project, including a project managed from different client homes. Keep the generated `.pluginsdk/installer/` directory out of version control.

## Remove a plugin

Plan removal using the plugin ID from its definition:

```sh
npx pluginsdk remove release-notes \
	--host codex --home "$HOME/.codex" \
	--out .pluginsdk/codex-remove.plan.json
npx pluginsdk show .pluginsdk/codex-remove.plan.json
npx pluginsdk apply .pluginsdk/codex-remove.plan.json
```

Use the same home and project scope as the installation. A successful result is `removed`. Removing a client plugin does not revoke credentials or backend permissions.

## Resume an interrupted change

Apply the saved plan again. PluginSDK inspects the interrupted operation before reporting its outcome. It does not repeat an uncertain native change.

If the result stays `uncertain`, request a cleanup review:

```sh
npx pluginsdk repair .pluginsdk/codex.plan.json \
	--out .pluginsdk/codex-repair.plan.json
npx pluginsdk show .pluginsdk/codex-repair.plan.json
```

If the cleanup result is `repair_ready` and the proposed cleanup is correct, apply it:

```sh
npx pluginsdk apply .pluginsdk/codex-repair.plan.json
```

Cleanup requires the previous operation to have stopped and the remaining files to match PluginSDK's ownership records. Changed or unowned content blocks cleanup. After cleanup, create a fresh installation plan.
