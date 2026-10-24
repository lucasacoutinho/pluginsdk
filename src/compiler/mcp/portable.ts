import { Match } from "effect"
import { LauncherPath, type Native } from "../../../contracts/Launcher.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import type { FilePlan, Input, Issue, Result } from "../../../contracts/PortableMcp.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { remoteServer } from "../package/model.ts"
import { compilePortableLauncher, runtimePath } from "../process/portable.ts"

type Document = NonNullable<Extract<Result, { type: "rendered" }>["document"]>

function nativeServer(format: Input["format"], native: Native): Document {
  const common = {
    command: native.command,
    args: native.args,
    env: native.env,
    ...(native.cwd === null ? {} : { cwd: native.cwd })
  }
  return Match.value(format).pipe(
    Match.when("codex", () => common),
    Match.when("claude_code", () => ({ type: "stdio", ...common })),
    Match.exhaustive
  )
}

export function renderPortableMcp(input: Input): Result {
  const host = input.format
  const servers: Array<readonly [string, Document]> = Object.entries(input.remote).map(
    ([name, source]) => [name, remoteServer(input.format, source)]
  )
  const locals = Object.entries(input.local).sort(([left], [right]) => compareUtf8(left, right))
  const files: FilePlan[] = locals.length === 0 ? [] : [{ type: "runtime", path: PackagePath.make(runtimePath) }]
  const issues: Issue[] = []
  for (const [ordinal, [server, plan]] of locals.entries()) {
    const path = LauncherPath.make(`.psdk/mcp/${ordinal}.json`)
    const posix = LauncherPath.make(`.psdk/mcp/${ordinal}.sh`)
    Match.value(compilePortableLauncher({ host, path, plan })).pipe(
      Match.discriminatorsExhaustive("type")({
        rendered: (program) => {
          servers.push([server, nativeServer(input.format, program.native)])
          files.push(
            { type: "process", path, data: { schema: 1, posix, script: program.script } },
            { type: "posix", path: posix, content: program.posix }
          )
        },
        rejected: (result) => {
          issues.push(...result.issues.map((reason) => ({ server, reason })))
        }
      })
    )
  }
  const [head, ...tail] = issues
  if (head !== undefined) return { type: "rejected", issues: [head, ...tail] }
  const content: Document = { mcpServers: Object.fromEntries(servers) }
  return { type: "rendered", document: servers.length === 0 ? null : content, files }
}
