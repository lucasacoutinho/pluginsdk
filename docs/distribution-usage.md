# Distribute a release

Review one approved plugin release for several local client configurations, then track each installation from the same saved plan.

First [retain the platform tools release](catalog-usage.md). Use Linux with the [supported client versions](compatibility.md). Configuration homes must be available on the machine where you run these commands.

## Name the destinations

Save `.pluginsdk/destinations.json`:

```json
{
	"desired": "present",
	"targets": [
		{
			"type": "local",
			"id": "claude-dev",
			"destination": {
				"type": "user",
				"host": "claude_code",
				"home": "/home/alex/.claude"
			}
		},
		{
			"type": "local",
			"id": "codex-dev",
			"destination": {
				"type": "user",
				"host": "codex",
				"home": "/home/alex/.codex"
			}
		}
	]
}
```

Replace the homes with your existing absolute paths. JSON does not expand `$HOME`. Labels must be unique, and two labels cannot refer to the same physical installation.

For a supported Claude project installation, use `"type": "project"` and add the absolute project `"root"`. Codex project scope is unavailable.

## Review the release

```sh
node dist/src/cli.js distribution plan .pluginsdk/releases/platform-tools-1.0.0.release.json \
	--request .pluginsdk/destinations.json --catalog .pluginsdk/catalog \
	--out .pluginsdk/distribution.plan.json
```

The summary lists each destination and operation. Review the saved file's destination paths, versions and proposed changes. The file contains the complete packages, so applying it does not require a later download.

A `blocked` result explains the affected destinations and exits with status 1. No destination is silently omitted. Planning changes no native installation.

## Apply the review

```sh
node dist/src/cli.js distribution apply .pluginsdk/distribution.plan.json \
	--state .pluginsdk/distribution-state
```

Keep the state directory for subsequent invocations. `complete` means every destination satisfies the requested presence. `partial` includes each destination's result and exits with status 1.

Applying the same review again skips completed destinations and resumes incomplete work. Completed outcomes describe that operation; create a fresh review to inspect current installations.

## Update or remove

For an update, retain a new release ID and plan it against the same destinations.

For removal, change the request's `desired` value to `absent`, save a new distribution plan and apply it with the same state directory. Removal uses the release's plugin identity and does not revoke backend access.

A `blocked` or `not_applied` destination needs a fresh review. For an interrupted native operation, follow [installation recovery](usage.md#resume-an-interrupted-change).

Fleet rollout still uses your deployment tooling. This CLI does not remotely administer developer machines or ChatGPT workspaces.
