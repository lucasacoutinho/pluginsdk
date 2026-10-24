# Manage plugins for a team

A central integration team can maintain workflows and MCP connections for applications owned by different teams. Developers receive a client package for their chosen app, while the application teams keep their existing services and deployments.

## A shared operations plugin

The [platform tools example](https://github.com/lucasacoutinho/pluginsdk-examples/tree/main/platform-tools) brings together a service catalog and a deployment application. Each application already exposes an MCP endpoint.

The plugin team maintains one definition and two workflows:

- `triage-incident` finds service ownership, runbooks and recent deployment changes, then produces an investigation report.
- `release-readiness` reviews rollout prerequisites and rollback criteria before a release.

The definition names the two MCP endpoints. One build produces Claude Code and Codex packages containing the same workflows. Changing an endpoint or runbook instruction requires one source edit and a new release.

| Responsibility | Owner |
| --- | --- |
| Shared skills and endpoint declarations | Plugin team |
| MCP implementation and deployment | Existing application teams |
| User identity and tool authorization | Existing identity and application services |
| Approved package versions and installation reviews | Plugin team through PluginSDK |
| Execution on developer machines | Your existing deployment tooling or the local CLI |

## Keep access control in the services

Alice may read deployment history while Bob may also roll back a deployment. Both can use the same plugin. Their authenticated identities determine which operations the deployment service permits.

The MCP service must enforce permissions when a tool is called. Filtering its tool list can improve discovery, but hiding a tool in a client does not enforce access. A plugin release contains shared instructions and connections; it does not grant a user a role.

PluginSDK currently does not provision an identity provider, authenticate users to third-party services or deploy backend access policies. Use the application's existing authentication route. Check that route in each client before rollout.

## Keep approved releases together

For the plugin team's daily workflow, put the Git marketplace destination in the definition:

```sh
npx pluginsdk preview
npx pluginsdk build && npx pluginsdk publish
```

The [publishing guide](publishing.md) explains the destination fields and native installation commands. The platform tools example includes this configuration; replace its placeholder repository before publishing. Both client packages are released together through your existing Git infrastructure.

The [release catalog](catalog-usage.md) retains the exact Claude Code and Codex packages under one organization, integration and release ID. A release review can therefore refer to one version while retaining each client's package bytes.

[Distribution](distribution-usage.md) reviews that release against named local destinations and tracks each installation separately. A retry skips completed destinations and resumes incomplete work.

The current CLI manages configuration homes available on the machine where it runs, including Cursor user installations on Windows x64. Fleet rollout still uses your deployment infrastructure. ChatGPT workspace administration, Grok Bot and Muse need client adapters before PluginSDK can manage them.
