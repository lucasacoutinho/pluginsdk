import { readFile } from "node:fs/promises"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Schema } from "effect"
import { AdmissionRequest, ReleaseCatalog } from "../../contracts/Registry.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { ReleaseCatalogLive } from "../../src/catalog/index.ts"

const directory = process.argv[2]
const requestPath = process.argv[3]
if (directory === undefined || requestPath === undefined) throw new Error("Expected catalog directory and request path")

const request = Schema.decodeUnknownSync(AdmissionRequest)(JSON.parse(await readFile(requestPath, "utf8")))
const layer = Layer.provideMerge(ReleaseCatalogLive(Directory.make(directory)), NodeServices.layer)
const admission = await Effect.runPromise(ReleaseCatalog.use((catalog) => Effect.gen(function*() {
  yield* catalog.initialize
  return yield* catalog.admit(request)
})).pipe(Effect.provide(layer)))
process.stdout.write(JSON.stringify(admission))
