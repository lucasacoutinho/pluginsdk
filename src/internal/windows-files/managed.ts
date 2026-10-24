import { randomUUID } from "node:crypto"
import { win32 } from "node:path"
import { Context, Effect, Layer, Match, Schema } from "effect"
import { RuntimePlatform } from "../../../contracts/Compatibility.ts"
import { FileDigest } from "../../../contracts/CompilerModel.ts"
import * as Files from "../../../contracts/FileRead.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { WindowsFileAttributes, WindowsFileBasis, type FileBasis } from "../../../contracts/ProjectConfig.ts"
import { Streams, type Observation, type Snapshot } from "../../../contracts/ProjectFile.ts"
import { admitRead, parseFinalPath } from "../files/file.ts"
import { admitProjectFile, reviewProjectFile } from "../files/ownership.ts"
import { fileDigest } from "../identity.ts"
import { encodeFileRename, getFileApi, type FileApi } from "./api.ts"
import { readMetadata } from "./metadata.ts"
import { directoryAnchor, openRoot, readBytes, type NativeRoot } from "./owner.ts"
import { nativeBool, nativeDword, nativeFailure, nativeHandle, snapshot } from "./observation.ts"

export class ManagedFileUnavailable extends Schema.TaggedError<ManagedFileUnavailable, { readonly brand: unique symbol }>()(
  "ManagedFileUnavailable", { cause: Schema.Defect() }
) {}

export class WindowsManagedFiles extends Context.Service<WindowsManagedFiles, {
  readonly readFile: (path: string, maximumBytes?: number) => Effect.Effect<Snapshot, ManagedFileUnavailable>
  readonly writeFile: (path: string, before: FileBasis, bytes: Uint8Array, maximumBytes?: number) => Effect.Effect<void, ManagedFileUnavailable>
  readonly removeFile: (path: string, before: typeof WindowsFileBasis.Type, maximumBytes?: number) => Effect.Effect<void, ManagedFileUnavailable>
}>()("pluginsdk/WindowsManagedFiles") {}

const FILE_BASIC_INFO = 0
const FILE_RENAME_INFO = 3
const FILE_DISPOSITION_INFO = 4
const platform = RuntimePlatform.make("win32")
const decodePath = Schema.decodeSync(PackagePath)
const Metadata = Schema.Struct({ attributes: WindowsFileAttributes, security: FileDigest, streams: Streams })
const sameMetadata = Schema.toEquivalence(Metadata)
const sameWindowsBasis = Schema.toEquivalence(WindowsFileBasis)
const unavailable = (cause: unknown) => new ManagedFileUnavailable({ cause })
const io = <A>(operation: () => A) => Effect.try({ try: operation, catch: unavailable })
const wide = (value: string): Uint8Array => Buffer.from(value + "\0", "utf16le")

type Directory = {
  readonly api: FileApi
  readonly drive: NativeRoot
  readonly anchor: Files.Anchor
  readonly relative: string
  readonly observe: () => Files.Observation
}

type Captured =
  | (Extract<Snapshot, { readonly bytes: null }> & { readonly descriptor: null })
  | (Extract<Snapshot, { readonly bytes: Uint8Array }> & { readonly descriptor: Uint8Array })

const windowsBasis = (observed: Observation): typeof WindowsFileBasis.Type =>
  Match.value(admitProjectFile({ platform, observed })).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ reason }) => { throw new Error(`Native file observation blocked: ${reason}`) },
    ready: ({ basis }) => Match.value(basis).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => { throw new Error("Expected a staged or published Windows file") },
      file: () => { throw new Error("Expected native Windows metadata") },
      windows_file: (basis) => basis
    }))
  }))

const nativeName = (directory: Directory, name: string): string => {
  directory.drive.admit(decodePath(directory.relative === "" ? name : directory.relative + "/" + name))
  return directory.anchor.path + (directory.anchor.path.endsWith("\\") ? "" : "\\") + name
}

