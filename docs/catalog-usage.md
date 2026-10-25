# Manage approved releases

Retain the exact Claude Code and Codex packages under one release ID. Use the catalog when a plugin team approves a version before distributing it.

This guide uses the [platform tools example](https://github.com/lucasacoutinho/pluginsdk-examples/tree/platform-tools). Run the commands from a checkout of that branch after `npm ci`. Its MCP addresses are placeholders for your existing services. Building and retaining its packages does not contact those services.

## Package a release

Build both packages and prepare a release directory:

```sh
npx pluginsdk build definition.json \
	--out .pluginsdk/platform-tools/build
mkdir -p .pluginsdk/releases
```

Package them under your organization and integration name:

```sh
npx pluginsdk catalog pack \
	.pluginsdk/platform-tools/build/claude_code.bundle.json \
	.pluginsdk/platform-tools/build/codex.bundle.json \
	--organization acme --integration platform-tools --release 1.0.0 \
	--location https://artifacts.acme.internal/plugins/platform-tools/1.0.0.json \
	--out .pluginsdk/releases/platform-tools-1.0.0.artifact.json \
	--json > .pluginsdk/releases/platform-tools-1.0.0.release.json
```

The artifact contains both complete packages. The release file records their identities and the artifact's SHA-256. Review that release file through your team's approval process. The `--location` value records where your infrastructure will serve the artifact; `pack` does not upload it.

## Retain local packages

Initialize a catalog under an existing physical parent directory:

```sh
npx pluginsdk catalog init --directory .pluginsdk/catalog
```

Admit the approved release with its local packages:

```sh
npx pluginsdk catalog admit .pluginsdk/releases/platform-tools-1.0.0.release.json \
	--bundle .pluginsdk/platform-tools/build/claude_code.bundle.json \
	--bundle .pluginsdk/platform-tools/build/codex.bundle.json \
	--directory .pluginsdk/catalog
```

`admitted` means the release was retained. Repeating the same admission returns `unchanged`. Different content under the same organization, integration and release ID returns `conflict`; choose a new release ID for an update.

## Retrieve one client package

```sh
npx pluginsdk catalog acquire acme platform-tools 1.0.0 \
	--format codex --directory .pluginsdk/catalog \
	--out .pluginsdk/approved-codex.bundle.json
```

Use `claude_code` for this example's Claude package, including Cursor destinations. The retrieved bundle contains the approved bytes and can enter the [installation review](usage.md). Acquisition uses retained content, so it does not need the source repository or artifact server.

To manage both clients together, continue with [Distribute a release](distribution-usage.md).

## Import through your artifact infrastructure

Publish the exact artifact file at the recorded URL using your existing infrastructure. Give the approved release file to another machine, then import it:

```sh
npx pluginsdk catalog import .pluginsdk/releases/platform-tools-1.0.0.release.json \
	--directory .pluginsdk/catalog
```

Import verifies the artifact's SHA-256 and all declared packages before retaining the release. Approve the release metadata through a trusted route. A digest does not identify its publisher. The current importer uses no ambient credentials and accepts HTTPS or loopback HTTP.

The catalog also retains [reviewed MCP tool contracts](internals/mcp-contract-design.md). Those records describe an approved toolset; they do not deploy a server or grant tool access.
