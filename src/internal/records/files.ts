import { constants } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"
import { dirname, join } from "node:path"
import { syncDirectory, writeJsonAtomically } from "../storage.ts"
import type { Json } from "../json.ts"

export const physicalRecordDirectory = async (path: string): Promise<void> => {
  if (process.platform !== "linux" && (process.platform !== "win32" || process.arch !== "x64")) {
    throw new Error("Record storage requires Linux or Windows x64")
  }
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) {
    throw new Error("Record storage must use a physical directory without symbolic links")
  }
}

export const createRecordDirectory = async (directory: string): Promise<boolean> => {
  await physicalRecordDirectory(dirname(directory))
  try { await mkdir(directory, { mode: 0o700 }) }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST") return false
    throw cause
  }
  await syncDirectory(dirname(directory))
  return true
}

export const readRecordBytes = async (directory: string, name: string): Promise<Uint8Array> => {
  await physicalRecordDirectory(directory)
  const path = join(directory, name)
  if (!(await lstat(path)).isFile()) throw new Error("Stored record must be a regular file without symbolic links")
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    if (!(await file.stat()).isFile()) throw new Error("Stored record must be a regular file")
    return await file.readFile()
  } finally { await file.close() }
}

export const writeRecordJson = async (directory: string, name: string, value: Json): Promise<void> => {
  await physicalRecordDirectory(directory)
  await writeJsonAtomically(join(directory, name), value)
}
