import { join } from "node:path"
import { lstat } from "node:fs/promises"
import { Effect, FileSystem, Match, Option, Schema } from "effect"
import { DestinationUnsupported, HostUnavailable, InstallationKey, type Destination, type Target } from "../../../contracts/Installer.ts"
import { RuntimePlatform, RuntimeVersion } from "../../../contracts/Compatibility.ts"
import { LocalClient } from "../../../contracts/Clients.ts"
import { Directory, type PluginId } from "../../../contracts/Plugin.ts"
import { commitment } from "../../internal/identity.ts"
import { nativeLocations } from "../../compiler/package/native.ts"
import { runHost } from "../hosts/commands.ts"
import { inspectCursorVersion } from "../hosts/cursor.ts"
import { nativeProfiles } from "./profiles.ts"
import { selectNativeProfile } from "./compatibility.ts"
import { packageClient } from "./packages.ts"
import { NativePathInput } from "../../../contracts/WindowsPath.ts"
import { matchesNativePath } from "../../internal/windows-files/path.ts"
import { checkLauncherRuntime } from "../runtime/launcher.ts"
import type { Format } from "../../../contracts/Compiler.ts"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"

export const matchesTargetPath = (expected: string, reported: string): boolean =>
  Option.match(Schema.decodeOption(NativePathInput)({ platform: process.platform, expected, reported }), {
    onNone: () => false,
    onSome: matchesNativePath
  })

export const targetPaths = (target: Target) => {
  const store = join(target.destination.home, ".pluginsdk")
  const record = commitment("installation", { key: target.key })
  const directory = join(store, "installations", record)
  return {
    store,
    directory,
    state: join(directory, "state.json"),
    plans: join(directory, "plans"),
    market: join(directory, "market"),
    marketName: `pluginsdk-${record.slice(0, 24)}`,
    markers: join(directory, "markers")
  }
}

const physicalDescendant = async (root: string, segments: ReadonlyArray<string>): Promise<void> => {
  let path = root
  for (const segment of segments) {
    path = join(path, segment)
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error("Native installation paths must not contain symbolic links")
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return
      throw cause
    }
  }
}

const checkNativePaths = (target: Target) => Effect.tryPromise({
  try: async () => {
    const home = target.destination.home
    const paths = targetPaths(target)
    const metadata = Match.value(target.destination.host).pipe(
      Match.when("claude_code", () => [["settings.json"], ["plugins", "installed_plugins.json"], ["plugins", "known_marketplaces.json"]]),
      Match.when("codex", () => [["config.toml"]]),
      Match.when("cursor", () => [["plugins", "local", target.plugin]]),
      Match.whenOr("grok_bot", "muse", () => { throw new Error("Host has no qualified native paths") }),
      Match.exhaustive
    )
    for (const path of metadata) await physicalDescendant(home, path)
    if (target.destination.host !== "cursor") await physicalDescendant(home, ["plugins", "cache", paths.marketName, target.plugin])
    if (target.destination.type === "project") {
      await physicalDescendant(target.destination.root, target.destination.host === "codex" ? [".codex", "config.toml"] : [".claude", "settings.json"])
      await physicalDescendant(target.destination.root, [".pluginsdk", "installer"])
    }
  },
  catch: (cause) => new HostUnavailable({ host: target.destination.host, cause })
})

export const resolveTarget = Effect.fnUntraced(function*(destination: Destination, plugin: PluginId, format?: Format): Effect.fn.Return<Target, DestinationUnsupported | HostUnavailable, FileSystem.FileSystem | ChildProcessSpawner> {
  const host = destination.host
  if (!Schema.is(LocalClient)(host)) return yield* new DestinationUnsupported({ destination, detail: "No qualified native installation and inspection contract is available; see docs/compatibility.md" })
  if (host === "cursor" && process.arch !== "x64") return yield* new DestinationUnsupported({ destination, detail: "Cursor IDE requires a qualified Windows x64 installation" })
  if (format !== undefined && nativeLocations(format).host !== packageClient(host)) return yield* new DestinationUnsupported({ destination, detail: `Package format ${format} does not target ${host}` })
  if (!nativeProfiles.some((profile) => profile.host === host && profile.platform === process.platform && profile.scope === destination.type && (format === undefined || profile.formats.includes(format)))) {
    return yield* new DestinationUnsupported({ destination, detail: `No qualified profile admits ${host}, ${process.platform}, ${destination.type}${format === undefined ? "" : `, ${format}`}` })
  }
  const fs = yield* FileSystem.FileSystem
  const canonical = yield* Effect.gen(function*() {
    const home = Directory.make(yield* fs.realPath(destination.home))
    if ((yield* fs.stat(home)).type !== "Directory") return yield* new HostUnavailable({ host, cause: new Error("Host home is not a directory") })
    if (destination.type === "user") return { ...destination, home }
    const root = Directory.make(yield* fs.realPath(destination.root))
    if ((yield* fs.stat(root)).type !== "Directory") return yield* new HostUnavailable({ host, cause: new Error("Project root is not a directory") })
    return { ...destination, home, root }
  }).pipe(Effect.catchTag("PlatformError", (cause) => new HostUnavailable({ host, cause })))
  const version = yield* Match.value(host).pipe(
    Match.whenOr("claude_code", "codex", (client) => Effect.gen(function*() {
      const reported = (yield* runHost(canonical, ["--version"])).trim()
      const version = Match.value(client).pipe(
        Match.when("claude_code", () => /^(.+) \(Claude Code\)$/.exec(reported)?.[1]),
        Match.when("codex", () => /^codex-cli (.+)$/.exec(reported)?.[1]), Match.exhaustive
      )
      if (version === undefined) return yield* new DestinationUnsupported({ destination: canonical, detail: "Client version output does not match its native contract" })
      return RuntimeVersion.make(version)
    })),
    Match.when("cursor", () => inspectCursorVersion().pipe(Effect.flatMap((version) => Effect.fromOption(version,
      () => new DestinationUnsupported({ destination: canonical, detail: "Cursor IDE is not installed in the supported user-local location" })
    )))),
    Match.exhaustive
  )
  const profile = yield* Match.value(selectNativeProfile({
    query: { host, platform: RuntimePlatform.make(process.platform), version, scope: canonical.type, format: format ?? null },
    profiles: nativeProfiles
  })).pipe(Match.discriminatorsExhaustive("type")({
    selected: ({ profile }) => Effect.succeed(profile),
    blocked: ({ reason }) => Effect.fail(new DestinationUnsupported({
      destination: canonical, detail: `Native profile is ${reason} for ${host} ${version}, ${process.platform}, ${canonical.type}${format === undefined ? "" : `, ${format}`}`
    }))
  }))
  if (format !== undefined) yield* checkLauncherRuntime(canonical, format)
  const physicalId = Effect.fnUntraced(function*(path: string) {
    const info = yield* fs.stat(path).pipe(Effect.catchTag("PlatformError", (cause) => new HostUnavailable({ host, cause })))
    if (Option.isNone(info.ino)) return yield* new DestinationUnsupported({ destination: canonical, detail: "Native profile requires filesystem inode identity" })
    return { device: String(info.dev), inode: String(info.ino.value) }
  })
  const homeId = yield* physicalId(canonical.home)
  const rootId = canonical.type === "project" ? yield* physicalId(canonical.root) : null
  const key = InstallationKey.make(commitment("target", { host, home: homeId, scope: canonical.type, root: rootId, plugin }))
  const target: Target = { key, destination: canonical, plugin, profile: profile.revision, version: profile.version }
  yield* checkNativePaths(target)
  return target
})
