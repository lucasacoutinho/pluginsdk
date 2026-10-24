import { Effect, FileSystem, Match, Option, Schema, Console } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { dirname, resolve } from "node:path"
import {
  ArtifactMcpRelease,
  ArtifactRelease,
  ArtifactPluginRelease,
  Admission,
  McpContract,
  Release,
  ReleaseCatalog,
  type AdmissionRequest,
  type Admission as AdmissionType
} from "../../contracts/Registry.ts"
import { ReleaseKey, type ReleaseTarget } from "../../contracts/Catalog.ts"
import { Bundle, Format } from "../../contracts/Compiler.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { ReleaseCatalogLive } from "../catalog/index.ts"
import { packArtifact, packContractArtifact, rejectArtifact } from "../catalog/artifacts/import.ts"
import { canonicalJson } from "../internal/json.ts"
import {
  InputRejected,
  OutputRejected,
  CliFailure,
  readBundle,
  readMcpContract,
  readJson,
  toCliFailure,
  writeJson,
  jsonFlag
} from "./shared.ts"

const encodedAdmission = Schema.encodeSync(Admission)
const encodedArtifactRelease = Schema.encodeSync(ArtifactPluginRelease)
const encodedArtifactMcpRelease = Schema.encodeSync(ArtifactMcpRelease)
const encodedBundle = Schema.encodeSync(Bundle)
const encodedMcpContract = Schema.encodeSync(McpContract)

const withCatalog = <A, E>(
  directory: string,
  run: (catalog: typeof ReleaseCatalog.Service) => Effect.Effect<A, E>
) => ReleaseCatalog.use(run).pipe(
  Effect.provide(ReleaseCatalogLive(Directory.make(resolve(directory))))
)

const readRelease = Effect.fn("pluginsdk.cli.catalog.readRelease")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Release, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Release does not match the Release schema" }))
  )
}, (effect) => effect.pipe(Effect.mapError(toCliFailure)))

const readArtifactRelease = Effect.fn("pluginsdk.cli.catalog.readArtifactRelease")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(ArtifactRelease, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Release does not match the ArtifactRelease schema" }))
  )
}, (effect) => effect.pipe(Effect.mapError(toCliFailure)))

const decodeReleaseKey = Effect.fn("pluginsdk.cli.catalog.decodeReleaseKey")(function*(
  organization: string,
  integration: string,
  release: string
) {
  return yield* Schema.decodeEffect(ReleaseKey, { onExcessProperty: "error" })({ organization, integration, release }).pipe(
    Effect.mapError(() => new CliFailure({ message: "Release identity fields must be non-empty" }))
  )
})

const outputDirectory = Effect.fn("pluginsdk.cli.catalog.outputDirectory")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(dirname(resolve(path)), { recursive: true }).pipe(
    Effect.mapError(() => new OutputRejected({ path, detail: "Cannot create output directory" })),
    Effect.mapError(toCliFailure)
  )
})

const reportAdmission = Effect.fn("pluginsdk.cli.catalog.reportAdmission")(function*(
  admission: AdmissionType,
  json: boolean
) {
  const summary = Match.value(admission).pipe(Match.discriminatorsExhaustive("type")({
    admitted: () => ({ text: "status: admitted", failure: false }),
    unchanged: () => ({ text: "status: unchanged", failure: false }),
    conflict: () => ({ text: "status: conflict", failure: true })
  }))
  yield* Console.log(json ? canonicalJson(encodedAdmission(admission)) : summary.text)
  if (summary.failure) yield* Effect.sync(() => { process.exitCode = 1 })
})

const initCommand = Command.make(
  "init",
  {
    directory: Flag.String("directory").pipe(Flag.withDescription("Catalog store directory")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.catalog.init")(function*(input) {
    yield* withCatalog(input.directory, (catalog) => catalog.initialize).pipe(Effect.mapError(toCliFailure))
    yield* Console.log(input.json ? "{\"type\":\"initialized\"}" : `status: initialized\ncatalog: ${resolve(input.directory)}`)
  })
).pipe(Command.withDescription("Initialize a local release catalog"))

