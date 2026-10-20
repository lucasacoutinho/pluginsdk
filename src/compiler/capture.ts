import { isAbsolute, join, relative } from "node:path"
import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { Effect, FileSystem } from "effect"
import { BuildRejected, SourceUnavailable, type BuildRequest } from "../../contracts/Compiler.ts"
import { PackagePath } from "../../contracts/Plugin.ts"
import { fileDigest } from "../internal/identity.ts"
import { skillName } from "./skill.ts"
import type { FileDigest, Skill } from "../../contracts/CompilerModel.ts"
import type { PlatformError } from "effect/PlatformError"

export const inside = (root: string, path: string): boolean => {
  const segment = relative(root, path)
  return segment !== ".." && !segment.startsWith("../") && !isAbsolute(segment)
}

export const capture = Effect.fnUntraced(function*(request: BuildRequest) {
  if (process.platform !== "linux") return yield* new SourceUnavailable({ root: request.root, cause: new Error("The initial source capture profile requires Linux file-descriptor inspection") })
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.realPath(request.root)
  if ((yield* fs.stat(root)).type !== "Directory") return yield* new SourceUnavailable({ root: request.root, cause: new Error("Source root is not a directory") })
  const contents = new Map<FileDigest, Uint8Array>()
  const skills: Skill[] = []

  const read = Effect.fnUntraced(function*(path: string, logical: PackagePath) {
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
      if (!before.isFile()) return yield* new BuildRejected({ issues: [{ type: "invalid_skill", path: logical, detail: "Only regular files can be captured" }] })
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

  for (const directory of request.plugin.skills) {
    const physical = yield* fs.realPath(join(root, directory))
    if (!inside(root, physical)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: directory }] })
    const entryPath = PackagePath.make(`${directory}/SKILL.md`)
    const entry = yield* read(join(root, entryPath), entryPath)
    const entryBytes = contents.get(entry.digest)
    if (entryBytes === undefined) return yield* Effect.die(new Error("Captured entry missing from content table"))
    const name = yield* Effect.try({
      try: () => skillName(directory, entryBytes),
      catch: (cause) => new BuildRejected({ issues: [{ type: "invalid_skill", path: entryPath, detail: cause instanceof Error ? cause.message : "Invalid skill frontmatter" }] })
    })
    const assets: Array<Skill["assets"][number]> = []
    const walk = Effect.fnUntraced(function*(folder: string, prefix: string, ancestors: ReadonlySet<string>): Effect.fn.Return<void, BuildRejected | SourceUnavailable | PlatformError> {
      const resolved = yield* fs.realPath(folder)
      const logical = PackagePath.make(prefix === "" ? directory : `${directory}/${prefix}`)
      if (!inside(root, resolved)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: logical }] })
      if (ancestors.has(resolved)) return yield* new BuildRejected({ issues: [{ type: "invalid_skill", path: logical, detail: "Cyclic source directory" }] })
      const visited = new Set([...ancestors, resolved])
      for (const child of yield* fs.readDirectory(folder)) {
        const asset = prefix === "" ? child : `${prefix}/${child}`
        if (asset === "SKILL.md") continue
        const assetPath = yield* Effect.try({
          try: () => PackagePath.make(asset),
          catch: () => new BuildRejected({ issues: [{ type: "invalid_skill", path: directory, detail: "A source filename cannot be represented as a package path" }] })
        })
        const path = join(folder, child)
        const full = PackagePath.make(`${directory}/${asset}`)
        const real = yield* fs.realPath(path)
        if (!inside(root, real)) return yield* new BuildRejected({ issues: [{ type: "source_escape", path: full }] })
        const info = yield* fs.stat(path)
        if (info.type === "Directory") yield* walk(path, asset, visited)
        else assets.push({ path: assetPath, ...yield* read(path, full) })
      }
    })
    yield* walk(join(root, directory), "", new Set())
    skills.push({ name, entry, assets })
  }
  return { skills, contents }
})
