import { win32 } from "node:path"
import { Match, Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import * as Trees from "../../../contracts/TreeRead.ts"
import * as Windows from "../../../contracts/WindowsPath.ts"
import { parseFinalPath } from "../files/file.ts"
import { admitEntry } from "../files/tree.ts"
import { classifyWindowsPath, deriveWindowsPathCapacity } from "./path.ts"
import { encodeFileRename, type FileApi } from "./api.ts"
import { enumerate } from "./directory.ts"
import { readMetadata, type Metadata } from "./metadata.ts"
import { COUNTED_NAME_BUFFER_UNITS, FINAL_NAME_BUFFER_UNITS, finalName, nativeBool, nativeDword,
  nativeFailure, nativeHandle, snapshot, volume, type NativeSnapshot } from "./observation.ts"

export interface NativeFile {
  readonly snapshot: () => NativeSnapshot
  readonly metadata: () => Metadata
  readonly enumerate: () => Trees.Enumeration
  readonly read: () => Uint8Array
  readonly ntName: () => Files.FinalPath
  readonly volume: () => ReturnType<typeof volume>
  readonly close: () => void
}

export interface NativeRoot {
  readonly anchor: Files.Anchor
  readonly file: NativeFile
  readonly open: (path: PackagePath, mode?: "entry" | "target") => NativeFile
  readonly lookup: (path: PackagePath) => NativeFile | null
  readonly admit: (path: PackagePath) => void
  readonly directory: (path: PackagePath) => { readonly file: NativeFile; readonly created: boolean }
  readonly create: (path: PackagePath) => NativeCreatedFile
  readonly moveDirectory: (from: PackagePath, to: PackagePath, expected: Files.Identity) => Files.Anchor
  readonly close: () => void
}

export interface NativeCreatedFile {
  readonly file: NativeFile
  readonly write: (bytes: Uint8Array) => void
  readonly flush: () => void
}

export class NativePathRefused extends Schema.TaggedError<NativePathRefused, { readonly brand: unique symbol }>()(
  "NativePathRefused", {
    path: PackagePath,
    reason: Schema.Literals(Windows.PathDecision.literals.filter((decision) => decision !== "accepted"))
  }
) {
  override get message(): string { return `Native Windows path refused: ${this.reason}` }
}

const RootPath = Files.FinalPath.check(Schema.makeFilter(win32.isAbsolute, { expected: "an absolute Windows root" }))
const sameAnchor = Schema.toEquivalence(Files.Anchor)
const sameIdentity = Schema.toEquivalence(Files.Identity)
const AcquisitionMode = Schema.Literals(["entry", "lookup", "target", "create", "move", "probe"])
type AcquisitionMode = typeof AcquisitionMode.Type
const MoveOutcome = Schema.Union([
  Schema.Struct({ type: Schema.Literal("success"), anchor: Files.Anchor }),
  Schema.Struct({ type: Schema.Literal("failure"), cause: Schema.Defect() })
]).pipe(Schema.toTaggedUnion("type"))
const inputBufferUnits = Windows.UnitCapacity.make(32_767)
const ntNormalizationBufferUnits = Windows.UnitCapacity.make(32_768)
const wide = (value: string): Buffer => Buffer.from(value + "\0", "utf16le")
const FILE_RENAME_INFO = 3

interface AcquiredFile {
  readonly resource: NativeCreatedFile
  readonly handle: bigint
}

interface DirectoryBranch {
  readonly anchor: Files.Anchor
  readonly ancestors: ReadonlyArray<Files.Anchor>
}

export const directoryAnchor = (observation: Files.Observation): Files.Anchor =>
  Match.value(observation).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => anchor,
    file: () => { throw new Error("Native root or branch is not a directory") },
    other: () => { throw new Error("Native root or branch is a reparse point or special file") },
    unavailable: () => { throw new Error("Native directory observation is unavailable") }
  }))

export function readBytes(api: FileApi, handle: bigint, maximumBytes = Number.MAX_SAFE_INTEGER): Uint8Array {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new Error("Native read byte limit is invalid")
  const position = Buffer.alloc(8)
  if (!nativeBool("SetFilePointerEx", api.seek(handle, 0n, position, 0))) throw nativeFailure(api, "SetFilePointerEx")
  if (position.readBigInt64LE(0) !== 0n) throw new Error("Native read did not reset its file position")
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const buffer = Buffer.alloc(1024)
    const count = Buffer.alloc(4)
    if (!nativeBool("ReadFile", api.read(handle, buffer, buffer.length, count, null))) throw nativeFailure(api, "ReadFile")
    const bytes = count.readUInt32LE(0)
    if (bytes > buffer.length || !Number.isSafeInteger(total + bytes)) throw new Error("Native read returned an invalid byte count")
    if (total + bytes > maximumBytes) throw new Error("Native file exceeds its byte limit")
    if (bytes === 0) return new Uint8Array(Buffer.concat(parts, total))
    parts.push(Buffer.from(buffer.subarray(0, bytes)))
    total += bytes
  }
}

