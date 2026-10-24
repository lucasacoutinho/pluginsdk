import { resolve as resolvePath } from "node:path"
import { Effect, Layer, Match, Schema } from "effect"
import { AcquisitionRequest, ArtifactRelease, CatalogInputRejected, ReleaseCatalog, type Acquisition, type Admission, type AdmissionRequest } from "../../contracts/Registry.ts"
import { ReleaseKey } from "../../contracts/Catalog.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { copyBundle } from "../internal/identity.ts"
import { register, resolve } from "./model.ts"
import { captureRelease, rejectAdmission } from "./entries.ts"
import { catalogLock, createDirectory, readCatalog, writeCatalog } from "./storage.ts"
import { acquireArtifact } from "./artifacts/import.ts"

const sameKey = Schema.toEquivalence(ReleaseKey)

export const ReleaseCatalogLive = (root: Directory) => {
  const directory = Directory.make(resolvePath(root))
  const initialize = Effect.gen(function*() {
    const created = yield* createDirectory(directory)
    yield* catalogLock(directory)
    if (created) yield* writeCatalog(directory, { schema: 2, entries: [] })
    else yield* readCatalog(directory)
  }).pipe(Effect.withSpan("ReleaseCatalog.initialize"), Effect.scoped)

  const admit = Effect.fn("ReleaseCatalog.admit")(function*(input: AdmissionRequest) {
    const captured = yield* Effect.try({ try: () => captureRelease(input), catch: rejectAdmission })
    yield* catalogLock(directory)
    const record = yield* readCatalog(directory)
    const registration = register(record.entries.map((entry) => entry.release), captured.release)
    return yield* Match.value(registration).pipe(Match.discriminatorsExhaustive("type")({
      registered: () => writeCatalog(directory, { schema: 2, entries: [...record.entries, captured] }).pipe(
        Effect.as<Admission>({ type: "admitted" })
      ),
      unchanged: () => Effect.succeed<Admission>({ type: "unchanged" }),
      conflict: () => Effect.succeed<Admission>({ type: "conflict" })
    }))
  }, Effect.scoped)

  const importRelease = Effect.fn("ReleaseCatalog.import")(function*(input: ArtifactRelease) {
    const snapshot = yield* Effect.try({
      try: () => structuredClone(input),
      catch: (cause) => new CatalogInputRejected({ cause })
    })
    const release = yield* Schema.decodeEffect(Schema.toType(ArtifactRelease), { onExcessProperty: "error" })(snapshot).pipe(
      Effect.mapError((cause) => new CatalogInputRejected({ cause }))
    )
    const request = yield* acquireArtifact(release)
    return yield* admit(request)
  })

  const acquire = Effect.fn("ReleaseCatalog.acquire")(function*(input: AcquisitionRequest) {
    const captured = yield* Effect.try({
      try: () => structuredClone(input),
      catch: (cause) => new CatalogInputRejected({ cause })
    })
    const request = yield* Schema.decodeEffect(Schema.toType(AcquisitionRequest), { onExcessProperty: "error" })(captured).pipe(
      Effect.mapError((cause) => new CatalogInputRejected({ cause }))
    )
    yield* catalogLock(directory)
    const record = yield* readCatalog(directory)
    const resolution = resolve(record.entries.map((entry) => entry.release), request.key, request.target)
    return yield* Match.value(resolution).pipe(Match.discriminatorsExhaustive("type")({
      blocked: (blocked) => Effect.succeed<Acquisition>(blocked),
      resolved: ({ release }) => Effect.gen(function*() {
        const entry = record.entries.find((candidate) => sameKey(candidate.release.key, release.key))
        if (entry === undefined) return yield* Effect.die(new Error("Validated catalog resolution lost its entry"))
        return yield* Match.value(entry).pipe(Match.discriminatorsExhaustive("type")({
          mcp: ({ release, contract }) => Effect.succeed<Acquisition>({ type: "mcp", release, contract }),
          plugin: ({ release, bundles }) => Match.value(request.target).pipe(Match.discriminatorsExhaustive("type")({
            mcp: () => Effect.die(new Error("Validated catalog resolution changed its content kind")),
            plugin: ({ format }) => {
              const bundle = bundles.find((candidate) => candidate.format === format)
              return bundle === undefined
                ? Effect.die(new Error("Validated catalog resolution lost its package"))
                : Effect.succeed<Acquisition>({ type: "plugin", release, bundle: copyBundle(bundle) })
            }
          }))
        }))
      })
    }))
  }, Effect.scoped)

  return Layer.succeed(ReleaseCatalog, ReleaseCatalog.of({ initialize, admit, import: importRelease, acquire }))
}
