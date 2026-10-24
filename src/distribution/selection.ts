import { Match } from "effect"
import type { Selection, SelectionInput } from "../../contracts/DistributionModel.ts"
import { packageClient } from "../installer/target/packages.ts"

export const selectDistributionFormat = (input: SelectionInput): Selection => {
  const host = packageClient(input.host)
  const candidates = input.formats.filter((format) => Match.value(format).pipe(
    Match.whenOr("claude_code_v1", "claude_code_v2", "claude_code_v3", "claude_code_v4", "claude_code_v5", "claude_code_portable_v1", "claude_code_portable_v2", () => "claude_code"),
    Match.whenOr("agent_plugins_v1", "agent_plugins_v2", "agent_plugins_v3", "codex_plugin_v1", "codex_plugin_v2", "codex_plugin_portable_v1", "codex_plugin_portable_v2", () => "codex"),
    Match.exhaustive
  ) === host)
  const [first, second] = candidates
  if (first === undefined) return { type: "blocked", reason: "unavailable" }
  return second === undefined
    ? { type: "selected", format: first }
    : { type: "blocked", reason: "ambiguous" }
}
