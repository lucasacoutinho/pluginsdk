import { win32 } from "node:path"
import { Effect, FileSystem, Option, Schema, Stream } from "effect"
import { RuntimeVersion } from "../../../contracts/Compatibility.ts"
import { HostUnavailable } from "../../../contracts/Installer.ts"
import { Directory } from "../../../contracts/Plugin.ts"
import { ByteCount } from "../../../contracts/WindowsCommand.ts"
import { CommandRequest, WindowsCommands, withWindowsCommands } from "../windows/commands.ts"

const VersionReply = Schema.Tuple([
  Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+$/)),
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
  Schema.Literal("x64")
])

export const inspectCursorVersion = Effect.fn("Installer.inspectCursorVersion")(function*() {
  if (process.platform !== "win32" || process.arch !== "x64") return Option.none<RuntimeVersion>()
  const unavailable = (cause: unknown) => new HostUnavailable({ host: "cursor", cause })
  const fs = yield* FileSystem.FileSystem
  const local = yield* Schema.decodeUnknownEffect(Directory)(process.env.LOCALAPPDATA).pipe(Effect.mapError(unavailable))
  const application = win32.join(local, "Programs", "cursor", "Cursor.exe")
  const cli = win32.join(local, "Programs", "cursor", "resources", "app", "out", "cli.js")
  const executable = yield* fs.stat(application).pipe(
    Effect.asSome,
    Effect.catchTag("PlatformError", (cause) => cause.reason._tag === "NotFound"
      ? Effect.succeedNone
      : Effect.fail(unavailable(cause)))
  )
  if (Option.isNone(executable)) return Option.none<RuntimeVersion>()
  if (executable.value.type !== "File") return yield* unavailable(new Error("Cursor executable is not a regular file"))
  const source = yield* fs.stat(cli).pipe(Effect.mapError(unavailable))
  if (source.type !== "File") return yield* unavailable(new Error("Cursor CLI is not a regular file"))
  const profile = yield* fs.makeTempDirectory({ prefix: "pluginsdk-cursor-" }).pipe(Effect.mapError(unavailable))
  const request = yield* Schema.decodeEffect(CommandRequest, { onExcessProperty: "error" })({
    launch: {
      application,
      args: [cli, "--version", "--user-data-dir", win32.join(profile, "user-data"), "--extensions-dir", win32.join(profile, "extensions")],
      directory: profile,
      environment: {
        ELECTRON_RUN_AS_NODE: "1", HOME: profile, USERPROFILE: profile,
        APPDATA: win32.join(profile, "app-data"), LOCALAPPDATA: win32.join(profile, "local-app-data"),
        CURSOR_DISABLE_UPDATES: "1", CURSOR_DISABLE_TELEMETRY: "1"
      }
    },
    limits: { input: ByteCount.make(1024), output: ByteCount.make(128 * 1024) }
  }).pipe(Effect.mapError(unavailable))
  const reported = yield* withWindowsCommands<string, HostUnavailable, never>("cursor", () => Effect.void, Effect.gen(function*() {
    const commands = yield* WindowsCommands
    return yield* commands.run(request, (channel) => Effect.gen(function*() {
      yield* channel.endInput
      const [stdout, code] = yield* Effect.all([
        channel.output.pipe(Stream.decodeText(), Stream.mkString), channel.exitCode
      ], { concurrency: "unbounded" })
      if (code !== 0) return yield* unavailable(new Error(`Cursor version command exited with code ${code}`))
      return stdout
    }))
  })).pipe(Effect.timeout("10 seconds"), Effect.mapError(unavailable))
  const [version, commit] = yield* Schema.decodeUnknownEffect(VersionReply)(reported.trim().split(/\r?\n/)).pipe(Effect.mapError(unavailable))
  yield* fs.remove(profile, { recursive: true }).pipe(Effect.mapError(unavailable))
  return Option.some(RuntimeVersion.make(`${version}+${commit}`))
})