const openFile = (api: FileApi, name: string, access = 0x8000_0000, share = 3): bigint | null => {
  const result: unknown = api.createFile(wide(name), access, share, null, 3, 0x0220_0000, null)
  if (result === -1n || result === 0xffff_ffff_ffff_ffffn) {
    const code = nativeDword("CreateFileW GetLastError", api.error())
    if (code === 2 || code === 3) return null
    throw new Error(`CreateFileW failed with Win32 error ${code}`)
  }
  return nativeHandle("CreateFileW", result)
}

const close = (api: FileApi, handle: bigint): void => {
  if (!nativeBool("CloseHandle", api.close(handle))) throw nativeFailure(api, "CloseHandle")
}

const withDirectory = <A, E, R>(api: FileApi, path: string, use: (directory: Directory | null, name: string) => Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.gen(function*() {
    const location = yield* io(() => {
      const root = win32.parse(path).root
      if (!path.isWellFormed() || path.includes("\0") || !/^[A-Za-z]:\\$/.test(root) || win32.normalize(path) !== path || path === root) {
        throw new Error("Managed file requires a canonical ordinary DOS drive path")
      }
      const relative = win32.relative(root, win32.dirname(path))
      return { root, segments: relative === "" ? [] : relative.split("\\"), name: win32.basename(path) }
    })
    const drive = yield* Effect.acquireRelease(io(() => openRoot(api, location.root)), (drive) => Effect.sync(drive.close))
    yield* io(() => {
      Match.value(parseFinalPath(drive.anchor.path)).pipe(Match.discriminatorsExhaustive("type")({
        plain: ({ path }) => {
          if (path.components.length !== 0) throw new Error("Managed file drive alias is unsupported")
        },
        stream: () => { throw new Error("Managed file drive has stream syntax") },
        unsupported: () => { throw new Error("Managed file drive did not resolve to a Volume GUID") }
      }))
      drive.admit(decodePath([...location.segments, location.name].join("/")))
    })
    let parent: Directory = { api, drive, anchor: drive.anchor, relative: "", observe: () => drive.file.snapshot().observation }
    for (const [index, segment] of location.segments.entries()) {
      const relative = location.segments.slice(0, index + 1).join("/")
      const expected = nativeName(parent, segment)
      const handle = yield* Effect.acquireRelease(io(() => openFile(api, expected)), (handle) =>
        handle === null ? Effect.void : Effect.sync(() => close(api, handle)))
      if (handle === null) return yield* use(null, location.name)
      const anchor = yield* io(() => {
        const anchor = directoryAnchor(snapshot(api, handle).observation)
        if (anchor.path !== expected) throw new Error("Managed file directory is not physical and canonical")
        return anchor
      })
      parent = { api, drive, anchor, relative, observe: () => snapshot(api, handle).observation }
    }
    return yield* use(parent, location.name)
  }))

const info = (api: FileApi, handle: bigint, kind: number, size: number): Buffer => {
  const data = Buffer.alloc(size)
  if (!nativeBool("GetFileInformationByHandleEx", api.info(handle, kind, data, size))) {
    throw nativeFailure(api, "GetFileInformationByHandleEx")
  }
  return data
}

const regularFile = (observed: Files.Observation, expected: string): Files.FileInfo =>
  Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
    file: ({ info }) => {
      if (info.path !== expected) throw new Error("Managed file is not physical and canonical")
      return info
    },
    directory: () => { throw new Error("Managed file is a directory") },
    other: () => { throw new Error("Managed file is a reparse point or special file") },
    unavailable: () => { throw new Error("Managed file observation is unavailable") }
  }))

function metadata(api: FileApi, handle: bigint, file: Files.FileInfo) {
  const captured = readMetadata(api, handle)
  const [stream, ...additional] = captured.observed.streams
  if (stream === undefined) throw new Error("Native regular file has no stream inventory")
  const defaultOnly = additional.length === 0 && stream.name === "::$DATA"
  if (defaultOnly && stream.size !== file.size) throw new Error("Native file stream size changed")
  return {
    descriptor: captured.descriptor,
    observed: {
      attributes: captured.observed.attributes,
      security: captured.observed.security,
      streams: defaultOnly ? "default_only" : "additional"
    } satisfies typeof Metadata.Type
  }
}

