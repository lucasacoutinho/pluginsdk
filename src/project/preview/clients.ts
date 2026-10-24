import { Effect, FileSystem, Match, Option, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { homedir } from "node:os"
import { join } from "node:path"
import type { PackageClient } from "../../../contracts/Clients.ts"
import { RuntimePlatform, type NativeProfile } from "../../../contracts/Compatibility.ts"
import { Directory } from "../../../contracts/Plugin.ts"
import { ProjectError, type LocalClient } from "../../../contracts/Project.ts"
import type { Format } from "../../../contracts/Compiler.ts"
import { inspectCursorVersion } from "../../installer/hosts/cursor.ts"
import { selectNativeProfile } from "../../installer/target/compatibility.ts"
import { nativeProfiles } from "../../installer/target/profiles.ts"

export const localHome = (client: LocalClient): string => Match.value(client).pipe(
  Match.when("claude_code", () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")),
  Match.when("codex", () => process.env.CODEX_HOME ?? join(homedir(), ".codex")),
  Match.when("cursor", () => join(homedir(), ".cursor")), Match.exhaustive
)

const pathClientVersion = Effect.fn("Project.pathClientVersion")(function*(client: PackageClient) {
  const binary = Match.value(client).pipe(Match.when("claude_code", () => "claude"), Match.when("codex", () => "codex"), Match.exhaustive)
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(ChildProcess.make(binary, ["--version"], {
      stdin: "ignore", stdout: "pipe", stderr: "pipe", detached: true, forceKillAfter: "1 second",
      env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }, extendEnv: true
    }))
    const [stdout, , code] = yield* Effect.all([
      handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.stderr.pipe(Stream.runDrain), handle.exitCode
    ], { concurrency: "unbounded" })
    if (Number(code) !== 0) return yield* new ProjectError({ detail: `Cannot inspect the installed ${binary} client` })
    const version = Match.value(client).pipe(
      Match.when("claude_code", () => /^(.+) \(Claude Code\)$/.exec(stdout.trim())?.[1]),
      Match.when("codex", () => /^codex-cli (.+)$/.exec(stdout.trim())?.[1]), Match.exhaustive
    )
    if (version === undefined) return yield* new ProjectError({ detail: `${binary} returned an unsupported version response` })
    return version
  })).pipe(
    Effect.catchTag("PlatformError", (error) => error.reason._tag === "NotFound"
      ? Effect.succeed(null)
      : Effect.fail(new ProjectError({ detail: `Cannot start ${binary}; check executable permissions and PATH` }))),
    Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(new ProjectError({ detail: `${binary} version inspection timed out` })) })
  )
})

const clientVersion = (client: LocalClient) => Match.value(client).pipe(
  Match.when("claude_code", () => pathClientVersion("claude_code")),
  Match.when("codex", () => pathClientVersion("codex")),
  Match.when("cursor", () => process.platform === "win32" && process.arch === "x64"
    ? inspectCursorVersion().pipe(
      Effect.map(Option.getOrNull),
      Effect.mapError(() => new ProjectError({ detail: "Cannot inspect the installed Cursor client" }))
    )
    : Effect.fail(new ProjectError({ detail: "Cursor preview requires a qualified Windows x64 installation; see docs/compatibility.md" }))),
  Match.exhaustive
)

export const inspectClient = Effect.fn("Project.inspectPreviewClient")(function*(client: LocalClient, format: Format | null) {
  const version = yield* clientVersion(client)
  if (version === null) return { client, profile: null }
  const profile = yield* Match.value(selectNativeProfile({
    query: { host: client, platform: RuntimePlatform.make(process.platform), scope: "user", format, requirements: [] },
    profiles: nativeProfiles
  })).pipe(Match.discriminatorsExhaustive("type")({
    selected: ({ profile }) => Effect.succeed(profile),
    blocked: () => Effect.fail(new ProjectError({ detail: `${client} ${version} is unsupported for this preview on ${process.platform}; see docs/compatibility.md` }))
  }))
  return { client, profile }
})

export const resolveClient = Effect.fn("Project.resolvePreviewClient")(function*(client: LocalClient, profile: NativeProfile) {
  const fs = yield* FileSystem.FileSystem
  const home = yield* Schema.decodeEffect(Directory)(localHome(client)).pipe(
    Effect.mapError(() => new ProjectError({ detail: `Invalid ${client} configuration directory` }))
  )
  yield* fs.makeDirectory(home, { recursive: true }).pipe(Effect.mapError(() => new ProjectError({ detail: `Cannot create ${client} configuration directory` })))
  const canonical = yield* fs.realPath(home).pipe(Effect.mapError(() => new ProjectError({ detail: `Cannot resolve ${client} configuration directory` })))
  return { client, profile, home: Directory.make(canonical) }
})

export type ResolvedClient = Effect.Success<ReturnType<typeof resolveClient>>
