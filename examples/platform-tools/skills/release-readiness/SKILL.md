---
name: release-readiness
description: Use before deciding whether a service release is ready for production rollout.
---

# Assess production release readiness

Use the service, candidate version or deployment identifier, target environment, and planned rollout window already provided in the request or available context. Ask only for details that are still missing and necessary to assess readiness.

Use the available read-only tools exposed by the configured `services` and `deployments` MCP servers. Read each tool's description before calling it. Check the current service owner and runbook, the candidate deployment, recent deployments for the same service and environment, and any available rollout and rollback records.

Compare the release with the runbook's prerequisites. For each prerequisite, record the source, observation time, and whether the evidence passes, fails, or is missing. Check that rollback criteria and the rollback path apply to this service, version, and environment. Do not treat a generic runbook or stale status as current evidence.

Return `GO` only when the owner, candidate, rollout prerequisites, current service state, and applicable rollback criteria have evidence. Return `HOLD` when a required fact is missing, failed, stale, or contradictory. Explain each decision with source record identifiers and timestamps.

Use the [readiness report template](references/readiness-report.md). `GO` is an assessment only. It does not authorize or perform a deployment.

Do not start, pause, promote, or roll back a deployment, change configuration, or alter service state. If a mutating tool is needed for a follow-up, name the exact operation, service, version, environment, and expected effect. Ask for explicit confirmation before calling that tool.