function readHandle(directory: Directory, handle: bigint, expected: string, maximumBytes: number): Captured {
  const { api } = directory
  if (nativeDword("GetFileType", api.type(handle)) !== 1) throw new Error("Managed file is not a disk file")
  const before = { root: directory.observe(), file: snapshot(api, handle).observation }
  const beforeFile = regularFile(before.file, expected)
  if (BigInt(beforeFile.size) > BigInt(maximumBytes)) throw new Error("Native file exceeds its byte limit")
  const beforeMetadata = metadata(api, handle, beforeFile)
  const bytes = readBytes(api, handle, maximumBytes)
  const after = { root: directory.observe(), file: snapshot(api, handle).observation }
  const afterFile = regularFile(after.file, expected)
  const afterMetadata = metadata(api, handle, afterFile)
  const decision = admitRead({ root: directory.anchor, before, after,
    read: { type: "complete", length: Files.Quantity.make(bytes.length.toString()) } })
  if (decision !== "accepted" || !sameMetadata(beforeMetadata.observed, afterMetadata.observed)) {
    throw new Error("Managed file changed during inspection")
  }
  return { descriptor: beforeMetadata.descriptor, observed: { type: "windows_file", digest: fileDigest(bytes), ...beforeMetadata.observed }, bytes }
}

const absent = (): Captured => ({ observed: { type: "absent" }, bytes: null, descriptor: null })

function readAt(directory: Directory, name: string, maximumBytes: number): Captured {
  const expected = nativeName(directory, name)
  const handle = openFile(directory.api, expected)
  if (handle === null) return absent()
  try { return readHandle(directory, handle, expected, maximumBytes) } finally { close(directory.api, handle) }
}

const requireReview = (captured: Captured, reviewed: FileBasis): void =>
  Match.value(reviewProjectFile({ current: { platform, observed: captured.observed }, reviewed })).pipe(
    Match.discriminatorsExhaustive("type")({
      ready: () => undefined,
      blocked: ({ reason }) => { throw new Error(`Native file review blocked: ${reason}`) }
    })
  )

const setInfo = (api: FileApi, handle: bigint, kind: number, data: Uint8Array): void => {
  if (!nativeBool("SetFileInformationByHandle", api.setInfo(handle, kind, data, data.length))) {
    throw nativeFailure(api, "SetFileInformationByHandle")
  }
}

const flush = (api: FileApi, handle: bigint): void => {
  if (!nativeBool("FlushFileBuffers", api.flush(handle))) throw nativeFailure(api, "FlushFileBuffers")
}

const validateLimit = (maximumBytes: number): void => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new Error("Native file byte limit is invalid")
}

