import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, open, realpath, rename, unlink } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve, sep } from "node:path"
import { Match } from "effect"
import type { FileBasis } from "../../../../contracts/ProjectConfig.ts"
import type { Observation } from "../../../../contracts/ProjectFile.ts"
import { RuntimePlatform } from "../../../../contracts/Compatibility.ts"
import { fileDigest } from "../../../internal/identity.ts"
import { syncDirectory } from "../../../internal/storage.ts"
import { reviewProjectFile } from "../../../internal/files/ownership.ts"
import type { FileSnapshot, ProjectPaths } from "./file.ts"

type TemporaryIdentity = {
  readonly dev: bigint
  readonly ino: bigint
}

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"

const isCanonicalAbsolutePath = (path: string): boolean =>
  path.length > 0 && !path.includes("\0") && isAbsolute(path) && resolve(path) === path

const physicalDirectory = async (path: string): Promise<boolean> => {
  if (!isCanonicalAbsolutePath(path)) throw new Error("Project config path is not canonical")

  let current: string = sep
  const root = await lstat(current)
  if (root.isSymbolicLink() || !root.isDirectory() || await realpath(current) !== current) {
    throw new Error("Project config requires physical directories")
  }

  for (const segment of path.slice(sep.length).split(sep).filter((part) => part.length > 0)) {
    current = join(current, segment)
    let info
    try {
      info = await lstat(current)
    } catch (cause) {
      if (isMissing(cause)) return false
      throw cause
    }
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(current) !== current) {
      throw new Error("Project config requires physical directories")
    }
  }
  return true
}

const requireReview = (observed: Observation, reviewed: FileBasis): void =>
  Match.value(reviewProjectFile({
    current: { platform: RuntimePlatform.make("linux"), observed },
    reviewed
  })).pipe(Match.discriminatorsExhaustive("type")({
    blocked: () => { throw new Error("Project config changed after review") },
    ready: () => undefined
  }))

export const readSnapshot = async ({ root, directory, file: path }: ProjectPaths): Promise<FileSnapshot> => {
  if (!await physicalDirectory(root)) return { observed: { type: "absent" }, bytes: null }
  if (!await physicalDirectory(directory)) return { observed: { type: "absent" }, bytes: null }

  let beforePath
  try {
    beforePath = await lstat(path, { bigint: true })
  } catch (cause) {
    if (isMissing(cause)) return { observed: { type: "absent" }, bytes: null }
    throw cause
  }
  if (beforePath.isSymbolicLink() || !beforePath.isFile()) {
    throw new Error("Project config is not a regular file")
  }
  if (await realpath(path) !== path) throw new Error("Project config path crosses a symbolic link")

  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat({ bigint: true })
    if (
      !before.isFile() || before.dev !== beforePath.dev || before.ino !== beforePath.ino ||
      await realpath(`/proc/self/fd/${file.fd}`) !== path
    ) throw new Error("Project config changed while opening")

    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    const afterPath = await lstat(path, { bigint: true })
    if (
      !after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || before.mode !== after.mode ||
      BigInt(bytes.byteLength) !== before.size || afterPath.isSymbolicLink() ||
      afterPath.dev !== after.dev || afterPath.ino !== after.ino || afterPath.size !== after.size ||
      afterPath.mtimeNs !== after.mtimeNs || afterPath.ctimeNs !== after.ctimeNs || afterPath.mode !== after.mode ||
      await realpath(`/proc/self/fd/${file.fd}`) !== path || await realpath(path) !== path
    ) throw new Error("Project config changed during inspection")

    const mode = Number(before.mode & 0o7777n)
    const observed: Observation = { type: "file", digest: fileDigest(bytes), mode }
    return { observed, bytes: new Uint8Array(bytes) }
  } finally {
    await file.close()
  }
}

const temporaryPath = (path: string): string =>
  join(dirname(path), `.${randomUUID()}.psdk-project.tmp`)

const removeOwnedTemporary = async (path: string, identity: TemporaryIdentity): Promise<void> => {
  try {
    const current = await lstat(path, { bigint: true })
    if (!current.isFile() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) return
    await unlink(path)
  } catch (cause) {
    if (!isMissing(cause)) throw cause
  }
}

const writeTemporary = async (path: string, bytes: Uint8Array, mode: number): Promise<TemporaryIdentity> => {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode)
  let identity: TemporaryIdentity | null = null
  let failure: { readonly cause: unknown } | null = null
  try {
    const opened = await file.stat({ bigint: true })
    identity = { dev: opened.dev, ino: opened.ino }
    await file.writeFile(bytes)
    await file.chmod(mode)
    const staged = await file.stat({ bigint: true })
    if (!staged.isFile() || staged.dev !== identity.dev || staged.ino !== identity.ino || Number(staged.mode & 0o7777n) !== mode) {
      throw new Error("Project config staging mode could not be preserved")
    }
    await file.sync()
  } catch (cause) {
    failure = { cause }
  }
  try {
    await file.close()
  } catch (cause) {
    if (failure === null) failure = { cause }
  }
  if (failure !== null) {
    if (identity !== null) await removeOwnedTemporary(path, identity)
    throw failure.cause
  }
  if (identity === null) throw new Error("Project config staging identity is unavailable")
  return identity
}

export const replace = async (paths: ProjectPaths, before: FileBasis, bytes: Uint8Array): Promise<void> => {
  if (!await physicalDirectory(paths.root) || !await physicalDirectory(paths.directory)) {
    throw new Error("Project config directory is unavailable")
  }

  const initial = await readSnapshot(paths)
  requireReview(initial.observed, before)

  const mode = Match.value(before).pipe(Match.discriminatorsExhaustive("type")({
    absent: () => 0o600,
    file: ({ mode }) => mode,
    windows_file: () => { throw new Error("Windows file metadata was passed to the POSIX backend") }
  }))
  const temporary = temporaryPath(paths.file)
  let identity: TemporaryIdentity | null = null
  try {
    identity = await writeTemporary(temporary, bytes, mode)
    const stagedPath = await lstat(temporary, { bigint: true })
    if (
      stagedPath.isSymbolicLink() || !stagedPath.isFile() ||
      stagedPath.dev !== identity.dev || stagedPath.ino !== identity.ino
    ) throw new Error("Project config staging file changed before commit")

    const current = await readSnapshot(paths)
    requireReview(current.observed, before)

    if (before.type === "absent") {
      await link(temporary, paths.file)
      await unlink(temporary)
    } else {
      await rename(temporary, paths.file)
    }
    identity = null
    await syncDirectory(paths.directory)
  } finally {
    if (identity !== null) await removeOwnedTemporary(temporary, identity)
  }
}