const packCommand = Command.make(
  "pack",
  {
    bundles: Argument.String("bundle").pipe(Argument.atLeast(1), Argument.withDescription("Validated bundle JSON files")),
    organization: Flag.String("organization").pipe(Flag.withDescription("Owning organization")),
    integration: Flag.String("integration").pipe(Flag.withDescription("Integration identity")),
    release: Flag.String("release").pipe(Flag.withDescription("Release identity")),
    location: Flag.String("location").pipe(Flag.withDescription("URL where the exact archive bytes will be published")),
    out: Flag.String("out").pipe(Flag.withDescription("Package archive output path")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.catalog.pack")(function*(input) {
    const bundles = yield* Effect.forEach(input.bundles, (path) => readBundle(path).pipe(Effect.mapError(toCliFailure)))
    const key = yield* decodeReleaseKey(input.organization, input.integration, input.release)
    const packed = yield* Effect.try({
      try: () => packArtifact(key, input.location, bundles),
      catch: rejectArtifact
    }).pipe(Effect.mapError(toCliFailure))

    yield* outputDirectory(input.out)
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFile(input.out, packed.bytes).pipe(
      Effect.mapError(() => new OutputRejected({ path: input.out, detail: "Cannot write package archive" })),
      Effect.mapError(toCliFailure)
    )

    const metadata = encodedArtifactRelease(packed.release)
    yield* Console.log(input.json ? canonicalJson(metadata) : [
      `status: packed`,
      `release: ${packed.release.key.organization}/${packed.release.key.integration}/${packed.release.key.release}`,
      `plugin: ${packed.release.contents.plugin}`,
      `version: ${packed.release.version}`,
      `artifact digest: ${packed.release.origin.digest}`,
      `archive: ${input.out}`,
      ...Object.entries(packed.release.contents.packages)
        .filter(([, digest]) => digest !== undefined)
        .map(([format, digest]) => `package digest (${format}): ${digest}`)
    ].join("\n"))
  })
).pipe(Command.withDescription("Package existing native bundles as one pinned release artifact"))

const packContractCommand = Command.make(
  "pack-contract",
  {
    contract: Argument.String("reviewed-contract.json"),
    integration: Flag.String("integration").pipe(Flag.withDescription("Integration identity")),
    release: Flag.String("release").pipe(Flag.withDescription("Release identity")),
    version: Flag.String("version").pipe(Flag.withDescription("Human release version")),
    location: Flag.String("location").pipe(Flag.withDescription("URL where the exact archive bytes will be published")),
    out: Flag.String("out").pipe(Flag.withDescription("MCP contract archive output path")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.catalog.packContract")(function*(input) {
    const contract = yield* readMcpContract(input.contract).pipe(Effect.mapError(toCliFailure))
    const key = yield* decodeReleaseKey(contract.organization, input.integration, input.release)
    const packed = yield* Effect.try({
      try: () => packContractArtifact(key, input.version, input.location, contract),
      catch: rejectArtifact
    }).pipe(Effect.mapError(toCliFailure))

    yield* outputDirectory(input.out)
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFile(input.out, packed.bytes).pipe(
      Effect.mapError(() => new OutputRejected({ path: input.out, detail: "Cannot write MCP contract archive" })),
      Effect.mapError(toCliFailure)
    )

    const metadata = encodedArtifactMcpRelease(packed.release)
    yield* Console.log(input.json ? canonicalJson(metadata) : [
      "status: packed",
      `release: ${packed.release.key.organization}/${packed.release.key.integration}/${packed.release.key.release}`,
      `service: ${packed.release.contents.service}`,
      `version: ${packed.release.version}`,
      `contract digest: ${packed.release.contents.contract}`,
      `artifact digest: ${packed.release.origin.digest}`,
      `archive: ${input.out}`
    ].join("\n"))
  })
).pipe(Command.withDescription("Package a reviewed MCP contract as a pinned release artifact"))