export const makeWindowsManagedFiles = (api: FileApi) => WindowsManagedFiles.of({
  readFile: Effect.fn("WindowsManagedFile.read")(function*(path: string, maximumBytes = Number.MAX_SAFE_INTEGER) {
    yield* io(() => validateLimit(maximumBytes))
    return yield* withDirectory(api, path, (directory, name) => io(() => {
      const captured = directory === null ? absent() : readAt(directory, name, maximumBytes)
      return captured.bytes === null
        ? { observed: captured.observed, bytes: null }
        : { observed: captured.observed, bytes: captured.bytes }
    }))
  }),

  writeFile: Effect.fn("WindowsManagedFile.write")(function*(path: string, before: FileBasis, bytes: Uint8Array, maximumBytes = Number.MAX_SAFE_INTEGER) {
    yield* io(() => {
      validateLimit(maximumBytes)
      if (bytes.length > maximumBytes) throw new Error("Native file exceeds its byte limit")
    })
    yield* withDirectory(api, path, (directory, name) => Effect.gen(function*() {
      if (directory === null) return yield* unavailable(new Error("Managed file directory is unavailable"))
      const { api } = directory
      const initial = yield* io(() => {
        const initial = readAt(directory, name, maximumBytes)
        requireReview(initial, before)
        return initial
      })
      let publicationStarted = false
      const stagedName = yield* io(() => nativeName(directory, `.${randomUUID()}.psdk-file.tmp`))
      const handle = yield* Effect.acquireRelease(io(() => {
        const attributes = Match.value(before).pipe(Match.discriminatorsExhaustive("type")({
          absent: () => 0x80,
          windows_file: ({ attributes }) => attributes,
          file: () => { throw new Error("POSIX metadata was passed to the Windows backend") }
        }))
        const access = 0xc001_0000 + (initial.descriptor === null ? 0 : 0x0004_0000)
        const result: unknown = api.createFile(wide(stagedName), access, 1, initial.descriptor, 1, 0x0220_0000 | attributes, null)
        if (result === -1n || result === 0xffff_ffff_ffff_ffffn) throw nativeFailure(api, "CreateFileW staging")
        return nativeHandle("CreateFileW staging", result)
      }), (handle) => Effect.sync(() => {
        try {
          if (!publicationStarted) setInfo(api, handle, FILE_DISPOSITION_INFO, Uint8Array.of(1))
        } finally { close(api, handle) }
      }))
      yield* io(() => {
        if (initial.descriptor !== null) api.setSecurity(handle, initial.descriptor)
        const empty = windowsBasis(readHandle(directory, handle, stagedName, maximumBytes).observed)
        if (before.type === "windows_file" && empty.security !== before.security) throw new Error("Native staging DACL could not be preserved")
        let offset = 0
        while (offset < bytes.length) {
          const part = bytes.subarray(offset, offset + 65_536)
          const count = Buffer.alloc(4)
          if (!nativeBool("WriteFile", api.write(handle, part, part.length, count, null))) throw nativeFailure(api, "WriteFile")
          const written = count.readUInt32LE(0)
          if (written === 0 || written > part.length) throw new Error("Native file write returned an invalid byte count")
          offset += written
        }
        if (before.type === "windows_file") {
          const basic = info(api, handle, FILE_BASIC_INFO, 40)
          basic.writeUInt32LE(before.attributes, 32)
          setInfo(api, handle, FILE_BASIC_INFO, basic)
        }
        flush(api, handle)
        const admitted = windowsBasis(readHandle(directory, handle, stagedName, maximumBytes).observed)
        if (admitted.digest !== fileDigest(bytes) ||
          (before.type === "windows_file" && (admitted.attributes !== before.attributes || admitted.security !== before.security))) {
          throw new Error("Native staging metadata or content changed")
        }
        requireReview(readAt(directory, name, maximumBytes), before)
        const rename = encodeFileRename({
          name: nativeName(directory, name), root: null, replace: before.type !== "absent"
        })
        publicationStarted = true
        setInfo(api, handle, FILE_RENAME_INFO, rename)
        flush(api, handle)
        const published = readHandle(directory, handle, nativeName(directory, name), maximumBytes)
        if (!sameWindowsBasis(windowsBasis(published.observed), admitted)) throw new Error("Published native file changed")
      })
    })).pipe(Effect.uninterruptible)
  }),

  removeFile: Effect.fn("WindowsManagedFile.remove")(function*(path: string, before: typeof WindowsFileBasis.Type, maximumBytes = Number.MAX_SAFE_INTEGER) {
    yield* io(() => validateLimit(maximumBytes))
    yield* withDirectory(api, path, (directory, name) => Effect.gen(function*() {
      if (directory === null) return yield* unavailable(new Error("Managed file directory is unavailable"))
      const { api } = directory
      yield* Effect.scoped(Effect.gen(function*() {
        const handle = yield* Effect.acquireRelease(io(() => {
          const handle = openFile(api, nativeName(directory, name), 0x8001_0000, 1)
          if (handle === null) throw new Error("Reviewed native file is absent")
          return handle
        }), (handle) => Effect.sync(() => close(api, handle)))
        yield* io(() => {
          requireReview(readHandle(directory, handle, nativeName(directory, name), maximumBytes), before)
          setInfo(api, handle, FILE_DISPOSITION_INFO, Uint8Array.of(1))
        })
      }))
      yield* io(() => {
        if (readAt(directory, name, maximumBytes).observed.type !== "absent") throw new Error("Native file name is present after reviewed removal")
      })
    })).pipe(Effect.uninterruptible)
  })
})

export const WindowsManagedFilesLive = Layer.effect(WindowsManagedFiles,
  Effect.map(Effect.tryPromise({ try: getFileApi, catch: unavailable }), makeWindowsManagedFiles)
)
