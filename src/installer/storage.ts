import { constants } from "node:fs"
import { open, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Effect, Schema } from "effect"
import { tryLock } from "fs-native-extensions"
import { StateUnavailable, type InstallationKey } from "../../contracts/Installer.ts"
import { parseJson, canonicalJson, type Json } from "../internal/json.ts"

export const stateIO = <A>(key: InstallationKey, operation: () => Promise<A>): Effect.Effect<A, StateUnavailable> =>
  Effect.tryPromise({ try: operation, catch: (cause) => new StateUnavailable({ key, cause }) })

const syncDirectory = async (path: string): Promise<void> => {
  const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { await directory.sync() } finally { await directory.close() }
}

const directoryTree = async (path: string): Promise<void> => {
  const created = await mkdir(path, { recursive: true, mode: 0o700 })
  if (await realpath(path) !== path) throw new Error("SDK storage must not contain symbolic links")
  const stop = created === undefined ? path : dirname(created)
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
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    try { await file.writeFile(canonicalJson(value)); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
    await syncDirectory(dirname(path))
  } finally { await rm(temporary, { force: true }) }
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

export const installationLock = Effect.fnUntraced(function*(key: InstallationKey, directory: string) {
  yield* ensureDirectory(key, directory)
  const file = yield* Effect.acquireRelease(
    stateIO(key, () => open(join(directory, "writer.lock"), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)),
    (file) => Effect.promise(() => file.close())
  )
  while (!(yield* Effect.try({ try: () => tryLock(file.fd), catch: (cause) => new StateUnavailable({ key, cause }) }))) {
    yield* Effect.sleep("10 millis")
  }
  return file
})

export const stageFile = (key: InstallationKey, path: string, bytes: Uint8Array, executable: boolean) => stateIO(key, async () => {
  await directoryTree(dirname(path))
  await writeFile(path, bytes, { mode: executable ? 0o755 : 0o644, flag: "wx" })
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { await file.sync() } finally { await file.close() }
  await syncDirectory(dirname(path))
}).pipe(Effect.uninterruptible)
