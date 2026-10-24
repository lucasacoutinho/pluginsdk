import { Effect, Match, Schema } from "effect"
import { Bundle, BundleDigest, Format, type PackageFile } from "../../contracts/Compiler.ts"
import { GitPublication, ProjectError, type BuildSnapshot } from "../../contracts/Project.ts"
import { PackageClient } from "../../contracts/Clients.ts"
import { PackagePath } from "../../contracts/Plugin.ts"
import { Publication, ReleaseDigest } from "../../contracts/Publication.ts"
import { nativeLocations, validateBundle } from "../compiler/package/native.ts"
import { commitment } from "../internal/identity.ts"
import { canonicalJson, jsonBytes, parseJsonBytes, type Json } from "../internal/json.ts"
import { compareUtf8 } from "../internal/paths.ts"
import { publishRelease } from "./publication.ts"
import type { GitEdit, GitSnapshot, TreeFile } from "./git.ts"

const PackageRecord = Schema.Struct({ client: PackageClient, format: Format, digest: BundleDigest })
type PackageRecord = typeof PackageRecord.Type
const ReleaseBody = Schema.Struct({
  plugin: Publication.fields.plugin,
  version: Publication.fields.version,
  packages: Schema.NonEmptyArray(PackageRecord)
})
const Release = Schema.Struct({ ...ReleaseBody.fields, digest: ReleaseDigest })
type Release = typeof Release.Type
const Registry = Schema.Struct({ schema: Schema.Literal(1), marketplace: GitPublication.fields.marketplace, releases: Schema.Array(Release) })
type Registry = typeof Registry.Type
const Index = Schema.Struct({ name: GitPublication.fields.marketplace, plugins: Schema.Array(Schema.JsonObject) })
const registryPath = ".pluginsdk/publications.json"
const clients = PackageClient.literals

const indexPath = (client: PackageClient): string => Match.value(client).pipe(
  Match.when("claude_code", () => ".claude-plugin/marketplace.json"),
  Match.when("codex", () => ".agents/plugins/marketplace.json"), Match.exhaustive
)

const packageRoot = (release: Release, client: PackageClient) => `plugins/${release.plugin}/${release.digest}/${client}`
const releaseDigest = (body: typeof ReleaseBody.Type) => ReleaseDigest.make(commitment("publication", Schema.encodeSync(ReleaseBody)({
  plugin: body.plugin, version: body.version, packages: body.packages
})))

const invalid = (detail: string): never => { throw new ProjectError({ detail }) }

export function capturedPublication(build: BuildSnapshot): Release {
  const record = (bundle: Bundle): PackageRecord => ({
    client: nativeLocations(bundle.format).host, format: bundle.format, digest: bundle.digest
  })
  const [first, ...rest] = build.bundles
  const body: typeof ReleaseBody.Type = {
    plugin: build.plugin, version: build.version,
    packages: [record(first), ...rest.map(record)]
  }
  return { ...body, digest: releaseDigest(body) }
}

function checkRecord(release: Release): void {
  if (release.digest !== releaseDigest(release)) invalid("Published release metadata changed")
  const seen = new Set<PackageClient>()
  for (const pkg of release.packages) {
    if (nativeLocations(pkg.format).host !== pkg.client || seen.has(pkg.client)) invalid("Published package selection is invalid")
    seen.add(pkg.client)
  }
  if (release.packages.map((pkg) => pkg.client).join(",") !== clients.filter((client) => seen.has(client)).join(",")) {
    invalid("Published packages are not in canonical client order")
  }
}

function assertWritable(snapshot: GitSnapshot, path: string, replace: boolean): void {
  const segments = path.split("/")
  for (let length = 1; length < segments.length; length++) {
    if (snapshot.entries.has(segments.slice(0, length).join("/"))) invalid(`A repository entry blocks ${path}`)
  }
  if (!replace && snapshot.entries.has(path)) invalid(`Repository path is already occupied: ${path}`)
  if ([...snapshot.entries.keys()].some((entry) => entry.startsWith(`${path}/`))) invalid(`A repository directory blocks ${path}`)
}

function activePackages(releases: ReadonlyArray<Release>, client: PackageClient): ReadonlyMap<string, Release> {
  const active = new Map<string, Release>()
  for (const release of releases) {
    if (release.packages.some((pkg) => pkg.client === client)) active.set(release.plugin, release)
  }
  return active
}

function nativeEntry(release: Release, client: PackageClient): Schema.JsonObject {
  const path = `./${packageRoot(release, client)}`
  return Match.value(client).pipe(
    Match.when("claude_code", () => ({ name: release.plugin, source: path })),
    Match.when("codex", () => ({
      name: release.plugin, source: { source: "local", path },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity"
    })), Match.exhaustive
  )
}

function readIndex(bytes: Uint8Array | undefined, destination: GitPublication, client: PackageClient): Schema.JsonObject {
  if (bytes === undefined) return {
    name: destination.marketplace,
    ...(client === "claude_code" ? { owner: { name: destination.marketplace } } : {}),
    plugins: []
  }
  const document = Schema.decodeUnknownSync(Schema.JsonObject)(parseJsonBytes(bytes))
  const index = Schema.decodeUnknownSync(Index)(document)
  if (index.name !== destination.marketplace) invalid("Marketplace name differs from the definition")
  if (client === "claude_code") Schema.decodeUnknownSync(Schema.Struct({ name: Schema.NonEmptyString }))(document.owner)
  return document
}