const admitCommand = Command.make(
  "admit",
  {
    release: Argument.String("release.json"),
    bundle: Flag.String("bundle").pipe(Flag.atLeast(0), Flag.withDescription("Bundle JSON file; repeat for each native package")),
    contract: Flag.String("contract").pipe(Flag.optional, Flag.withDescription("Reviewed MCP contract JSON file")),
    directory: Flag.String("directory").pipe(Flag.withDescription("Catalog store directory")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.catalog.admit")(function*(input) {
    const release = yield* readRelease(input.release)
    const request = yield* Match.value(release.contents).pipe(Match.discriminatorsExhaustive("type")({
      plugin: (contents) => Effect.gen(function*() {
        if (Option.isSome(input.contract)) {
          return yield* new CliFailure({ message: "Plugin releases accept --bundle and do not accept --contract" })
        }
        if (input.bundle.length === 0) {
          return yield* new CliFailure({ message: "Plugin releases require at least one --bundle" })
        }
        const bundles = yield* Effect.forEach(input.bundle, (path) => readBundle(path).pipe(Effect.mapError(toCliFailure)))
        return { type: "plugin", release: { ...release, contents }, bundles } satisfies AdmissionRequest
      }),
      mcp: (contents) => Effect.gen(function*() {
        if (input.bundle.length > 0) {
          return yield* new CliFailure({ message: "MCP releases accept --contract and do not accept --bundle" })
        }
        const contractPath = Option.match(input.contract, {
          onNone: () => undefined,
          onSome: (path) => path
        })
        if (contractPath === undefined) {
          return yield* new CliFailure({ message: "MCP releases require --contract" })
        }
        const contract = yield* readMcpContract(contractPath).pipe(Effect.mapError(toCliFailure))
        return { type: "mcp", release: { ...release, contents }, contract } satisfies AdmissionRequest
      })
    }))
    const admission = yield* withCatalog(input.directory, (catalog) => catalog.admit(request)).pipe(Effect.mapError(toCliFailure))
    yield* reportAdmission(admission, input.json)
  })
).pipe(Command.withDescription("Admit reviewed plugin bundles or MCP contracts with release metadata"))

const importCommand = Command.make(
  "import",
  {
    release: Argument.String("release.json"),
    directory: Flag.String("directory").pipe(Flag.withDescription("Catalog store directory")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.catalog.import")(function*(input) {
    const release = yield* readArtifactRelease(input.release)
    const admission = yield* withCatalog(input.directory, (catalog) => catalog.import(release)).pipe(
      Effect.mapError(toCliFailure)
    )
    yield* reportAdmission(admission, input.json)
  })
).pipe(Command.withDescription("Import and verify an approved pinned artifact"))

const acquireCommand = Command.make(
  "acquire",
  {
    organization: Argument.String("organization"),
    integration: Argument.String("integration"),
    release: Argument.String("release"),
    format: Flag.Literals("format", Format.literals).pipe(Flag.optional, Flag.withDescription("Native package format")),
    contract: Flag.Boolean("contract").pipe(Flag.withDefault(false), Flag.withDescription("Acquire the reviewed MCP contract")),
    directory: Flag.String("directory").pipe(Flag.withDescription("Catalog store directory")),
    out: Flag.String("out").pipe(Flag.withDescription("Acquired content output path")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.catalog.acquire")(function*(input) {
    if (input.contract === Option.isSome(input.format)) {
      return yield* new CliFailure({ message: "Choose exactly one of --format FORMAT or --contract" })
    }
    const key = yield* decodeReleaseKey(input.organization, input.integration, input.release)
    const target = Option.match(input.format, {
      onSome: (format): ReleaseTarget => ({ type: "plugin", format }),
      onNone: (): ReleaseTarget => ({ type: "mcp" })
    })
    const acquisition = yield* withCatalog(input.directory, (catalog) => catalog.acquire({ key, target })).pipe(
      Effect.mapError(toCliFailure)
    )
    const output = yield* Match.value(acquisition).pipe(Match.discriminatorsExhaustive("type")({
      plugin: ({ bundle }) => Effect.succeed({
        encoded: encodedBundle(bundle),
        details: [
          `format: ${bundle.format}`,
          `bundle digest: ${bundle.digest}`,
        ]
      }),
      mcp: ({ release, contract }) => Effect.succeed({
        encoded: encodedMcpContract(contract),
        details: [
          `service: ${release.contents.service}`,
          `version: ${release.version}`,
          `contract digest: ${release.contents.contract}`,
          `tool count: ${contract.tools.length}`
        ]
      }),
      blocked: ({ reason }) => Effect.fail(new CliFailure({ message: `Catalog acquisition blocked: ${reason}` }))
    }))
    yield* outputDirectory(input.out)
    yield* writeJson(input.out, output.encoded).pipe(Effect.mapError(toCliFailure))
    yield* Console.log(input.json ? canonicalJson(output.encoded) : [
      "status: acquired",
      `release: ${key.organization}/${key.integration}/${key.release}`,
      ...output.details,
      `output: ${input.out}`
    ].join("\n"))
  })
).pipe(Command.withDescription("Acquire one exact plugin package or MCP contract from the catalog"))

export const catalogCommand = Command.make("catalog").pipe(
  Command.withDescription("Manage pinned plugin and MCP releases"),
  Command.withSubcommands([initCommand, packCommand, packContractCommand, admitCommand, importCommand, acquireCommand])
)
