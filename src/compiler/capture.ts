import { isAbsolute, join, relative } from "node:path"
import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { Effect, FileSystem, Match } from "effect"
import { BuildRejected, SourceUnavailable, type BuildRequest } from "../../contracts/Compiler.ts"
import { PackagePath } from "../../contracts/Plugin.ts"
import { fileDigest } from "../internal/identity.ts"
import { skillName } from "./skill.ts"
import type { Asset, FileDigest, Skill } from "../../contracts/CompilerModel.ts"
import type { PlatformError } from "effect/PlatformError"

export const inside = (root: string, path: string): boolean => {
  const segment = relative(root, path)
  return segment !== ".." && !segment.startsWith("../") && !isAbsolute(segment)
}

type SourceKind = "skill" | "asset"

const invalidSource = (kind: SourceKind, path: PackagePath, detail: string): BuildRejected =>
  Match.value(kind).pipe(
    Match.when("skill", () => new BuildRejected({ issues: [{ type: "invalid_skill", path, detail }] })),
    Match.when("asset", () => new BuildRejected({ issues: [{ type: "invalid_asset", path, detail }] })),
    Match.exhaustive
  )

export const capture = Effect.fnUntraced(function*(request: BuildRequest) {
  if (process.platform !== "linux") return yield* new SourceUnavailable({ root: request.root, cause: new Error("The initial source capture profile requires Linux file-descriptor inspection") })
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.realPath(request.root)
  if ((yield* fs.stat(root)).type !== "Directory") return yield* new SourceUnavailable({ root: request.root, cause: new Error("Source root is not a directory") })
  const contents = new Map<FileDigest, Uint8Array>()
  const skills: Skill[] = []

  const read = Effect.fnUntraced(function*(path: string, logical: PackagePath, kind: SourceKind) {
    const physical = yield* fs.realPath(path)
    if (!inside(root, physical)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: logical }] })
    const bytes = yield* Effect.scoped(Effect.gen(function*() {
      const io = <A>(operation: () => Promise<A>) => Effect.tryPromise({ try: operation, catch: (cause) => new SourceUnavailable({ root: request.root, cause }) })
      const file = yield* Effect.acquireRelease(
        io(() => open(physical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)),
        (file) => Effect.promise(() => file.close())
      )
      const openedPath = yield* io(() => realpath(`/proc/self/fd/${file.fd}`))
      if (!inside(root, openedPath)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: logical }] })
      const before = yield* io(() => file.stat({ bigint: true }))
      if (!before.isFile()) return yield* invalidSource(kind, logical, "Only regular files can be captured")
      const content = new Uint8Array(yield* io(() => file.readFile()))
      const after = yield* io(() => file.stat({ bigint: true }))
      const resolved = yield* io(() => realpath(`/proc/self/fd/${file.fd}`))
      if (resolved !== openedPath || !inside(root, resolved) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
        return yield* new SourceUnavailable({ root: request.root, cause: new Error("Source changed during capture") })
      }
      return { content, executable: (before.mode & 0o111n) !== 0n }
    }))
    const digest = fileDigest(bytes.content)
    contents.set(digest, bytes.content)
    return { digest, executable: bytes.executable }
  })

  const walk = Effect.fnUntraced(function*(
    directory: PackagePath,
    kind: SourceKind,
    skip: PackagePath | null,
    ancestors: ReadonlySet<string>
  ): Effect.fn.Return<Asset[], BuildRejected | SourceUnavailable | PlatformError> {
    const folder = join(root, directory)
    const resolved = yield* fs.realPath(folder)
    if (!inside(root, resolved)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: directory }] })
    if (ancestors.has(resolved)) return yield* invalidSource(kind, directory, "Cyclic source directory")
    const visited = new Set([...ancestors, resolved])
    const files: Asset[] = []
    for (const child of yield* fs.readDirectory(folder)) {
      const logical = yield* Effect.try({
        try: () => PackagePath.make(`${directory}/${child}`),
        catch: () => invalidSource(kind, directory, "A source filename cannot be represented as a package path")
      })
      if (logical === skip) continue
      const path = join(root, logical)
      const physical = yield* fs.realPath(path)
      if (!inside(root, physical)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: logical }] })
      const info = yield* fs.stat(path)
      if (info.type === "Directory") files.push(...yield* walk(logical, kind, skip, visited))
      else files.push({ path: logical, ...yield* read(path, logical, kind) })
    }
    return files
  })

  for (const directory of request.plugin.skills) {
    const physical = yield* fs.realPath(join(root, directory))
    if (!inside(root, physical)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: directory }] })
    const entryPath = PackagePath.make(`${directory}/SKILL.md`)
    const entry = yield* read(join(root, entryPath), entryPath, "skill")
    const entryBytes = contents.get(entry.digest)
    if (entryBytes === undefined) return yield* Effect.die(new Error("Captured entry missing from content table"))
    const name = yield* Effect.try({
      try: () => skillName(directory, entryBytes, request.format),
      catch: (cause) => new BuildRejected({ issues: [{ type: "invalid_skill", path: entryPath, detail: cause instanceof Error ? cause.message : "Invalid skill frontmatter" }] })
    })
    const files = yield* walk(directory, "skill", entryPath, new Set())
    const assets = files.map((file) => ({ ...file, path: PackagePath.make(file.path.slice(directory.length + 1)) }))
    skills.push({ name, entry, assets })
  }
  const assets: Asset[] = []
  for (const path of request.plugin.assets ?? []) {
    const physical = yield* fs.realPath(join(root, path))
    if (!inside(root, physical)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path }] })
    const info = yield* fs.stat(physical)
    if (info.type === "Directory") assets.push(...yield* walk(path, "asset", null, new Set()))
    else assets.push({ path, ...yield* read(join(root, path), path, "asset") })
  }
  return { skills, assets, contents }
})
