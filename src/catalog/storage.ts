import { Effect, Match, Schema } from "effect"
import { CatalogUnavailable, AdmissionRequest, PluginAdmissionRequest } from "../../contracts/Registry.ts"
import { ReleaseKey } from "../../contracts/Catalog.ts"
import type { Directory } from "../../contracts/Plugin.ts"
import { parseJsonBytes } from "../internal/json.ts"
import { createRecordDirectory, readRecordBytes, writeRecordJson } from "../internal/records/files.ts"
import { recordLock } from "../internal/records/lock.ts"
import { captureRelease } from "./entries.ts"

const LegacyEntry = Schema.Struct({ release: PluginAdmissionRequest.fields.release, bundles: PluginAdmissionRequest.fields.bundles })
const LegacyCatalog = Schema.Struct({ schema: Schema.Literal(1), entries: Schema.Array(LegacyEntry) })
const StoredCatalog = Schema.Struct({ schema: Schema.Literal(2), entries: Schema.Array(AdmissionRequest) })
const CatalogRecord = Schema.Union([LegacyCatalog, StoredCatalog])
export type StoredCatalog = typeof StoredCatalog.Type
const sameKey = Schema.toEquivalence(ReleaseKey)

const catalogIO = <A>(directory: Directory, operation: () => Promise<A>) =>
  Effect.tryPromise({ try: operation, catch: (cause) => new CatalogUnavailable({ directory, cause }) })

export const createDirectory = (directory: Directory) =>
  catalogIO(directory, () => createRecordDirectory(directory)).pipe(Effect.uninterruptible)

export const catalogLock = (directory: Directory) => recordLock(directory).pipe(
  Effect.mapError(({ cause }) => new CatalogUnavailable({ directory, cause }))
)

export const readCatalog = (directory: Directory) => catalogIO(directory, async (): Promise<StoredCatalog> => {
  const record = Schema.decodeUnknownSync(CatalogRecord)(parseJsonBytes(await readRecordBytes(directory, "catalog.json")), { onExcessProperty: "error" })
  const candidates = Match.value(record).pipe(
    Match.when({ schema: 1 }, ({ entries }) => entries.map((entry): AdmissionRequest => ({ type: "plugin", ...entry }))),
    Match.when({ schema: 2 }, ({ entries }) => entries),
    Match.exhaustive
  )
  const entries: AdmissionRequest[] = []
  for (const entry of candidates) {
    if (entries.some((prior) => sameKey(prior.release.key, entry.release.key))) {
      throw new Error("Catalog record contains duplicate release keys")
    }
    entries.push(captureRelease(entry))
  }
  return { schema: 2, entries }
})

export const writeCatalog = (directory: Directory, record: StoredCatalog) => catalogIO(directory, () =>
  writeRecordJson(directory, "catalog.json", Schema.encodeSync(StoredCatalog)(record))
).pipe(Effect.uninterruptible)
