import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, open, realpath, rename, unlink } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { Match } from "effect"
import { RuntimePlatform } from "../../../contracts/Compatibility.ts"
import type { Basis as CompanionBasis } from "../../../contracts/CompanionFile.ts"
import type { Snapshot } from "../../../contracts/ProjectFile.ts"
import { fileDigest } from "../../internal/identity.ts"
import { syncDirectory } from "../../internal/storage.ts"
import { reviewCompanionFile } from "./file-policy.ts"

type PrivatePosixBasis = Extract<CompanionBasis, { readonly type: "file" }>

type TemporaryIdentity = {
  readonly dev: bigint
  readonly ino: bigint
}

const ROLE_FILE_MODE = 0o600

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"

const isCanonicalAbsolutePath = (path: string): boolean =>
  isAbsolute(path) && resolve(path) === path

const physicalDirectory = async (path: string): Promise<boolean> => {
  if (!isCanonicalAbsolutePath(path)) throw new Error("Role file path is not canonical")

  let info
  try {
    info = await lstat(path)
  } catch (cause) {
    if (isMissing(cause)) return false
    throw cause
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Role file requires a physical parent directory")
  if (await realpath(path) !== path) throw new Error("Role file parent crosses a symbolic link")
  return true
}

const requirePhysicalParent = async (path: string): Promise<string> => {
  const directory = dirname(path)
  if (!await physicalDirectory(directory)) throw new Error("Role file parent directory is unavailable")
  return directory
}

const removeOwnedTemporary = async (path: string, identity: TemporaryIdentity): Promise<void> => {
  try {
    const current = await lstat(path, { bigint: true })
    if (
      !current.isFile() || current.isSymbolicLink() ||
      current.dev !== identity.dev || current.ino !== identity.ino
    ) return
    await unlink(path)
  } catch (cause) {
    if (!isMissing(cause)) throw cause
  }
}

const writeTemporary = async (path: string, bytes: Uint8Array): Promise<TemporaryIdentity> => {
  const file = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    ROLE_FILE_MODE
  )
  let identity: TemporaryIdentity | null = null
  let failure: { readonly cause: unknown } | null = null
  try {
    const opened = await file.stat({ bigint: true })
    identity = { dev: opened.dev, ino: opened.ino }
    await file.chmod(ROLE_FILE_MODE)
    await file.writeFile(bytes)
    const staged = await file.stat({ bigint: true })
    if (
      !staged.isFile() || staged.dev !== identity.dev || staged.ino !== identity.ino ||
      Number(staged.mode & 0o7777n) !== ROLE_FILE_MODE
    ) throw new Error("Role file staging mode could not be preserved")
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
  if (identity === null) throw new Error("Role file staging identity is unavailable")
  return identity
}

const requireStagedTemporary = async (path: string, identity: TemporaryIdentity): Promise<void> => {
  const staged = await lstat(path, { bigint: true })
  if (
    staged.isSymbolicLink() || !staged.isFile() ||
    staged.dev !== identity.dev || staged.ino !== identity.ino ||
    Number(staged.mode & 0o7777n) !== ROLE_FILE_MODE
  ) throw new Error("Role file staging file changed before commit")
}

const requireReview = (snapshot: Snapshot, reviewed: PrivatePosixBasis): void =>
  Match.value(reviewCompanionFile({
    current: {
      platform: RuntimePlatform.make("linux"),
      observed: snapshot.observed
    },
    reviewed
  })).pipe(Match.discriminatorsExhaustive("type")({
    blocked: () => { throw new Error("Owned Codex role changed after review") },
    ready: () => undefined
  }))

export const readFile = async (path: string, maximumBytes: number): Promise<Snapshot> => {
  if (!isCanonicalAbsolutePath(path)) throw new Error("Role file path is not canonical")
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("Role file inspection limit must be a nonnegative safe integer")
  }

  if (!await physicalDirectory(dirname(path))) return { observed: { type: "absent" }, bytes: null }

  let beforePath
  try {
    beforePath = await lstat(path)
  } catch (cause) {
    if (isMissing(cause)) return { observed: { type: "absent" }, bytes: null }
    throw cause
  }
  if (beforePath.isSymbolicLink() || !beforePath.isFile()) {
    throw new Error("Role inventory encountered a non-regular file")
  }
  if (await realpath(path) !== path) throw new Error("Role file path crosses a symbolic link")

  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile()) throw new Error("Role inventory encountered a non-regular file")
    if (before.size > BigInt(maximumBytes)) throw new Error("Role file exceeds the inspection limit")
    if (await realpath(`/proc/self/fd/${file.fd}`) !== path) {
      throw new Error("Opened role file does not match its path")
    }

    const buffer = Buffer.alloc(Number(before.size))
    let offset = 0
    while (offset < buffer.length) {
      const result = await file.read(buffer, offset, buffer.length - offset, offset)
      if (result.bytesRead === 0) break
      offset += result.bytesRead
    }
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || before.mode !== after.mode ||
      offset !== buffer.length || await realpath(`/proc/self/fd/${file.fd}`) !== path || await realpath(path) !== path
    ) throw new Error("Role file changed during inspection")

    const bytes = new Uint8Array(buffer)
    return {
      observed: {
        type: "file",
        digest: fileDigest(bytes),
        mode: Number(before.mode & 0o7777n)
      },
      bytes
    }
  } finally {
    await file.close()
  }
}

const temporaryPath = (path: string): string =>
  join(dirname(path), `.${randomUUID()}.psdk-role.tmp`)

const requireAbsent = async (path: string): Promise<void> => {
  try {
    await lstat(path)
  } catch (cause) {
    if (isMissing(cause)) return
    throw cause
  }
  throw new Error("Codex role appeared after review")
}

export const createFile = async (path: string, bytes: Uint8Array): Promise<void> => {
  const directory = await requirePhysicalParent(path)
  const temporary = temporaryPath(path)
  let identity: TemporaryIdentity | null = null
  try {
    identity = await writeTemporary(temporary, bytes)
    await requireStagedTemporary(temporary, identity)
    await requireAbsent(path)
    await link(temporary, path)
    await unlink(temporary)
    identity = null
    await syncDirectory(directory)
  } finally {
    if (identity !== null) await removeOwnedTemporary(temporary, identity)
  }
}

export const replaceFile = async (
  path: string,
  before: PrivatePosixBasis,
  bytes: Uint8Array,
  maximumBytes: number
): Promise<void> => {
  const directory = await requirePhysicalParent(path)
  const temporary = temporaryPath(path)
  let identity: TemporaryIdentity | null = null
  try {
    identity = await writeTemporary(temporary, bytes)
    await requireStagedTemporary(temporary, identity)
    requireReview(await readFile(path, maximumBytes), before)
    await rename(temporary, path)
    identity = null
    await syncDirectory(directory)
  } finally {
    if (identity !== null) await removeOwnedTemporary(temporary, identity)
  }
}

export const removeFile = async (
  path: string,
  before: PrivatePosixBasis,
  maximumBytes: number
): Promise<void> => {
  const directory = await requirePhysicalParent(path)
  requireReview(await readFile(path, maximumBytes), before)
  await unlink(path)
  await syncDirectory(directory)
}
