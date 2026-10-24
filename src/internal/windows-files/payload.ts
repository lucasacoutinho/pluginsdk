import { Context, Effect, Layer, Match, Schema } from "effect"
import { FileDigest } from "../../../contracts/CompilerModel.ts"
import * as Files from "../../../contracts/FileRead.ts"
import * as LocalPackage from "../../../contracts/LocalPackage.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import * as Trees from "../../../contracts/TreeRead.ts"
import { admitRead } from "../files/file.ts"
import { admitDirectory, admitEntry } from "../files/tree.ts"
import { compareUtf8 } from "../paths.ts"
import { fileDigest, fingerprint } from "../identity.ts"
import { NativeContent } from "../source-files.ts"
import { getFileApi, type FileApi } from "./api.ts"
import { MetadataObservation } from "./metadata.ts"
import { directoryAnchor, openRoot, type NativeFile, type NativeRoot } from "./owner.ts"

type PackageTree = LocalPackage.Tree

export class WindowsReadUnavailable extends Schema.TaggedError<WindowsReadUnavailable, { readonly brand: unique symbol }>()(
  "WindowsReadUnavailable", { cause: Schema.Defect() }
) {}

export class WindowsPayloadReader extends Context.Service<WindowsPayloadReader, {
  readonly read: (root: string) => Effect.Effect<ReadonlyArray<NativeContent>, WindowsReadUnavailable>
}>()("pluginsdk/WindowsPayloadReader") {}

export class WindowsPackageReader extends Context.Service<WindowsPackageReader, {
  readonly read: (root: string) => Effect.Effect<PackageTree, WindowsReadUnavailable>
  readonly observe: (root: string, path: PackagePath) => Effect.Effect<LocalPackage.Observation, WindowsReadUnavailable>
}>()("pluginsdk/WindowsPackageReader") {}

const DirectoryFrame = Schema.Struct({
  path: Schema.NullOr(PackagePath), info: Trees.DirectoryInfo, metadata: MetadataObservation
})
type DirectoryFrame = typeof DirectoryFrame.Type
const FileFrame = Schema.Struct({ path: PackagePath, info: Files.FileInfo, digest: FileDigest, metadata: MetadataObservation })
type FileFrame = typeof FileFrame.Type
const Capture = Schema.Struct({
  files: Schema.Array(NativeContent), directories: Schema.Array(PackagePath),
  directoryFrames: Schema.Array(DirectoryFrame), fileFrames: Schema.Array(FileFrame)
})
type Capture = typeof Capture.Type
const sameMetadata = Schema.toEquivalence(Schema.NullOr(MetadataObservation))

const directoryInfo = (observed: Trees.DirectoryObservation): Trees.DirectoryInfo => Match.value(observed).pipe(
  Match.discriminatorsExhaustive("type")({
    directory: ({ info }) => info,
    unavailable: () => { throw new Error("Native payload directory information is unavailable") },
    other: () => { throw new Error("Native payload entry is not a directory") }
  })
)

const names = (enumeration: Trees.Enumeration): ReadonlyArray<Files.Component> =>
  Match.value(enumeration).pipe(Match.discriminatorsExhaustive("type")({
    complete: ({ names }) => names,
    failed: () => { throw new Error("Native payload directory enumeration failed") }
  }))

