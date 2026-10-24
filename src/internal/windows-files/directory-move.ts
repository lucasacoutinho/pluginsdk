import { Context, Effect, Layer, Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"
import { Directory, PackagePath } from "../../../contracts/Plugin.ts"
import { admitEntry } from "../files/tree.ts"
import { syncDirectory } from "../storage.ts"
import { getFileApi, type FileApi } from "./api.ts"
import { directoryAnchor, openRoot, type NativeFile } from "./owner.ts"

const sameAnchor = Schema.toEquivalence(Files.Anchor)

interface DirectoryBranch {
  readonly file: NativeFile
  readonly anchor: Files.Anchor
  readonly ancestors: ReadonlyArray<Files.Anchor>
}

export const MoveRequest = Schema.Struct({
  root: Directory,
  from: PackagePath,
  to: PackagePath,
  expected: Files.Identity
})
export type MoveRequest = typeof MoveRequest.Type

export class WindowsDirectoryMoveUnavailable extends Schema.TaggedError<WindowsDirectoryMoveUnavailable, { readonly brand: unique symbol }>()(
  "WindowsDirectoryMoveUnavailable", { cause: Schema.Defect() }
) {}

export class WindowsDirectoryMover extends Context.Service<WindowsDirectoryMover, {
  readonly move: (request: MoveRequest) => Effect.Effect<Files.Anchor, WindowsDirectoryMoveUnavailable>
  readonly prepare: (root: Directory, path: PackagePath) => Effect.Effect<Files.Anchor, WindowsDirectoryMoveUnavailable>
}>()("pluginsdk/WindowsDirectoryMover") {}

export const makeWindowsDirectoryMover = (api: FileApi) => WindowsDirectoryMover.of({
  move: Effect.fn("WindowsDirectoryMover.move")(function*(request: MoveRequest) {
    const io = <A>(operation: () => A) => Effect.try({
      try: operation,
      catch: (cause) => new WindowsDirectoryMoveUnavailable({ cause })
    })
    return yield* Effect.scoped(Effect.gen(function*() {
      const root = yield* Effect.acquireRelease(
        io(() => openRoot(api, request.root)),
        (root) => Effect.sync(root.close)
      )
      return yield* io(() => root.moveDirectory(request.from, request.to, request.expected))
    }))
  }),
  prepare: Effect.fn("WindowsDirectoryMover.prepare")(function*(requestedRoot: Directory, path: PackagePath) {
    const io = <A>(operation: () => A) => Effect.try({
      try: operation,
      catch: (cause) => new WindowsDirectoryMoveUnavailable({ cause })
    })
    const sync = (directory: string) => Effect.tryPromise({
      try: () => syncDirectory(directory),
      catch: (cause) => new WindowsDirectoryMoveUnavailable({ cause })
    })
    return yield* Effect.scoped(Effect.gen(function*() {
      const root = yield* Effect.acquireRelease(
        io(() => openRoot(api, requestedRoot)),
        (root) => Effect.sync(root.close)
      )
      yield* io(() => root.admit(path))
      const rootBranch: DirectoryBranch = { file: root.file, anchor: root.anchor, ancestors: [] }
      const retained: Array<{ readonly file: NativeFile; readonly anchor: Files.Anchor }> = [rootBranch]
      let prefix = ""
      let parent = rootBranch
      for (const name of path.split("/")) {
        prefix = prefix === "" ? name : `${prefix}/${name}`
        const logical = yield* io(() => PackagePath.make(prefix))
        const opened = yield* io(() => root.directory(logical))
        const branch = yield* io((): DirectoryBranch => {
          const observed = opened.file.snapshot()
          const decision = admitEntry({ policy: "payload", root: root.anchor,
            branch: { parent: parent.anchor, ancestors: parent.ancestors },
            name: Files.Component.make(name), entry: observed.entry, target: observed.observation })
          if (decision !== "accepted") throw new Error(`Native directory preparation refused: ${decision}`)
          return { file: opened.file, anchor: directoryAnchor(observed.observation),
            ancestors: [parent.anchor, ...parent.ancestors] }
        })
        if (opened.created) yield* sync(parent.anchor.path)
        retained.push({ file: branch.file, anchor: branch.anchor })
        parent = branch
      }
      for (const frame of retained) {
        yield* io(() => {
          const current = directoryAnchor(frame.file.snapshot().observation)
          if (!sameAnchor(frame.anchor, current)) throw new Error("Native prepared directory anchor changed")
        })
      }
      return parent.anchor
    }))
  })
})

export const WindowsDirectoryMoverLive = Layer.effect(WindowsDirectoryMover,
  Effect.map(Effect.tryPromise({
    try: getFileApi,
    catch: (cause) => new WindowsDirectoryMoveUnavailable({ cause })
  }), makeWindowsDirectoryMover)
)
