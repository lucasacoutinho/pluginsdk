import { dirname } from "node:path"
import { Effect, Match, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { HostUnavailable, type Destination, type Host } from "../../contracts/Installer.ts"

export type SupportedHost = Extract<Host, "claude_code" | "codex">

export const profiles = {
  claude_code: { binary: "claude", version: "2.1.304", revision: "claude-local-marketplace:1", format: "claude_code_v1" },
  codex: { binary: "codex", version: "0.163.0", revision: "codex-local-marketplace:1", format: "agent_plugins_v1" }
}

export const supportedHost = (host: Host): SupportedHost | null => Match.value(host).pipe(
  Match.when("claude_code", (value) => value),
  Match.when("codex", (value) => value),
  Match.when("grok_bot", () => null),
  Match.when("muse", () => null),
  Match.exhaustive
)

export const runHost = Effect.fnUntraced(function*(destination: Destination, args: ReadonlyArray<string>, inExecution = false) {
  const host = supportedHost(destination.host)
  if (host === null) return yield* new HostUnavailable({ host: destination.host, cause: new Error("Unsupported native host") })
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(ChildProcess.make(profiles[host].binary, args, {
      cwd: destination.type === "project" ? destination.root : destination.home,
      env: {
        HOME: dirname(destination.home),
        CLAUDE_CONFIG_DIR: destination.home,
        CODEX_HOME: destination.home,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
      },
      extendEnv: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: !inExecution,
      forceKillAfter: "1 second"
    }))
    const [stdout, , code] = yield* Effect.all([
      handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      handle.stderr.pipe(Stream.runDrain),
      handle.exitCode
    ], { concurrency: "unbounded" })
    if (Number(code) !== 0) return yield* new HostUnavailable({ host, cause: new Error(`${profiles[host].binary} exited with code ${code}`) })
    return stdout
  })).pipe(Effect.catchTag("PlatformError", (cause) => new HostUnavailable({ host, cause })))
})
