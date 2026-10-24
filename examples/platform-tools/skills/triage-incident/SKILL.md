---
name: triage-incident
description: Use when investigating an incident that needs a timeline, service owner, and deployment context.
---

# Triage a service incident

Use the service, incident window with timezone, observed impact, and request or alert identifier already provided in the request or available context. Ask only for details that are still missing and necessary to investigate. Do not ask the user to paste credentials or secret values.

Use the available read-only tools exposed by the configured `services` and `deployments` MCP servers. Read each tool's description before calling it. Find the service owner, current runbook, relevant health or alert records, and deployments that overlap the incident window. Check the last known healthy deployment when the records provide it.

Build a timeline in UTC. Cite each event with the source record or deployment identifier and its recorded time. Mark missing timestamps and gaps in the source data.

For each hypothesis, list the evidence that supports it, evidence that conflicts with it, and a confidence level tied to those facts. Keep observed facts separate from interpretation. Do not attribute an incident to a deployment based on timing alone.

Use the [incident report template](references/incident-report.md). State when ownership, runbooks, deployment history, or tool access is unavailable. Do not guess missing records or claim that a check succeeded when a server did not return evidence.

Do not page, create or update an incident, restart a service, change configuration, deploy, or roll back. If a mutating tool is needed, name the exact operation, service, and expected effect, then ask for explicit confirmation before calling it.
