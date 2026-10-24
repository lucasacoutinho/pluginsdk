import { Array as EffectArray, Effect, FileSystem, Match, Order, Schema, Struct } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import { join } from "node:path"
import {
  BuildRejected,
  Compiler,
  SourceUnavailable
} from "../../contracts/Compiler.ts"
import type { Bundle as BundleType } from "../../contracts/Compiler.ts"
import type { Format } from "../../contracts/Compiler.ts"
import type { Directory, Plugin } from "../../contracts/Plugin.ts"
import { BuildSnapshot, ProjectDefinition, ProjectError } from "../../contracts/Project.ts"
import type { BuildSnapshot as BuildSnapshotType, LocalClient as LocalClientType, ProjectDefinition as ProjectDefinitionType } from "../../contracts/Project.ts"
import type { FileDigest } from "../../contracts/CompilerModel.ts"
import { copyBundle, fileDigest } from "../internal/identity.ts"
import { jsonBytes, parseJsonBytes } from "../internal/json.ts"
import { writeJsonAtomically } from "../internal/storage.ts"
import { validateBundle } from "../compiler/package/native.ts"
import { buildClients } from "../installer/target/packages.ts"

const projectError = (detail: string): ProjectError => new ProjectError({ detail })

export const readDefinition = Effect.fn("Project.readDefinition")(function*(path: string): Effect.fn.Return<
  ProjectDefinitionType,
  ProjectError,
  FileSystem.FileSystem
> {
  const fs = yield* FileSystem.FileSystem
  const bytes = yield* fs.readFile(path).pipe(
    Effect.mapError(() => projectError(`Cannot read project definition: ${path}`))
  )
  const json = yield* Effect.try({
    try: () => parseJsonBytes(bytes),
    catch: () => projectError(`${path}: Input is not valid JSON`)
  })
  return yield* Schema.decodeUnknownEffect(ProjectDefinition, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => projectError(`${path}: Project definition does not match the ProjectDefinition schema; see docs/authoring.md`))
  )
})

export const pluginDefinition = (definition: ProjectDefinitionType): Plugin =>
  Struct.omit(definition, ["publish"])

export const definitionDigest = (definition: ProjectDefinitionType): FileDigest =>
  fileDigest(jsonBytes(Schema.encodeSync(ProjectDefinition)(definition)))

export const compileProject = Effect.fn("Project.compileProject")(function*(
  definition: ProjectDefinitionType,
  root: Directory,
  clients: NonEmptyReadonlyArray<LocalClientType>
): Effect.fn.Return<NonEmptyReadonlyArray<BundleType>, BuildRejected | SourceUnavailable, Compiler> {
  const [firstClient, ...remainingClients] = buildClients(clients)

  const plugin = pluginDefinition(definition)
  const buildFor = (client: Format) => Compiler.use((compiler) => compiler.build({
    root,
    plugin,
    format: client
  }))
  const first = yield* buildFor(firstClient)
  const remaining = yield* Effect.forEach(remainingClients, buildFor)
  return [first, ...remaining]
})

const hostOrder = (host: Format): number => Match.value(host).pipe(
  Match.when("claude_code", () => 0),
  Match.when("codex", () => 1),
  Match.exhaustive
)

const bundleProblem = (
  definition: ProjectDefinitionType,
  bundles: NonEmptyReadonlyArray<BundleType>,
  requireCanonicalOrder: boolean
): string | undefined => {
  const hosts = new Set<string>()
  let previousOrder = -1
  for (const bundle of bundles) {
    let metadata: ReturnType<typeof validateBundle>
    try {
      metadata = validateBundle(bundle)
    } catch {
      return "Build package is invalid; rebuild the project"
    }
    if (bundle.plugin !== definition.id) return "Build package plugin does not match the definition; rebuild the project"
    if (metadata.version !== definition.version) return "Build package version does not match the definition; rebuild the project"
    const host = bundle.format
    if (hosts.has(host)) return "Build contains more than one package for a client; rebuild the project"
    hosts.add(host)
    const order = hostOrder(host)
    if (requireCanonicalOrder && order <= previousOrder) return "Build packages are not in canonical client order; rebuild the project"
    previousOrder = order
  }
  return undefined
}

const snapshotProblem = (snapshot: BuildSnapshotType, definition: ProjectDefinitionType): string | undefined => {
  if (snapshot.definition !== definitionDigest(definition)) {
    return "Definition changed since this build; rebuild the project"
  }
  if (snapshot.plugin !== definition.id || snapshot.version !== definition.version) {
    return "Build metadata does not match the definition; rebuild the project"
  }
  return bundleProblem(definition, snapshot.bundles, true)
}

const captureBuildSnapshot = (
  definition: ProjectDefinitionType,
  bundles: NonEmptyReadonlyArray<BundleType>
): BuildSnapshotType => {
  const copied = EffectArray.sort(EffectArray.map(bundles, copyBundle), Order.mapInput(Order.Number, (bundle: BundleType) => hostOrder(bundle.format)))
  const snapshot = Schema.decodeSync(Schema.toType(BuildSnapshot))({
    schema: 1,
    definition: definitionDigest(definition),
    plugin: definition.id,
    version: definition.version,
    bundles: copied
  }, { onExcessProperty: "error" })
  const problem = snapshotProblem(snapshot, definition)
  if (problem !== undefined) throw new Error(problem)
  return snapshot
}

export const writeBuild = Effect.fn("Project.writeBuild")(function*(
  directory: string,
  definition: ProjectDefinitionType,
  bundles: NonEmptyReadonlyArray<BundleType>
): Effect.fn.Return<BuildSnapshotType, ProjectError, FileSystem.FileSystem> {
  const snapshot = yield* Effect.try({
    try: () => captureBuildSnapshot(definition, bundles),
    catch: () => projectError("Build is invalid; rebuild the project")
  })
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(directory, { recursive: true }).pipe(
    Effect.mapError(() => projectError("Cannot create build directory"))
  )
  const encoded = yield* Schema.encodeEffect(BuildSnapshot)(snapshot).pipe(
    Effect.mapError(() => projectError("Build snapshot is invalid; rebuild the project"))
  )
  yield* Effect.tryPromise({
    try: () => writeJsonAtomically(join(directory, "build.json"), encoded),
    catch: () => projectError("Cannot write build snapshot")
  })
  return snapshot
})

export const readBuild = Effect.fn("Project.readBuild")(function*(
  directory: string,
  definition: ProjectDefinitionType
): Effect.fn.Return<BuildSnapshotType, ProjectError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const bytes = yield* fs.readFile(join(directory, "build.json")).pipe(
    Effect.mapError(() => projectError("Cannot read build snapshot; rebuild the project"))
  )
  const json = yield* Effect.try({
    try: () => parseJsonBytes(bytes),
    catch: () => projectError("Build snapshot is invalid; rebuild the project")
  })
  const snapshot = yield* Schema.decodeUnknownEffect(BuildSnapshot, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => projectError("Build snapshot is invalid; rebuild the project"))
  )
  const problem = snapshotProblem(snapshot, definition)
  if (problem !== undefined) return yield* projectError(problem)
  return snapshot
})
