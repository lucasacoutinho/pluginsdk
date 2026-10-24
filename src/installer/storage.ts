import { constants } from "node:fs"
import { open, mkdir, realpath } from "node:fs/promises"
import { dirname } from "node:path"
import { Effect, Schema } from "effect"
import { StateUnavailable, type InstallationKey } from "../../contracts/Installer.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { PermissionBits } from "../../contracts/ExecutableIntent.ts"
import { parseJson, type Json } from "../internal/json.ts"
import { syncDirectory, writeJsonAtomically } from "../internal/storage.ts"
import { stagePermissions } from "../internal/files/executable.ts"
import { recordLock } from "../internal/records/lock.ts"

export const stateIO = <A>(key: InstallationKey, operation: () => Promise<A>): Effect.Effect<A, StateUnavailable> =>
  Effect.tryPromise({ try: operation, catch: (cause) => new StateUnavailable({ key, cause }) })

const directoryTree = async (path: string): Promise<void> => {
  const created = await mkdir(path, { recursive: true, mode: 0o700 })
  if (await realpath(path) !== path) throw new Error("SDK storage must not contain symbolic links")
  const stop = created === undefined ? path : dirname(await realpath(created))
  let current = path
  while (true) {
    await syncDirectory(current)
    if (current === stop) break
    current = dirname(current)
  }
}

export const ensureDirectory = (key: InstallationKey, path: string) => stateIO(key, async () => {
  await directoryTree(path)
}).pipe(Effect.uninterruptible)

export const durableWrite = (key: InstallationKey, path: string, value: Json) => stateIO(key, async () => {
  await directoryTree(dirname(path))
  await writeJsonAtomically(path, value)
}).pipe(Effect.uninterruptible)

export const readRecord = <S extends Schema.ConstraintDecoder<unknown>>(key: InstallationKey, path: string, schema: S) => stateIO(key, async (): Promise<S["Type"] | null> => {
  let file
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return null
    throw cause
  }
  try {
    const value = parseJson(await file.readFile("utf8"))
    return Schema.decodeSync(schema)(value, { onExcessProperty: "error" })
  } finally { await file.close() }
})

export const installationLock = Effect.fn("Installer.installationLock")(function*(key: InstallationKey, directory: string) {
  yield* ensureDirectory(key, directory)
  return yield* recordLock(Directory.make(directory)).pipe(
    Effect.mapError(({ cause }) => new StateUnavailable({ key, cause }))
  )
})

export const stageFile = (key: InstallationKey, path: string, bytes: Uint8Array, executable: boolean) => stateIO(key, async () => {
  await directoryTree(dirname(path))
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, executable ? 0o755 : 0o644)
  try {
    await file.writeFile(bytes)
    if (process.platform !== "win32") {
      const current = PermissionBits.make(Number((await file.stat({ bigint: true })).mode & 0o777n))
      const desired = stagePermissions({ current, executable })
      if (desired !== current) await file.chmod(desired)
    }
    await file.sync()
  } finally { await file.close() }
  await syncDirectory(dirname(path))
}).pipe(Effect.uninterruptible)
