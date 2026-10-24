import { constants } from "node:fs"
import { open, rename, rm } from "node:fs/promises"
import { dirname } from "node:path"
import { canonicalJson, type Json } from "./json.ts"

export const syncDirectory = async (path: string): Promise<void> => {
  const access = process.platform === "win32" ? constants.O_RDWR : constants.O_RDONLY
  const directory = await open(path, access | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { await directory.sync() } finally { await directory.close() }
}

export const writeJsonAtomically = async (path: string, value: Json): Promise<void> => {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    try { await file.writeFile(canonicalJson(value)); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
    await syncDirectory(dirname(path))
  } finally { await rm(temporary, { force: true }) }
}
