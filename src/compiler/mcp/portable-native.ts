import { Match, Schema } from "effect"
import { LauncherPath, Native } from "../../../contracts/Launcher.ts"
import type { PackageFile } from "../../../contracts/Compiler.ts"
import { HeaderName, HeaderText, McpName, ProcessText, RemoteMcp } from "../../../contracts/Plugin.ts"
import type { ProcessInput } from "../../../contracts/Process.ts"
import { asciiFold, compareUtf8 } from "../../internal/paths.ts"
import { validatePortableProcess, type PackagedProcess } from "../process/portable-native.ts"

const Stdio = Schema.Struct({ ...Native.fields, cwd: Schema.optionalKey(ProcessText) })
const Headers = Schema.Record(HeaderName, HeaderText)
const ClaudeDocument = Schema.Struct({ mcpServers: Schema.Record(McpName, Schema.Union([
  Schema.Struct({ type: Schema.Literal("stdio"), ...Stdio.fields }),
  Schema.Struct({ type: Schema.Literal("http"), url: RemoteMcp.fields.url, headers: Headers })
])) })
const CodexDocument = Schema.Struct({ mcpServers: Schema.Record(McpName, Schema.Union([
  Stdio,
  Schema.Struct({ url: RemoteMcp.fields.url, http_headers: Headers })
])) })

type Server =
  | { readonly type: "local"; readonly native: Native }
  | { readonly type: "remote"; readonly headers: typeof Headers.Type }

function local(server: typeof Stdio.Type): Server {
  return { type: "local", native: { command: server.command, args: server.args, env: server.env, cwd: server.cwd ?? null } }
}

function readServers(host: ProcessInput["host"], value: unknown): ReadonlyArray<readonly [string, Server]> {
  return Match.value(host).pipe(
    Match.when("claude_code", () => Object.entries(Schema.decodeUnknownSync(ClaudeDocument)(value, { onExcessProperty: "error" }).mcpServers)
      .map(([name, server]): readonly [string, Server] => [name, Match.value(server).pipe(Match.discriminatorsExhaustive("type")({
        stdio: local,
        http: ({ headers }): Server => ({ type: "remote", headers })
      }))])),
    Match.when("codex", () => Object.entries(Schema.decodeUnknownSync(CodexDocument)(value, { onExcessProperty: "error" }).mcpServers)
      .map(([name, server]): readonly [string, Server] => [name, Match.value(server).pipe(
        Match.when({ command: Match.defined }, local),
        Match.when({ url: Match.defined }, ({ http_headers }): Server => ({ type: "remote", headers: http_headers })),
        Match.exhaustive
      )])),
    Match.exhaustive
  )
}

const sameNative = Schema.toEquivalence(Native)

export function validatePortableMcp(
  host: ProcessInput["host"],
  value: unknown,
  files: ReadonlyMap<string, PackageFile>
): { readonly paths: ReadonlySet<string>; readonly processes: ReadonlyArray<PackagedProcess> } {
  const paths = new Set<string>()
  const processes: PackagedProcess[] = []
  let ordinal = 0
  for (const [, server] of readServers(host, value).toSorted(([left], [right]) => compareUtf8(left, right))) {
    Match.value(server).pipe(Match.discriminatorsExhaustive("type")({
      remote: ({ headers }) => {
        const names = Object.keys(headers).map(asciiFold)
        if (new Set(names).size !== names.length) throw new Error("MCP headers collide under ASCII case folding")
      },
      local: ({ native }) => {
        const path = LauncherPath.make(`.psdk/mcp/${ordinal}.json`)
        const posix = `.psdk/mcp/${ordinal}.sh`
        const checked = validatePortableProcess(host, path, LauncherPath.make(posix), files)
        if (!sameNative(native, checked.program.native)) throw new Error("Portable stdio differs from its canonical native declaration")
        processes.push({ path, script: checked.program.script })
        for (const processPath of checked.paths) paths.add(processPath)
        ordinal++
      }
    }))
  }
  return { paths, processes }
}