function updateIndex(document: Schema.JsonObject, client: PackageClient, before: Registry, after: Registry): Json {
  const entries = Schema.decodeUnknownSync(Index)(document).plugins
  const owned = activePackages(before.releases, client)
  const desired = activePackages(after.releases, client)
  const seen = new Set<string>()
  const foreign: Schema.JsonObject[] = []
  for (const entry of entries) {
    const name = Schema.decodeUnknownSync(Schema.NonEmptyString)(entry.name)
    if (seen.has(name)) invalid(`Duplicate marketplace entry: ${name}`)
    seen.add(name)
    const previous = owned.get(name)
    if (previous !== undefined) {
      if (canonicalJson(entry) !== canonicalJson(nativeEntry(previous, client))) invalid(`Managed marketplace entry changed: ${name}`)
    } else {
      if (desired.has(name)) invalid(`Marketplace entry is not owned by PluginSDK: ${name}`)
      foreign.push(entry)
    }
  }
  for (const name of owned.keys()) if (!seen.has(name)) invalid(`Managed marketplace entry is missing: ${name}`)
  return { ...document, plugins: [...foreign, ...[...desired.values()].sort((a, b) => compareUtf8(a.plugin, b.plugin)).map((release) => nativeEntry(release, client))] }
}

const checked = <A>(operation: () => A) => Effect.try({
  try: operation,
  catch: (cause) => cause instanceof ProjectError ? cause : new ProjectError({ detail: "Published marketplace state is invalid" })
})

const verifyPackages = Effect.fn("Project.verifyPublishedPackages")(function*(snapshot: GitSnapshot, registry: Registry) {
  for (const release of registry.releases) {
    yield* checked(() => checkRecord(release))
    for (const pkg of release.packages) {
      const prefix = `${packageRoot(release, pkg.client)}/`
      const paths = [...snapshot.entries.keys()].filter((path) => path.startsWith(prefix))
      const contents = yield* snapshot.read(paths)
      yield* checked(() => {
        const files = paths.sort((a, b) => compareUtf8(a.slice(prefix.length), b.slice(prefix.length)))
          .map((path): PackageFile => {
            const content = contents.get(path)
            const entry = snapshot.entries.get(path)
            if (content === undefined || entry === undefined || (entry.mode !== "100644" && entry.mode !== "100755")) return invalid("Published package is incomplete")
            return { path: Schema.decodeSync(PackagePath)(path.slice(prefix.length)), content, executable: entry.mode === "100755" }
          })
        const bundle = Schema.decodeUnknownSync(Schema.toType(Bundle))({
          schema: 1, plugin: release.plugin, format: pkg.format, digest: pkg.digest, files
        })
        try {
          if (validateBundle(bundle).version !== release.version) invalid("Published package version differs from its record")
        } catch {
          invalid(`Published package changed: ${release.plugin}@${release.version} (${pkg.client})`)
        }
      })
    }
  }
})

export const preparePublication = (destination: GitPublication, build: BuildSnapshot) => Effect.fn("Project.preparePublication")(function*(snapshot: GitSnapshot): Effect.fn.Return<GitEdit, ProjectError> {
  const metadataPaths = [registryPath, ...clients.map(indexPath)].filter((path) => snapshot.entries.has(path))
  for (const path of metadataPaths) {
    if (snapshot.entries.get(path)?.mode !== "100644") return yield* new ProjectError({ detail: `Marketplace metadata must be a regular non-executable file: ${path}` })
  }
  const metadata = yield* snapshot.read(metadataPaths)
  const registry = yield* checked((): Registry => {
    const bytes = metadata.get(registryPath)
    const value = bytes === undefined ? { schema: 1, marketplace: destination.marketplace, releases: [] } : parseJsonBytes(bytes)
    const registry = Schema.decodeUnknownSync(Registry, { onExcessProperty: "error" })(value)
    if (registry.marketplace !== destination.marketplace) invalid("Publication destination names a different marketplace")
    return registry
  })
  const release = capturedPublication(build)
  const decision = publishRelease({ history: registry.releases.map(({ plugin, version, digest }) => ({ plugin, version, digest })), desired: release })
  const changed = yield* Match.value(decision).pipe(Match.discriminatorsExhaustive("type")({
    published: () => Effect.succeed(true),
    unchanged: () => Effect.succeed(false),
    blocked: ({ reason }) => Effect.fail(new ProjectError({ detail: Match.value(reason).pipe(
      Match.when("duplicate", () => "Publication history contains duplicate plugin versions"),
      Match.when("version_conflict", () => `Version ${release.version} already has different contents; change the version and rebuild`), Match.exhaustive
    ) }))
  }))
  yield* verifyPackages(snapshot, registry)
  const after: Registry = changed ? { ...registry, releases: [...registry.releases, release] } : registry
  const files = yield* checked(() => {
    const files: TreeFile[] = []
    for (const client of clients) {
      const path = indexPath(client)
      const current = readIndex(metadata.get(path), destination, client)
      const next = updateIndex(current, client, registry, after)
      if (changed && (metadata.has(path) || activePackages(after.releases, client).size > 0)) {
        assertWritable(snapshot, path, true)
        files.push({ path: PackagePath.make(path), content: jsonBytes(next), executable: false })
      }
    }
    if (!changed) return files
    for (const bundle of build.bundles) {
      const root = packageRoot(release, nativeLocations(bundle.format).host)
      assertWritable(snapshot, root, false)
      for (const file of bundle.files) files.push({ ...file, path: PackagePath.make(`${root}/${file.path}`) })
    }
    assertWritable(snapshot, registryPath, true)
    files.push({ path: PackagePath.make(registryPath), content: jsonBytes(Schema.encodeSync(Registry)(after)), executable: false })
    return files
  })
  return changed ? { type: "update", files } : { type: "unchanged" }
})
