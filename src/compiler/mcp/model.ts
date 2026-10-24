import { Match } from "effect"
import { LauncherPath, type LauncherInput, type LauncherOutput, type Native } from "../../../contracts/Launcher.ts"
import type { GeneratedFile, McpInput, McpResult } from "../../../contracts/Mcp.ts"
import { ProcessText } from "../../../contracts/Plugin.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { remoteServer } from "../package/model.ts"
import { compileLauncher, renderLauncher, serializeCwdLauncher } from "../process/posix.ts"

type Document = NonNullable<Extract<McpResult, { type: "rendered" }>["document"]>

export function hostFor(format: McpInput["format"]): LauncherInput["host"] {
  return Match.value(format).pipe(
    Match.when("claude_code_v1", (): LauncherInput["host"] => "claude_code"),
    Match.whenOr("agent_plugins_v1", "codex_plugin_v1", (): LauncherInput["host"] => "codex"),
    Match.exhaustive
  )
}

export function renderMcp(input: McpInput): McpResult {
  const host = hostFor(input.format)
  const servers: Array<readonly [string, Document]> = Object.entries(input.remote).map(
    ([name, source]) => [name, remoteServer(input.format, source)]
  )
  const files: GeneratedFile[] = []
  const issues: Array<Extract<McpResult, { type: "rejected" }>["issues"][number]> = []
  const locals = Object.entries(input.local).sort(([left], [right]) => compareUtf8(left, right))
  for (const [ordinal, [server, plan]] of locals.entries()) {
    const path = LauncherPath.make(`.psdk/mcp/${ordinal}.sh`)
    const launcher: LauncherOutput = Match.value(input.format).pipe(
      Match.when("codex_plugin_v1", () => {
        const script = compileLauncher(plan)
        const native: Native | null = script.captures.length === 0 ? {
          command: ProcessText.make("/bin/sh"),
          args: [ProcessText.make(path)],
          env: {},
          cwd: ProcessText.make(".")
        } : null
        return { script: ProcessText.make(serializeCwdLauncher(script)), native }
      }),
      Match.whenOr("agent_plugins_v1", "claude_code_v1", () => renderLauncher({ host, path, plan })),
      Match.exhaustive
    )
    if (launcher.native === null) {
      issues.push({ type: "unsupported_launcher", server })
    } else {
      const native = launcher.native
      const record: Document = Match.value(input.format).pipe(
        Match.when("codex_plugin_v1", () => ({
          command: native.command,
          args: native.args,
          env: native.env,
          cwd: ProcessText.make(".")
        })),
        Match.whenOr("agent_plugins_v1", "claude_code_v1", () => ({
          type: "stdio", command: native.command, args: native.args, env: native.env,
          ...(native.cwd === null ? {} : { cwd: native.cwd })
        })),
        Match.exhaustive
      )
      servers.push([server, record])
      files.push({ path, content: launcher.script, executable: true })
    }
  }
  const [first, ...rest] = issues
  if (first !== undefined) return { type: "rejected", issues: [first, ...rest] }
  const content: Document = { mcpServers: Object.fromEntries(servers) }
  const document = Match.value(input.format).pipe(
    Match.when("agent_plugins_v1", (): Document => ({ ...content, $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json" })),
    Match.when("claude_code_v1", () => content),
    Match.when("codex_plugin_v1", () => content),
    Match.exhaustive
  )
  return {
    type: "rendered",
    document: servers.length === 0 ? null : document,
    files
  }
}
