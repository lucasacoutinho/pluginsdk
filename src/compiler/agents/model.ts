import { Match } from "effect"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { RoleName } from "../../../contracts/Agents.ts"
import type { AgentEntry, AgentIssue, AgentsInput, AgentsResult } from "../../../contracts/Agents.ts"
import { compareUtf8 } from "../../internal/paths.ts"

export function renderAgents(input: AgentsInput): AgentsResult {
  const counts = new Map<AgentsInput["agents"][number]["name"], number>()
  for (const agent of input.agents) {
    counts.set(agent.name, (counts.get(agent.name) ?? 0) + 1)
  }

  const issues = [...counts]
    .filter(([, count]) => count > 1)
    .map(([name]): AgentIssue => ({ type: "duplicate_agent", name }))
    .sort((left, right) => compareUtf8(left.name, right.name))
  const [firstIssue, ...remainingIssues] = issues
  if (firstIssue !== undefined) {
    return { type: "rejected", issues: [firstIssue, ...remainingIssues] }
  }

  const entries = input.agents
    .toSorted((left, right) => compareUtf8(left.name, right.name))
    .map((agent): AgentEntry => {
      const qualified = RoleName.make(`${input.plugin}:${agent.name}`)
      return Match.value(input.host).pipe(
        Match.when("claude_code", () => {
          const shellProperties = Match.value(agent.shell).pipe(
            Match.when("host_default", () => ({})),
            Match.when("deny", () => ({ disallowedTools: ["Bash"] })),
            Match.exhaustive
          )
          return {
            name: agent.name,
            qualified,
            path: PackagePath.make(`agents/${agent.name}.md`),
            document: {
              name: agent.name,
              description: agent.description,
              ...(agent.model === null ? {} : { model: agent.model }),
              ...shellProperties
            },
            prompt: agent.prompt
          }
        }),
        Match.when("codex", () => {
          const shellProperties = Match.value(agent.shell).pipe(
            Match.when("host_default", () => ({})),
            Match.when("deny", () => ({ features: { shell_tool: false } })),
            Match.exhaustive
          )
          return {
            name: agent.name,
            qualified,
            path: PackagePath.make(`agents/${agent.name}.toml`),
            document: {
              name: qualified,
              description: agent.description,
              developer_instructions: agent.prompt,
              ...(agent.model === null ? {} : { model: agent.model }),
              ...shellProperties
            },
            prompt: null
          }
        }),
        Match.exhaustive
      )
    })

  return { type: "rendered", entries }
}
