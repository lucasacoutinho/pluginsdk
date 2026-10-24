import { Match } from "effect"
import type { Input } from "../../contracts/BuildFormat.ts"
import type { Format } from "../../contracts/Compiler.ts"

export const selectBuildFormat = (input: Input): Format => {
  const hasHooksOrAgents = input.hasAgents || input.hasHooks
  return Match.value(input.client).pipe(
    Match.when("claude_code", () => hasHooksOrAgents
      ? "claude_code_portable_v2"
      : input.hasStdio
      ? "claude_code_portable_v1"
      : "claude_code_v2"),
    Match.when("codex", () => hasHooksOrAgents
      ? "codex_plugin_portable_v2"
      : input.hasStdio
      ? "codex_plugin_portable_v1"
      : "agent_plugins_v2"),
    Match.exhaustive
  )
}
