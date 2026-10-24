import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { join } from "node:path"
import { Effect, FileSystem, Match } from "effect"
import { SourceUnavailable } from "../../../contracts/Compiler.ts"
import { PermissionBits } from "../../../contracts/ExecutableIntent.ts"
import { Directory, PackagePath } from "../../../contracts/Plugin.ts"
import { inside } from "../../internal/paths.ts"
import { SourceFiles, SourceReadRejected, type NativeContent, type SourceReadError, type SourceSelectionMode } from "../../internal/source-files.ts"

export const makeLinuxSourceFiles = Effect.fn("Compiler.linuxSourceFiles")(function*(requestedRoot: Directory) {
  if (process.platform !== "linux") {
    return yield* new SourceUnavailable({
      root: requestedRoot,
      cause: new Error("The initial source capture profile requires Linux file-descriptor inspection")
    })
  }

  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.realPath(requestedRoot)
  if ((yield* fs.stat(root)).type !== "Directory") {
    return yield* new SourceUnavailable({ root: requestedRoot, cause: new Error("Source root is not a directory") })
  }

  const captured = new Map<PackagePath, NativeContent>()

  const reject = (path: PackagePath, reason: SourceReadRejected["reason"]) =>
    Effect.fail(new SourceReadRejected({ path, reason }))

  const resolve = Effect.fnUntraced(function*(path: PackagePath): Effect.fn.Return<string, SourceReadError> {
    let prefix = ""
    let physical = root
    for (const name of path.split("/")) {
      prefix = prefix === "" ? name : `${prefix}/${name}`
      physical = yield* fs.realPath(join(root, prefix))
      if (!inside(root, physical)) return yield* reject(PackagePath.make(prefix), "outside")
    }
    return physical
  })

  const read = Effect.fnUntraced(function*(path: PackagePath): Effect.fn.Return<NativeContent, SourceReadError> {
    const cached = captured.get(path)
    if (cached !== undefined) return cached

    const physical = yield* resolve(path)
    const bytes = yield* Effect.scoped(Effect.gen(function*() {
      const io = <A>(operation: () => Promise<A>) => Effect.tryPromise({
        try: operation,
        catch: (cause) => new SourceUnavailable({ root: requestedRoot, cause })
      })
      const file = yield* Effect.acquireRelease(
        io(() => open(physical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)),
        (handle) => Effect.promise(() => handle.close())
      )
      const openedPath = yield* io(() => realpath(`/proc/self/fd/${file.fd}`))
      if (!inside(root, openedPath)) return yield* reject(path, "outside")

      const before = yield* io(() => file.stat({ bigint: true }))
      if (!before.isFile()) return yield* reject(path, "not_regular")

      const content = new Uint8Array(yield* io(() => file.readFile()))
      const after = yield* io(() => file.stat({ bigint: true }))
      const resolved = yield* io(() => realpath(`/proc/self/fd/${file.fd}`))
      if (
        resolved !== openedPath ||
        !inside(root, resolved) ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        before.mode !== after.mode
      ) {
        return yield* new SourceUnavailable({ root: requestedRoot, cause: new Error("Source changed during capture") })
      }

      return {
        content,
        mode: {
          type: "posix",
          before: PermissionBits.make(Number(before.mode & 0o777n)),
          after: PermissionBits.make(Number(after.mode & 0o777n))
        } satisfies NativeContent["mode"]
      }
    }))

    const result: NativeContent = { path, ...bytes }
    captured.set(path, result)
    return result
  })

  const walk = Effect.fnUntraced(function*(
    directory: PackagePath,
    ancestors: ReadonlySet<string>
  ): Effect.fn.Return<ReadonlyArray<NativeContent>, SourceReadError> {
    const folder = join(root, directory)
    const physical = yield* resolve(directory)
    if (ancestors.has(physical)) return yield* reject(directory, "cycle")

    const visited = new Set([...ancestors, physical])
    const files: NativeContent[] = []
    for (const child of yield* fs.readDirectory(folder)) {
      const logical = yield* Effect.try({
        try: () => PackagePath.make(`${directory}/${child}`),
        catch: () => new SourceReadRejected({ path: directory, reason: "path" })
      })
      const childPath = join(root, logical)
      yield* resolve(logical)
      const info = yield* fs.stat(childPath)
      if (info.type === "Directory") files.push(...yield* walk(logical, visited))
      else files.push(yield* read(logical))
    }
    return files
  })

  const select = Effect.fnUntraced(function*(
    path: PackagePath,
    mode: SourceSelectionMode
  ): Effect.fn.Return<ReadonlyArray<NativeContent>, SourceReadError> {
    const physical = yield* resolve(path)
    const info = yield* fs.stat(physical)
    return yield* Match.value(mode).pipe(
      Match.when("directory", () => info.type === "Directory"
        ? walk(path, new Set())
        : reject(path, "not_directory")),
      Match.when("either", () => info.type === "Directory"
        ? walk(path, new Set())
        : Effect.map(read(path), (file) => [file])),
      Match.exhaustive
    )
  })

  return SourceFiles.of({ file: read, select })
})