function capture(owner: Pick<NativeRoot, "anchor" | "file" | "open">, includeMetadata: boolean): Capture {
  const files: NativeContent[] = []
  const directories: PackagePath[] = []
  const directoryFrames: DirectoryFrame[] = []
  const fileFrames: FileFrame[] = []
  const directoryMetadata = (file: NativeFile): MetadataObservation | null => {
    if (!includeMetadata) return null
    const metadata = file.metadata().observed
    if (metadata.streams.length !== 0) throw new Error("Native package directory contains data streams")
    return metadata
  }
  const fileMetadata = (file: NativeFile, size: Files.Quantity): MetadataObservation | null => {
    if (!includeMetadata) return null
    const metadata = file.metadata().observed
    const [stream, ...additional] = metadata.streams
    if (stream === undefined || additional.length !== 0 || stream.name !== "::$DATA" || stream.size !== size) {
      throw new Error("Native package file stream inventory does not match its default data")
    }
    return metadata
  }
  const walk = (file: NativeFile, prefix: PackagePath | null, ancestors: ReadonlyArray<Files.Anchor>): void => {
    const beforeRoot = owner.file.snapshot().observation
    const beforeDirectory = file.snapshot()
    const beforeMetadata = directoryMetadata(file)
    const parent = directoryAnchor(beforeDirectory.observation)
    const enumeratedBefore = file.enumerate()
    const visited: Files.Component[] = []
    for (const name of names(enumeratedBefore).toSorted(compareUtf8)) {
      const path = PackagePath.make(prefix === null ? name : `${prefix}/${name}`)
      const child = owner.open(path)
      try {
        const observed = child.snapshot()
        const entry = admitEntry({ policy: "payload", root: owner.anchor, branch: { parent, ancestors },
          name, entry: observed.entry, target: observed.observation })
        if (entry !== "accepted") throw new Error(`Native payload entry refused: ${entry}`)
        Match.value(observed.observation).pipe(Match.discriminatorsExhaustive("type")({
          directory: () => { directories.push(path); walk(child, path, [parent, ...ancestors]) },
          file: ({ info }) => {
            const rootBefore = owner.file.snapshot().observation
            const beforeMetadata = fileMetadata(child, info.size)
            const content = child.read()
            const after = { root: owner.file.snapshot().observation, file: child.snapshot().observation }
            const afterMetadata = fileMetadata(child, info.size)
            const decision = admitRead({ root: owner.anchor, before: { root: rootBefore, file: observed.observation }, after,
              read: { type: "complete", length: Files.Quantity.make(String(content.length)) } })
            if (decision !== "accepted") throw new Error(`Native payload read refused: ${decision}`)
            if (!sameMetadata(beforeMetadata, afterMetadata)) throw new Error("Native package file metadata changed")
            files.push({ path, content, mode: { type: "unrepresented" } })
            if (beforeMetadata !== null) fileFrames.push({ path, info, digest: fileDigest(content), metadata: beforeMetadata })
          },
          other: () => { throw new Error("Native payload contains a reparse point or special file") },
          unavailable: () => { throw new Error("Native payload entry observation is unavailable") }
        }))
        visited.push(name)
      } finally { child.close() }
    }
    const enumeratedAfter = file.enumerate()
    const after = { root: owner.file.snapshot().observation, directory: file.snapshot().directory }
    const afterMetadata = directoryMetadata(file)
    const decision = admitDirectory({ root: owner.anchor, directory: parent,
      before: { root: beforeRoot, directory: beforeDirectory.directory }, after,
      enumeratedBefore, enumeratedAfter, visited })
    if (decision !== "accepted") throw new Error(`Native payload directory refused: ${decision}`)
    if (!sameMetadata(beforeMetadata, afterMetadata)) throw new Error("Native package directory metadata changed")
    if (beforeMetadata !== null) {
      directoryFrames.push({ path: prefix, info: directoryInfo(beforeDirectory.directory), metadata: beforeMetadata })
    }
  }
  walk(owner.file, null, [])
  return {
    files: files.toSorted((left, right) => compareUtf8(left.path, right.path)),
    directories: directories.toSorted(compareUtf8),
    directoryFrames: directoryFrames.toSorted((left, right) => compareUtf8(left.path ?? "", right.path ?? "")),
    fileFrames: fileFrames.toSorted((left, right) => compareUtf8(left.path, right.path))
  }
}

export function captureTree(owner: Pick<NativeRoot, "anchor" | "file" | "open">): NativeContent[] {
  return [...capture(owner, false).files]
}

export function capturePackageTree(owner: Pick<NativeRoot, "anchor" | "file" | "open">): PackageTree {
  const captured = capture(owner, true)
  const basis = fingerprint("native-package-capture", {
    root: owner.anchor, directories: captured.directoryFrames, files: captured.fileFrames
  })
  return {
    root: owner.anchor.identity, basis, directories: captured.directories,
    files: captured.fileFrames.map(({ path, digest }) => ({ path, digest, mode: { type: "unrepresented" } }))
  }
}

