import { Effect, Match, Option, Schema, Stream, Struct } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { RuntimePlatform } from "../../../contracts/Compatibility.ts"
import { DestinationUnsupported, type Destination } from "../../../contracts/Installer.ts"
import { NodeObservation, type Check, type Kind } from "../../../contracts/LauncherRuntime.ts"
import type { PackagedProcess } from "../../compiler/process/portable-native.ts"
import { acceptsNodeRuntime, launcherRuntimeChecks } from "./launcher-policy.ts"

const NodeReply = Schema.fromJsonString(Schema.Struct(Struct.omit(NodeObservation.fields, ["platform"])))
const nodeProbe = 'const [major, minor] = process.versions.node.split(".").map(Number); process.stdout.write(JSON.stringify({ major, minor, execve: typeof process.execve === "function" }));'
const envProbeValue = "space 'quote' \\backslash\nsecond line"

function runtimeProbe(check: Check, platform: RuntimePlatform) {
  return Match.value(check).pipe(
    Match.when("node", () => ({
      binary: "node", args: ["--eval", nodeProbe], extendEnv: true, env: {},
      matches: (stdout: string) => Option.match(Schema.decodeOption(NodeReply, { onExcessProperty: "error" })(stdout), {
        onNone: () => false,
        onSome: (observation) => acceptsNodeRuntime({ platform, ...observation })
      }),
      detail: "Portable process launchers require Node 24.18 or later on PATH, with process.execve on Linux"
    })),
    Match.when("shell", () => ({
      binary: "/bin/sh", args: ["-c", "exit 0"], extendEnv: false, env: {},
      matches: (_stdout: string) => true,
      detail: "Process launchers require /bin/sh"
    })),
    Match.when("env", () => ({
      binary: "/usr/bin/env",
      args: [
        "-u", "PSDK_ENV_SOURCE", "-S", "PSDK_ENV_TARGET=${PSDK_ENV_SOURCE}",
        "/bin/sh", "-c",
        'test "$PSDK_ENV_TARGET" = "$1" && test "${PSDK_ENV_SOURCE+x}" = "" && printf "%s" psdk-env-ready',
        "psdk-env-probe", envProbeValue
      ],
      extendEnv: false,
      env: { PSDK_ENV_SOURCE: envProbeValue },
      matches: (stdout: string) => stdout === "psdk-env-ready",
      detail: "Process launchers require /usr/bin/env with -u and -S environment expansion"
    })),
    Match.exhaustive
  )
}

export const checkLauncherRuntime = Effect.fn("Installer.checkLauncherRuntime")(function*(destination: Destination, processes: ReadonlyArray<PackagedProcess>) {
  const kind: Kind = processes.length === 0 ? { type: "absent" } : { type: "portable" }
  const platform = RuntimePlatform.make(process.platform)
  const checks = launcherRuntimeChecks({ platform, kind })
  if (checks === null) return yield* new DestinationUnsupported({ destination, detail: `Bundled process launchers do not support ${platform}` })
  if (checks.length === 0) return
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  for (const check of checks) {
    const probe = runtimeProbe(check, platform)
    const unsupported = () => new DestinationUnsupported({ destination, detail: probe.detail })
    const result = yield* Effect.scoped(Effect.gen(function*() {
      const handle = yield* spawner.spawn(ChildProcess.make(probe.binary, probe.args, {
        env: { LC_ALL: "C", ...probe.env }, extendEnv: probe.extendEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe",
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
