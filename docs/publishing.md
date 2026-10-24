# Publish a plugin

Configure a destination once, then build and publish from your plugin directory:

```sh
npx pluginsdk build && npx pluginsdk publish
```

PluginSDK reads `definition.json`, builds Claude Code and Codex packages, and publishes their native marketplace entries together. The first supported destination is a Git repository that your organization controls.

## Configure the destination

Add `publish` to your definition:

```json
{
	"id": "platform-tools",
	"version": "1.0.0",
	"description": "Investigate incidents across internal services.",
	"skills": ["skills/triage-incident"],
	"mcp": {},
	"publish": {
		"type": "git",
		"repository": "git@github.com:acme/agent-plugins.git",
		"branch": "main",
		"marketplace": "acme"
	}
}
```

Replace the repository with your organization's URL. `branch` selects the publication branch; PluginSDK creates it if it is absent. `marketplace` is the name users select in their clients. It must match an existing marketplace's name when sharing a repository.

Use an SSH or HTTPS Git URL. An absolute local repository path also works for local development. Git uses your existing authentication. Keep credentials out of the definition. You need permission to push to the configured branch; repository protections still apply.

## Preview locally

```sh
npx pluginsdk preview
```

Preview installs a separate development plugin in available local Claude Code and Codex installations. It respects `CLAUDE_CONFIG_DIR` and `CODEX_HOME`, and otherwise uses their normal configuration directories. Use `--target claude_code` or `--target codex` to select one client.

Edit your workflows and run `preview` again. Open fresh client sessions to load the changes. Remove the development copy with `preview --remove`.

Preview does not publish or replace the captured production build.

## Publish a release

Set the intended version, then build and publish. `publish` sends the exact packages captured by the last successful build. It does not rebuild from later source edits.

Changing the definition, including its destination, requires a fresh build. If you use a custom build directory, pass it to both commands:

```sh
npx pluginsdk build --out .pluginsdk/release
npx pluginsdk publish --build .pluginsdk/release
```

A repeated identical publication returns `unchanged`. Reusing a version with different content fails; increment the version and rebuild. Replaying an older captured release leaves newer marketplace entries in place.

An occupied plugin name or changed managed package blocks publication. PluginSDK preserves other teams' marketplace entries and repository files. A concurrent branch change rejects the attempted update; rerun `publish` to inspect the latest state. An `uncertain` result also requires a rerun to confirm what reached the repository.

`build --target codex` captures a Codex-only release. Publishing it preserves the last Claude Code release in the marketplace. `build --format` emits an individual package for installation management and does not capture a publishable release.

## Install the published plugin

Your deployment tooling can distribute the Git marketplace. To install a local checkout of the published branch, use:

```sh
git clone --branch main git@github.com:acme/agent-plugins.git agent-plugins

# Claude Code
claude plugin marketplace add ./agent-plugins --scope user
claude plugin install platform-tools@acme --scope user

# Codex
codex plugin marketplace add ./agent-plugins
codex plugin add platform-tools@acme
```

Use the branch configured in your definition. For later releases, refresh that checkout through your deployment tooling before updating the client installation.

Open a fresh client session after installation. MCP services still authenticate users and enforce tool permissions through your existing infrastructure. Publishing the plugin does not deploy those services.