interface ObservedDirectoryFrame {
  readonly file: NativeFile
  readonly anchor: Files.Anchor
  readonly ancestors: ReadonlyArray<Files.Anchor>
}

const sameAnchor = Schema.toEquivalence(Files.Anchor)

function verifyDirectoryFrames(frames: ReadonlyArray<ObservedDirectoryFrame>): void {
  for (const frame of frames) {
    const current = directoryAnchor(frame.file.snapshot().observation)
    if (!sameAnchor(frame.anchor, current)) throw new Error("Native package observation parent changed")
  }
}

function observePackage(owner: NativeRoot, path: PackagePath): LocalPackage.Observation {
  owner.admit(path)
  const rootFrame: ObservedDirectoryFrame = { file: owner.file, anchor: owner.anchor, ancestors: [] }
  const frames: ObservedDirectoryFrame[] = [rootFrame]
  let parent = rootFrame
  const components = path.split("/")

  for (const [index, component] of components.entries()) {
    const requested = PackagePath.make(components.slice(0, index + 1).join("/"))
    const child = owner.lookup(requested)
    if (child === null) {
      verifyDirectoryFrames(frames)
      return { type: "absent" }
    }

    const observed = child.snapshot()
    const decision = admitEntry({ policy: "payload", root: owner.anchor,
      branch: { parent: parent.anchor, ancestors: parent.ancestors }, name: Files.Component.make(component),
      entry: observed.entry, target: observed.observation })
    const refuse = (reason: Trees.EntryDecision): never => {
      throw new Error(`Native package observation entry refused: ${reason}`)
    }
    Match.value(decision).pipe(
      Match.when("accepted", () => undefined),
      Match.when("unavailable", refuse),
      Match.when("not_regular", refuse),
      Match.when("stream", refuse),
      Match.when("changed", refuse),
      Match.when("outside", refuse),
      Match.when("name_mismatch", refuse),
      Match.when("reparse", refuse),
      Match.when("cycle", refuse),
      Match.exhaustive
    )
    const anchor = directoryAnchor(observed.observation)
    const frame: ObservedDirectoryFrame = {
      file: child, anchor, ancestors: [parent.anchor, ...parent.ancestors]
    }
    frames.push(frame)
    parent = frame
  }

  const tree = capturePackageTree({
    anchor: parent.anchor,
    file: parent.file,
    open: (relative) => owner.open(PackagePath.make(`${path}/${relative}`))
  })
  verifyDirectoryFrames(frames)
  return { type: "tree", ...tree }
}

const io = <A>(operation: () => A) => Effect.try({ try: operation, catch: (cause) => new WindowsReadUnavailable({ cause }) })
const withRoot = <A>(api: FileApi, path: string, use: (root: NativeRoot) => A) => Effect.scoped(Effect.gen(function*() {
  const owner = yield* Effect.acquireRelease(io(() => openRoot(api, path)), (owner) => Effect.sync(owner.close))
  return yield* io(() => use(owner))
}))

export const makeWindowsPayloadReader = (api: FileApi) => WindowsPayloadReader.of({
  read: Effect.fn("WindowsPayloadReader.read")((root: string) => withRoot(api, root, captureTree))
})

export const makeWindowsPackageReader = (api: FileApi) => WindowsPackageReader.of({
  read: Effect.fn("WindowsPackageReader.read")((root: string) => withRoot(api, root, capturePackageTree)),
  observe: Effect.fn("WindowsPackageReader.observe")((root: string, path: PackagePath) =>
    withRoot(api, root, (owner) => observePackage(owner, path)))
})

const loadFileApi = Effect.tryPromise({ try: getFileApi, catch: (cause) => new WindowsReadUnavailable({ cause }) })

export const WindowsPayloadReaderLive = Layer.effect(WindowsPayloadReader,
  Effect.map(loadFileApi, makeWindowsPayloadReader)
)

export const WindowsPackageReaderLive = Layer.effect(WindowsPackageReader,
  Effect.map(loadFileApi, makeWindowsPackageReader)
)