export function openRoot(api: FileApi, requestedRoot: string): NativeRoot {
  const path = Schema.decodeSync(RootPath)(requestedRoot)
  const resources = new Set<NativeFile>()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    const failures: unknown[] = []
    for (const file of [...resources].reverse()) {
      try { file.close() } catch (cause) { failures.push(cause) }
    }
    if (failures.length !== 0) throw new AggregateError(failures, "Could not release native Windows files")
  }

  const acquire = (
    name: string,
    mode: AcquisitionMode,
    onAcquired?: (acquired: AcquiredFile) => void
  ): AcquiredFile | null => {
    if (closed) throw new Error("Native Windows root is closed")
    const acquisition = Match.value(mode).pipe(
      Match.when("entry", () => ({ access: 0x8000_0000, share: 3, disposition: 3, flags: 0x0220_0000,
        reports: false, absentOn: null })),
      Match.when("lookup", () => ({ access: 0x8000_0000, share: 3, disposition: 3, flags: 0x0220_0000,
        reports: true, absentOn: 2 })),
      Match.when("target", () => ({ access: 0x8000_0000, share: 3, disposition: 3, flags: 0x0200_0000,
        reports: false, absentOn: null })),
      Match.when("create", () => ({ access: 0xc000_0000, share: 1, disposition: 1, flags: 0x0020_0080,
        reports: false, absentOn: null })),
      Match.when("move", () => ({ access: 0x8001_0000, share: 1, disposition: 3, flags: 0x0220_0000,
        reports: true, absentOn: null })),
      Match.when("probe", () => ({ access: 0x0000_0080, share: 7, disposition: 3, flags: 0x0220_0000,
        reports: true, absentOn: 2 })),
      Match.exhaustive
    )
    const result: unknown = api.createFile(wide(name), acquisition.access, acquisition.share, null,
      acquisition.disposition, acquisition.flags, null)
    if (acquisition.reports && (result === -1n || result === 0xffff_ffff_ffff_ffffn)) {
      const error = nativeDword("CreateFileW GetLastError", api.error())
      if (acquisition.absentOn === error) return null
      throw new Error(`CreateFileW failed with Win32 error ${error}`)
    }
    const handle = nativeHandle("CreateFileW", result)
    let live = true
    const requireLive = () => {
      if (closed || !live) throw new Error("Native Windows file is closed")
    }
    const file: NativeFile = Object.freeze({
      snapshot: () => { requireLive(); return snapshot(api, handle) },
      metadata: () => { requireLive(); return readMetadata(api, handle) },
      enumerate: () => { requireLive(); return enumerate(api, handle) },
      read: () => { requireLive(); return readBytes(api, handle) },
      ntName: () => { requireLive(); return finalName(api, handle, 2) },
      volume: () => { requireLive(); return volume(api, handle) },
      close: () => {
        if (!live) return
        if (!nativeBool("CloseHandle", api.close(handle))) throw nativeFailure(api, "CloseHandle")
        live = false
        resources.delete(file)
      }
    })
    resources.add(file)
    const resource = Object.freeze({
      file,
      write: (bytes: Uint8Array) => {
        requireLive()
        let offset = 0
        while (offset < bytes.length) {
          const part = bytes.subarray(offset, offset + 65_536)
          const count = Buffer.alloc(4)
          if (!nativeBool("WriteFile", api.write(handle, part, part.length, count, null))) throw nativeFailure(api, "WriteFile")
          const written = count.readUInt32LE(0)
          if (written === 0 || written > part.length) throw new Error("Native write returned an invalid byte count")
          offset += written
        }
      },
      flush: () => {
        requireLive()
        if (!nativeBool("FlushFileBuffers", api.flush(handle))) throw nativeFailure(api, "FlushFileBuffers")
      }
    })
    const acquired = { resource, handle }
    onAcquired?.(acquired)
    if (nativeDword("GetFileType", api.type(handle)) !== 1) throw new Error("Native Windows file is not a disk resource")
    return acquired
  }

  const requireAcquired = (acquired: AcquiredFile | null): AcquiredFile => {
    if (acquired === null) throw new Error("Required native Windows entry is absent")
    return acquired
  }

  try {
    const rootResource = requireAcquired(acquire(win32.toNamespacedPath(path), "entry"))
    const file = rootResource.resource.file
    const initial = file.snapshot()
    const anchor = directoryAnchor(initial.observation)
    Match.value(parseFinalPath(anchor.path)).pipe(Match.discriminatorsExhaustive("type")({
      plain: () => undefined,
      stream: () => { throw new Error("Native root has alternate-stream syntax") },
      unsupported: () => { throw new Error("Native root did not supply a Volume GUID path") }
    }))
    const capacity = (): Windows.PathCapacity => {
      const observed = file.snapshot()
      if (!sameAnchor(anchor, directoryAnchor(observed.observation))) throw new Error("Retained native root changed")
      const info = file.volume()
      if (info.fileSystem !== "NTFS" || info.maxComponentUnits === 0) throw new Error("Native Windows volume is not qualified")
      const view = (root: Files.FinalPath, limit: number): Windows.RootPathView =>
        ({ root, maxPathBufferUnits: Windows.UnitCapacity.make(limit) })
      return Match.value(deriveWindowsPathCapacity({ maxComponentUnits: info.maxComponentUnits, views: [
        { root: observed.names.normalizedGUID, maxPathBufferUnits: inputBufferUnits },
        view(observed.names.normalizedGUID, FINAL_NAME_BUFFER_UNITS),
        view(observed.names.openedGUID, FINAL_NAME_BUFFER_UNITS),
        { root: file.ntName(), maxPathBufferUnits: ntNormalizationBufferUnits },
        view(observed.names.volumeOpened, COUNTED_NAME_BUFFER_UNITS + 1),
        view(observed.names.volumeNormalized, COUNTED_NAME_BUFFER_UNITS + 1)
      ] })).pipe(Match.discriminatorsExhaustive("type")({
        refused: () => { throw new Error("Native Windows root exceeds its name capacity") },
        available: ({ capacity }) => capacity
      }))
    }
    capacity()
    const checkedName = (path: PackagePath): string => {
      const refuse = (reason: NativePathRefused["reason"]): never => { throw new NativePathRefused({ path, reason }) }
      return Match.value(classifyWindowsPath({ path, capacity: capacity() })).pipe(
        Match.when("accepted", () => anchor.path + (anchor.path.endsWith("\\") ? "" : "\\") + path.replaceAll("/", "\\")),
        Match.when("syntax", refuse),
        Match.when("device", refuse),
        Match.when("component_limit", refuse),
        Match.when("path_limit", refuse),
        Match.exhaustive
      )
    }

    const moveDirectory = (from: PackagePath, to: PackagePath, expected: Files.Identity): Files.Anchor => {
      const sourceName = checkedName(from)
      const destinationName = checkedName(to)
      if (from === to) throw new Error("Native directory move source and destination paths are identical")

      const operationResources: AcquiredFile[] = []
      let outcome: typeof MoveOutcome.Type
      try {
        const track = (acquired: AcquiredFile) => { operationResources.push(acquired) }
        const rootBranch: DirectoryBranch = {
          anchor, ancestors: []
        }
        const branchFor = (segments: ReadonlyArray<string>): DirectoryBranch => {
          let parent = rootBranch
          for (const [index, segment] of segments.entries()) {
            const logical = PackagePath.make(segments.slice(0, index + 1).join("/"))
            const acquired = requireAcquired(acquire(checkedName(logical), "entry", track))
            const observed = acquired.resource.file.snapshot()
            const decision = admitEntry({ policy: "payload", root: anchor,
              branch: { parent: parent.anchor, ancestors: parent.ancestors }, name: Files.Component.make(segment),
              entry: observed.entry, target: observed.observation })
            if (decision !== "accepted") throw new Error(`Native directory move parent refused: ${decision}`)
            const branchAnchor = directoryAnchor(observed.observation)
            parent = { anchor: branchAnchor,
              ancestors: [parent.anchor, ...parent.ancestors] }
          }
          return parent
        }
        const admittedDirectory = (
          acquired: AcquiredFile,
          parent: DirectoryBranch,
          name: Files.Component
        ): Files.Anchor => {
          const observed = acquired.resource.file.snapshot()
          const branchAnchor = directoryAnchor(observed.observation)
          if (!sameIdentity(expected, branchAnchor.identity)) throw new Error("Native directory move source identity changed")
          const decision = admitEntry({ policy: "payload", root: anchor,
            branch: { parent: parent.anchor, ancestors: parent.ancestors }, name,
            entry: observed.entry, target: observed.observation })
          if (decision !== "accepted") throw new Error(`Native directory move entry refused: ${decision}`)
          return branchAnchor
        }
        const sourceParts = from.split("/")
        const destinationParts = to.split("/")
        const sourceLeaf = sourceParts.at(-1)
        const destinationLeaf = destinationParts.at(-1)
        if (sourceLeaf === undefined || destinationLeaf === undefined) throw new Error("Native directory move path is empty")
        const sourceParent = branchFor(sourceParts.slice(0, -1))
        const destinationParent = branchFor(destinationParts.slice(0, -1))
        const sourceProbe = requireAcquired(acquire(sourceName, "entry", track))
        const sourceAnchor = admittedDirectory(sourceProbe, sourceParent, Files.Component.make(sourceLeaf))
        const destinationInsideSource = [destinationParent.anchor, ...destinationParent.ancestors].some(({ identity }) =>
          sameIdentity(identity, sourceAnchor.identity))
        if (destinationInsideSource) throw new Error("Native directory move destination is inside its source")

        const destinationProbe = acquire(destinationName, "probe", track)
        if (destinationProbe !== null) {
          const observed = destinationProbe.resource.file.snapshot()
          const identity = Match.value(observed.observation).pipe(Match.discriminatorsExhaustive("type")({
            directory: ({ anchor: target }) => target.identity,
            file: ({ info: target }) => target.identity,
            other: () => null,
            unavailable: () => null
          }))
          if (identity !== null && sameIdentity(identity, sourceAnchor.identity)) {
            throw new Error("Native directory move source and destination resolve to the same entry")
          }
          throw new Error("Native directory move destination already exists")
        }

        sourceProbe.resource.file.close()
        const source = requireAcquired(acquire(sourceName, "move", track))
        admittedDirectory(source, sourceParent, Files.Component.make(sourceLeaf))
        capacity()
        const rename = encodeFileRename({ name: destinationName, root: null, replace: false })
        if (!nativeBool("SetFileInformationByHandle", api.setInfo(source.handle, FILE_RENAME_INFO, rename, rename.length))) {
          throw nativeFailure(api, "SetFileInformationByHandle")
        }
        const published = source.resource.file.snapshot()
        const publishedAnchor = directoryAnchor(published.observation)
        if (!sameIdentity(expected, publishedAnchor.identity)) throw new Error("Published native directory identity changed")
        const decision = admitEntry({ policy: "payload", root: anchor,
          branch: { parent: destinationParent.anchor, ancestors: destinationParent.ancestors },
          name: Files.Component.make(destinationLeaf), entry: published.entry, target: published.observation })
        if (decision !== "accepted") throw new Error(`Published native directory refused: ${decision}`)
        outcome = MoveOutcome.make({ type: "success", anchor: publishedAnchor })
      } catch (cause) {
        outcome = MoveOutcome.make({ type: "failure", cause })
      }

      const closeFailures: unknown[] = []
      for (const acquired of [...operationResources].reverse()) {
        try { acquired.resource.file.close() } catch (cause) { closeFailures.push(cause) }
      }
      return Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
        failure: ({ cause }) => {
          if (closeFailures.length !== 0) {
            throw new AggregateError([cause, ...closeFailures], "Native directory move and handle release failed")
          }
          throw cause
        },
        success: ({ anchor }) => {
          if (closeFailures.length !== 0) {
            throw new AggregateError(closeFailures, "Could not release native directory move handles")
          }
          return anchor
        }
      }))
    }

    return Object.freeze({
      anchor, file, close, moveDirectory,
      open: (path: PackagePath, mode: "entry" | "target" = "entry") =>
        requireAcquired(acquire(checkedName(path), mode)).resource.file,
      lookup: (path: PackagePath) => {
        const acquired = acquire(checkedName(path), "lookup")
        return acquired === null ? null : acquired.resource.file
      },
      admit: (path: PackagePath) => { checkedName(path) },
      create: (path: PackagePath) => requireAcquired(acquire(checkedName(path), "create")).resource,
      directory: (path: PackagePath) => {
        const name = checkedName(path)
        const created = nativeBool("CreateDirectoryW", api.createDirectory(wide(name), null))
        if (!created) {
          const error = nativeDword("GetLastError", api.error())
          if (error !== 183) throw new Error(`CreateDirectoryW failed with Win32 error ${error}`)
        }
        return { file: requireAcquired(acquire(name, "entry")).resource.file, created }
      }
    })
  } catch (cause) {
    try { close() } catch (cleanup) { throw new AggregateError([cause, cleanup], "Native root acquisition and release failed") }
    throw cause
  }
}
