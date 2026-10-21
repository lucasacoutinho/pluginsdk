import { join } from "node:path"
import { lstat } from "node:fs/promises"
import { Effect, FileSystem, Option } from "effect"
import { DestinationUnsupported, HostUnavailable, InstallationKey, type Destination, type Target } from "../../contracts/Installer.ts"
import { Directory, type PluginId } from "../../contracts/Plugin.ts"
import { commitment } from "../internal/identity.ts"
import { nativeLocations } from "../compiler/native.ts"
import { profiles, runHost, supportedHost } from "./host.ts"
import type { Format } from "../../contracts/Compiler.ts"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"

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
    const metadata = target.destination.host === "claude_code"
      ? [["settings.json"], ["plugins", "installed_plugins.json"], ["plugins", "known_marketplaces.json"]]
      : [["config.toml"]]
    for (const path of metadata) await physicalDescendant(home, path)
    await physicalDescendant(home, ["plugins", "cache", paths.marketName, target.plugin])
    if (target.destination.type === "project") await physicalDescendant(target.destination.root, [".claude", "settings.json"])
  },
  catch: (cause) => new HostUnavailable({ host: target.destination.host, cause })
})

export const resolveTarget = Effect.fnUntraced(function*(destination: Destination, plugin: PluginId, format?: Format): Effect.fn.Return<Target, DestinationUnsupported | HostUnavailable, FileSystem.FileSystem | ChildProcessSpawner> {
  const host = supportedHost(destination.host)
  if (host === null) return yield* new DestinationUnsupported({ destination, detail: "No qualified native installation and inspection contract is available; see docs/host-research.md" })
  if (process.platform !== "linux") return yield* new DestinationUnsupported({ destination, detail: "The initial native profiles qualify Linux only" })
  if (host === "codex" && destination.type === "project") return yield* new DestinationUnsupported({ destination, detail: "This Codex profile qualifies user-scope installation only" })
  const profile = profiles[host]
  if (format !== undefined && nativeLocations(format).base !== profile.format) return yield* new DestinationUnsupported({ destination, detail: `Host requires a ${profile.format} compatible package` })
  const fs = yield* FileSystem.FileSystem
  const canonical = yield* Effect.gen(function*() {
    const home = Directory.make(yield* fs.realPath(destination.home))
    if ((yield* fs.stat(home)).type !== "Directory") return yield* new HostUnavailable({ host, cause: new Error("Host home is not a directory") })
    if (destination.type === "user") return { ...destination, home }
    const root = Directory.make(yield* fs.realPath(destination.root))
    if ((yield* fs.stat(root)).type !== "Directory") return yield* new HostUnavailable({ host, cause: new Error("Project root is not a directory") })
    return { ...destination, home, root }
  }).pipe(Effect.catchTag("PlatformError", (cause) => new HostUnavailable({ host, cause })))
  const version = (yield* runHost(canonical, ["--version"])).trim()
  const expected = host === "claude_code" ? `${profile.version} (Claude Code)` : `codex-cli ${profile.version}`
  if (version !== expected) return yield* new DestinationUnsupported({ destination: canonical, detail: `Profile ${profile.revision} requires ${expected}; found ${version}` })
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
