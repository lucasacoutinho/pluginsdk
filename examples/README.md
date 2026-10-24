# Plugin examples

These are plugin source directories. Each has one JSON definition and the workflows or reference files you want to share. Build either directory for Claude Code and Codex with the same CLI.

## Release notes from your repository

Use [release-notes](release-notes/) to draft a release from Git history. It identifies the commit range, reads the changes, separates user-visible behavior from refactors, and produces notes with commit and file evidence.

The plugin has three authored files:

```text
release-notes/
  definition.json
  skills/release-notes/
    SKILL.md
    references/template.md
```

Build from the repository root after `npm ci` and `npm run build`:

```sh
cd examples/release-notes
npx pluginsdk build
npx pluginsdk preview
```

Follow [Get started](../docs/getting-started.md) to use the preview. In either client, ask:

> Use the release-notes skill to draft the next release from v1.4.0 to HEAD. Include breaking changes and upgrade steps, with evidence for each note.

Use a tag that exists in your repository. No external service is needed. Change the shared template once to update both clients' release format.

## Operations across internal applications

Use [platform-tools](platform-tools/) when a central plugin team maintains workflows for existing internal services. The example connects a service catalog and a deployment application through their MCP endpoints.

The plugin contains two workflows and their report templates:

- `triage-incident` builds an incident timeline using service ownership, runbooks and deployment records.
- `release-readiness` checks a candidate release against the service's rollout prerequisites and rollback criteria.

Replace the two `.acme.internal` URLs in [definition.json](platform-tools/definition.json) with your existing endpoints. Configure service authentication in each client through your organization's supported route. The example does not include a server or a sign-in implementation.

```sh
cd examples/platform-tools
npx pluginsdk build
npx pluginsdk preview
```

Replace the example's Git `publish.repository` with your team's marketplace and run `npx pluginsdk publish` to release the captured packages. See [Publish a plugin](../docs/publishing.md) for client installation. In either client, ask:

> Triage the checkout incident between 14:00 and 14:30 UTC. Error rates rose after the latest deployment. Find the service owner and runbook, compare recent deployments, and give me an evidence-backed timeline and next checks.

Or:

> Check whether checkout version 2.8.0 is ready for a production rollout at 16:00 UTC. Report missing prerequisites and the applicable rollback criteria. Do not deploy anything.

The services determine which tools each user can call. The skills report missing access or records instead of inventing results.

## What PluginSDK handles

| You maintain | PluginSDK handles |
| --- | --- |
| Shared workflow Markdown and templates | Capturing the same content in both packages |
| One plugin definition and MCP endpoint declarations | Native Claude Code and Codex manifests |
| The intended plugin version and publish destination | Captured releases and native marketplace entries |
| Local source edits | Development previews, owned updates and removal |

If the incident report needs a new field, edit its template once and run `preview` to update both clients. For a team release, increment the version, then build and publish. The application teams keep their existing MCP servers. See [Manage plugins for a team](../docs/teams.md) for release management and RBAC responsibilities.

Protocol and recovery fixtures used by PluginSDK's tests live in `test/fixtures/plugins/`.
