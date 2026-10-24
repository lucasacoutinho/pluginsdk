import { constants } from "node:fs"
import { lstat, open, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { tryLock } from "fs-native-extensions"
import { Directory } from "../../../contracts/Plugin.ts"
import { Writer } from "../../../contracts/Writers.ts"
import { parseJsonBytes } from "../json.ts"
import { syncDirectory } from "../storage.ts"
import { priorOwnerCompletion } from "../process/model.ts"
import { currentWindowsWriter, observeWindowsWriters } from "../process/windows.ts"
import { createRecordDirectory, physicalRecordDirectory, readRecordBytes, writeRecordJson } from "./files.ts"

export class RecordStorageUnavailable extends Schema.TaggedError<RecordStorageUnavailable, { readonly brand: unique symbol }>()(
  "RecordStorageUnavailable", { directory: Directory, cause: Schema.Defect() }
) {}

const recordIO = <A>(directory: Directory, operation: () => Promise<A>) =>
  Effect.tryPromise({ try: operation, catch: (cause) => new RecordStorageUnavailable({ directory, cause }) })
const ownerFilename = (writer: Writer) => `${writer.pid}-${writer.creation}.json`
const sameWriter = Schema.toEquivalence(Writer)

const retainOwner = Effect.fn("RecordStorage.retainOwner")(function*(directory: Directory) {
  const ownersDirectory = join(directory, "owners")
  const entries = yield* recordIO(directory, async () => {
    await createRecordDirectory(ownersDirectory)
    await physicalRecordDirectory(ownersDirectory)
    return await readdir(ownersDirectory, { withFileTypes: true })
  })
  const published = entries.filter((entry) => !(entry.isFile() && entry.name.endsWith(".tmp")))
  const owners = yield* Effect.forEach(published, (entry) => recordIO(directory, async () => {
    if (!entry.isFile()) throw new Error("Unexpected record lock owner entry")
    const owner = Schema.decodeUnknownSync(Writer)(parseJsonBytes(await readRecordBytes(ownersDirectory, entry.name)), { onExcessProperty: "error" })
    if (ownerFilename(owner) !== entry.name) throw new Error("Record lock owner identity does not match its filename")
    return owner
  }))
  const unavailable = (cause: unknown) => new RecordStorageUnavailable({ directory, cause })
  const current = yield* currentWindowsWriter().pipe(Effect.mapError(unavailable))
  const observed = yield* observeWindowsWriters(owners).pipe(Effect.mapError(unavailable))
  yield* Match.value(priorOwnerCompletion({ current, owners, observed })).pipe(
    Match.when("complete", () => Effect.void),
    Match.when("active", () => Effect.fail(unavailable(new Error("Prior record lock owner is active")))),
    Match.when("unknown", () => Effect.fail(unavailable(new Error("Prior record lock owner completion is unknown")))),
    Match.exhaustive
  )
  const record = yield* Schema.encodeEffect(Writer)(current).pipe(Effect.mapError(unavailable))
  const path = join(ownersDirectory, ownerFilename(current))
  yield* Effect.acquireRelease(
    recordIO(directory, () => writeRecordJson(ownersDirectory, ownerFilename(current), record)).pipe(Effect.uninterruptible),
    () => recordIO(directory, async () => { await rm(path); await syncDirectory(ownersDirectory) }).pipe(Effect.orDie)
  )
  yield* recordIO(directory, async () => {
    for (const owner of owners) {
      if (!sameWriter(owner, current)) await rm(join(ownersDirectory, ownerFilename(owner)))
    }
    await syncDirectory(ownersDirectory)
  }).pipe(Effect.uninterruptible)
})

export const recordLock = Effect.fn("RecordStorage.lock")(function*(directory: Directory) {
  yield* recordIO(directory, () => physicalRecordDirectory(directory))
  const path = join(directory, "writer.lock")
  const file = yield* Effect.acquireRelease(
    recordIO(directory, () => open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)),
    (file) => Effect.promise(() => file.close())
  )
  yield* recordIO(directory, async () => {
    if (!(await file.stat()).isFile() || !(await lstat(path)).isFile()) {
      throw new Error("Record lock must be a regular file without symbolic links")
    }
  })
  while (!(yield* Effect.try({
    try: () => tryLock(file.fd),
    catch: (cause) => new RecordStorageUnavailable({ directory, cause })
  }))) {
    yield* Effect.sleep("10 millis")
  }
  if (process.platform === "win32") yield* retainOwner(directory)
  return file
})
