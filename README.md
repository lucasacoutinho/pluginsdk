# PluginSDK

Build a plugin once for Claude Code and Codex. Keep its skills and MCP connections in one place, preview changes in your local clients, then publish the release to your team's marketplace.

From a plugin directory:

```sh
npx pluginsdk build
npx pluginsdk preview
npx pluginsdk publish
```

`build` reads `definition.json`. `preview` installs a separate development copy in available local clients. `publish` sends the captured build to the [destination configured in that definition](docs/publishing.md).

A platform team can maintain one plugin for its service catalog and deployment tools. Developers get the same incident and release workflows in either client. The existing applications keep their MCP servers and access policies.

## Try it

Clone the release notes example from the [examples repository](https://github.com/lucasacoutinho/pluginsdk-examples), with Node 24+ on Linux:

```sh
git clone --branch release-notes git@github.com:lucasacoutinho/pluginsdk-examples.git release-notes
cd release-notes
npm ci
npx pluginsdk build
npx pluginsdk preview
```

`npm ci` installs and builds PluginSDK from this repository. The commands build and preview the [release notes plugin](https://github.com/lucasacoutinho/pluginsdk-examples/tree/release-notes) in both supported clients. The captured production packages are:

```text
.pluginsdk/build/claude_code.bundle.json
.pluginsdk/build/codex.bundle.json
```

The plugin drafts release notes from the repository's Git history. You maintain its definition, skill and output template. PluginSDK generates the native packages.

Follow [Get started](docs/getting-started.md) to use it in both clients and update the shared template.

On Windows x64, preview in Claude Code, Codex or Cursor from the plugin directory:

```sh
npx pluginsdk preview --target claude_code
npx pluginsdk preview --target codex
npx pluginsdk preview --target cursor
```

Claude Code and Codex support user and project installations, including bundled MCP, hooks and agents. Cursor supports user installations of skills, assets and MCP connections. Bundled commands require Node 24.18+. See [Supported clients](docs/compatibility.md) for feature limits.

## Connect your internal applications

The [platform tools example](https://github.com/lucasacoutinho/pluginsdk-examples/tree/platform-tools) connects two existing MCP services and adds shared workflows:

```json
{
	"id": "platform-tools",
	"version": "1.0.0",
	"description": "Investigate incidents and review release readiness.",
	"skills": ["skills/triage-incident", "skills/release-readiness"],
	"mcp": {
		"services": { "url": "https://services.acme.internal/mcp", "headers": {} },
		"deployments": { "url": "https://deployments.acme.internal/mcp", "headers": {} }
	}
}
```

Clone the example, replace the URLs in its `definition.json` with your organization's endpoints, then build both client packages:

```sh
git clone --branch platform-tools git@github.com:lucasacoutinho/pluginsdk-examples.git platform-tools
cd platform-tools
npm ci
npx pluginsdk build
npx pluginsdk preview
```

The example also includes a Git `publish` destination. Replace its repository URL with your team's marketplace, then run `npx pluginsdk publish`. Update a workflow or endpoint once, increment the version, and build and publish again. Your services enforce each user's tool permissions.

## Documentation

- [Get started](docs/getting-started.md): build and use your first plugin.
- [Define a plugin](docs/authoring.md): skills, MCP servers, hooks and agents.
- [Publish a plugin](docs/publishing.md): configure the destination and release both packages.
- [Install, update and remove](docs/usage.md): manage client installations.
- [Manage plugins for a team](docs/teams.md): maintain integrations across applications.
- [Supported clients](docs/compatibility.md): platforms, scopes and feature limits.
- [Examples](https://github.com/lucasacoutinho/pluginsdk-examples): release notes, internal operations, an open-source tool plugin, and public and private marketplaces.

PluginSDK is a private MIT-licensed alpha. These commands work from this checkout or an environment where the CLI is installed. Public npm distribution remains deferred. Installation support follows the [documented client contracts and platforms](docs/compatibility.md). ChatGPT, Grok Bot and Muse adapters are not available.

Contributors can find architecture, Effect conventions, Lean specifications and validation records in [docs/internals](docs/internals/README.md).
