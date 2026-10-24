import { Effect, Match, Option, Schema, Stream, Struct } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import type { Format } from "../../../contracts/Compiler.ts"
import { RuntimePlatform } from "../../../contracts/Compatibility.ts"
import { DestinationUnsupported, type Destination } from "../../../contracts/Installer.ts"
import { NodeObservation, type Check, type Kind } from "../../../contracts/LauncherRuntime.ts"
import { nativeLocations } from "../../compiler/package/native.ts"
import { acceptsNodeRuntime, launcherRuntimeChecks } from "./launcher-policy.ts"

const NodeReply = Schema.fromJsonString(Schema.Struct(Struct.omit(NodeObservation.fields, ["platform"])))
const nodeProbe = 'const [major, minor] = process.versions.node.split(".").map(Number); process.stdout.write(JSON.stringify({ major, minor, execve: typeof process.execve === "function" }));'

function runtimeProbe(check: Check, platform: RuntimePlatform) {
  const version = (binary: string, firstLine: string) => ({
    binary, args: ["--version"], extendEnv: false,
    matches: (stdout: string) => stdout.split("\n")[0] === firstLine,
    detail: `Process launchers require ${binary}: ${firstLine}`
  })
  return Match.value(check).pipe(
    Match.when("node", () => ({
      binary: "node", args: ["--eval", nodeProbe], extendEnv: true,
      matches: (stdout: string) => Option.match(Schema.decodeOption(NodeReply, { onExcessProperty: "error" })(stdout), {
        onNone: () => false,
        onSome: (observation) => acceptsNodeRuntime({ platform, ...observation })
      }),
      detail: "Portable process launchers require Node 24.18 or later on PATH, with process.execve on Linux"
    })),
    Match.when("shell", () => ({
      binary: "/bin/sh", args: ["-c", "exit 0"], extendEnv: false,
      matches: (_stdout: string) => true,
      detail: "Process launchers require /bin/sh"
    })),
    Match.when("env", () => version("/usr/bin/env", "env (GNU coreutils) 9.4")),
    Match.when("pwd", () => version("/bin/pwd", "pwd (GNU coreutils) 9.4")),
    Match.exhaustive
  )
}

export const checkLauncherRuntime = Effect.fn("Installer.checkLauncherRuntime")(function*(destination: Destination, format: Format) {
  const locations = nativeLocations(format)
  const kind = Match.value(locations.processes).pipe(
    Match.when(false, (): Kind => ({ type: "absent" })),
    Match.when("posix", (): Kind => ({ type: "posix", cwdRoot: locations.base === "codex_plugin_v1" })),
    Match.whenOr("portable", "portable_features", (): Kind => ({ type: "portable" })),
    Match.exhaustive
  )
  const platform = RuntimePlatform.make(process.platform)
  const checks = launcherRuntimeChecks({ platform, kind })
  if (checks === null) return yield* new DestinationUnsupported({ destination, detail: `No launcher runtime is qualified for ${format} on ${platform}` })
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  for (const check of checks) {
    const probe = runtimeProbe(check, platform)
    const unsupported = () => new DestinationUnsupported({ destination, detail: probe.detail })
    const result = yield* Effect.scoped(Effect.gen(function*() {
      const handle = yield* spawner.spawn(ChildProcess.make(probe.binary, probe.args, {
        env: { LC_ALL: "C" }, extendEnv: probe.extendEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe",
        detached: true, forceKillAfter: "1 second"
      }))
      const [stdout, , code] = yield* Effect.all([
        handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
        handle.stderr.pipe(Stream.runDrain),
        handle.exitCode
      ], { concurrency: "unbounded" })
      return Number(code) === 0 && probe.matches(stdout)
    })).pipe(
      Effect.timeoutOption("5 seconds"),
      Effect.catchTag("PlatformError", () => unsupported())
    )
    if (Option.isNone(result) || !result.value) return yield* unsupported()
  }
})
