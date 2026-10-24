import { posix, win32 } from "node:path"
import { Context, Effect, Layer, Match, Schema } from "effect"
import type { PackageFile } from "../../../contracts/Compiler.ts"
import * as Files from "../../../contracts/FileRead.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { admitEntry } from "../files/tree.ts"
import type { NativeContent } from "../source-files.ts"
import { syncDirectory } from "../storage.ts"
import { getFileApi, type FileApi } from "./api.ts"
import { directoryAnchor, openRoot, type NativeFile, type NativeRoot } from "./owner.ts"
import { captureTree } from "./payload.ts"

export class WindowsWriteUnavailable extends Schema.TaggedError<WindowsWriteUnavailable, { readonly brand: unique symbol }>()(
  "WindowsWriteUnavailable", { cause: Schema.Defect() }
) {}

export class WindowsPayloadWriter extends Context.Service<WindowsPayloadWriter, {
  readonly write: (root: string, files: ReadonlyArray<PackageFile>) => Effect.Effect<ReadonlyArray<NativeContent>, WindowsWriteUnavailable>
  readonly allocate: (root: string, files: ReadonlyArray<PackageFile>) => Effect.Effect<ReadonlyArray<NativeContent>, WindowsWriteUnavailable>
}>()("pluginsdk/WindowsPayloadWriter") {}

interface Branch {
  readonly file: NativeFile
  readonly anchor: Files.Anchor
  readonly ancestors: ReadonlyArray<Files.Anchor>
  readonly created: boolean
}

export const makeWindowsPayloadWriter = (api: FileApi) => {
  const writePayload = Effect.fnUntraced(function*(
    root: string,
    files: ReadonlyArray<PackageFile>,
    requireNewLeaf: boolean
  ) {
    const unavailable = (cause: unknown) => new WindowsWriteUnavailable({ cause })
    const io = <A>(operation: () => A) => Effect.try({ try: operation, catch: unavailable })
    const sync = (path: string) => Effect.tryPromise({ try: () => syncDirectory(path), catch: unavailable })
    return yield* Effect.scoped(Effect.gen(function*() {
      const location = yield* io(() => {
        if (!win32.isAbsolute(root) || win32.normalize(root) !== root) throw new Error("Payload destination must be a canonical absolute Windows path")
        const volume = win32.parse(root).root
        const relative = PackagePath.make(win32.relative(volume, root).replaceAll("\\", "/"))
        return { volume, relative }
      })
      const owner = yield* Effect.acquireRelease(io(() => openRoot(api, location.volume)), (owner) => Effect.sync(owner.close))
      const fullPath = (path: PackagePath): PackagePath => PackagePath.make(`${location.relative}/${path}`)
      yield* io(() => {
        owner.admit(location.relative)
        for (const file of files) owner.admit(fullPath(file.path))
      })

      const volume: Branch = { file: owner.file, anchor: owner.anchor, ancestors: [], created: false }
      const directories = new Map<PackagePath, Branch>()
      const directory = Effect.fnUntraced(function*(path: PackagePath) {
        let prefix = ""
        let parent = volume
        for (const name of path.split("/")) {
          prefix = prefix === "" ? name : `${prefix}/${name}`
          const logical = PackagePath.make(prefix)
          const cached = directories.get(logical)
          if (cached !== undefined) { parent = cached; continue }
          const opened = yield* io(() => owner.directory(logical))
          const branch = yield* io((): Branch => {
            const observed = opened.file.snapshot()
            const decision = admitEntry({ policy: "payload", root: owner.anchor, branch: { parent: parent.anchor, ancestors: parent.ancestors },
              name: Files.Component.make(name), entry: observed.entry, target: observed.observation })
            if (decision !== "accepted") throw new Error(`Native payload directory refused: ${decision}`)
            return { file: opened.file, anchor: directoryAnchor(observed.observation),
              ancestors: [parent.anchor, ...parent.ancestors], created: opened.created }
          })
          if (opened.created) yield* sync(parent.anchor.path)
          directories.set(logical, branch)
          parent = branch
        }
        return parent
      })
      const payload = yield* directory(location.relative)
      yield* io(() => {
        if (requireNewLeaf && !payload.created) throw new Error("Payload allocation destination already exists")
        const existing = payload.file.enumerate()
        const empty = Match.value(existing).pipe(Match.discriminatorsExhaustive("type")({
          complete: ({ names }) => names.length === 0,
          failed: () => false
        }))
        if (!empty) throw new Error("Immutable payload destination is not empty")
      })
      for (const file of files) {
        const logical = fullPath(file.path)
        const parent = yield* directory(PackagePath.make(posix.dirname(logical)))
        yield* io(() => {
          const created = owner.create(logical)
          const observed = created.file.snapshot()
          const decision = admitEntry({ policy: "payload", root: owner.anchor, branch: { parent: parent.anchor, ancestors: parent.ancestors },
            name: Files.Component.make(posix.basename(logical)), entry: observed.entry, target: observed.observation })
          if (decision !== "accepted" || observed.observation.type !== "file") throw new Error(`Native payload file refused: ${decision}`)
          created.write(file.content)
          created.flush()
        })
        yield* sync(parent.anchor.path)
      }
      const open: NativeRoot["open"] = (path, mode) => owner.open(fullPath(path), mode)
      return yield* io(() => captureTree({ anchor: payload.anchor, file: payload.file, open }))
    })).pipe(Effect.uninterruptible)
  })

  return WindowsPayloadWriter.of({
    write: Effect.fn("WindowsPayloadWriter.write")(function*(root: string, files: ReadonlyArray<PackageFile>) {
      return yield* writePayload(root, files, false)
    }),
    allocate: Effect.fn("WindowsPayloadWriter.allocate")(function*(root: string, files: ReadonlyArray<PackageFile>) {
      return yield* writePayload(root, files, true)
    })
  })
}

export const WindowsPayloadWriterLive = Layer.effect(WindowsPayloadWriter,
  Effect.map(Effect.tryPromise({ try: getFileApi, catch: (cause) => new WindowsWriteUnavailable({ cause }) }), makeWindowsPayloadWriter)
)
