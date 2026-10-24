import { createHash } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Cause, Effect, Exit, Fiber, Layer, Match, Schema } from "effect"
import { ArtifactDigest, FormatDigests } from "../contracts/Catalog.ts"
import {
  BuildRequest,
  BundleBody,
  BundleRejected,
  Compiler,
  type Bundle,
  type BundleDigest,
  type Format
} from "../contracts/Compiler.ts"
import {
  ArtifactPluginRelease,
  ArtifactRejected,
  ArtifactUnavailable,
  CatalogInputRejected,
  CatalogUnavailable,
  ContractRejected,
  PackageArchive,
  PackageSetRejected,
  PluginRelease,
  ReleaseCatalog,
  ReleaseKey
} from "../contracts/Registry.ts"
import { Directory } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { ReleaseCatalogLive } from "../src/catalog/index.ts"

const formats: ReadonlyArray<Format> = ["claude_code_v4", "codex_plugin_v1"]
const compilerLayer = Layer.provideMerge(CompilerLive, NodeServices.layer)
const maxArtifactBytes = 64 * 1024 * 1024

type Fixture = {
  readonly integration: string
  readonly plugin: string
  readonly version: string
  readonly bundles: ReadonlyArray<Bundle>
}

type CatalogImportError =
  | CatalogUnavailable
  | CatalogInputRejected
  | ContractRejected
  | PackageSetRejected
  | BundleRejected
  | ArtifactUnavailable
  | ArtifactRejected

type Deferred<A> = {
  readonly promise: Promise<A>
  readonly complete: (value: A) => void
}

type HttpHandler = (request: IncomingMessage, response: ServerResponse) => void

const deferred = <A>(): Deferred<A> => {
  let complete: (value: A) => void = () => undefined
  const promise = new Promise<A>((resolve) => { complete = resolve })
  return { promise, complete: (value) => complete(value) }
}

const withDirectory = async <A>(run: (root: string) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-catalog-artifact-"))
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const withHttpServer = async <A>(handler: HttpHandler, run: (origin: string, server: Server) => Promise<A>): Promise<A> => {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    const onError = (cause: Error) => reject(cause)
    server.once("error", onError)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Loopback fixture did not bind to a TCP address")
  const origin = `http://127.0.0.1:${address.port}`
  try {
    return await run(origin, server)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close((cause) => cause === undefined ? resolve() : reject(cause))
    })
  }
}

const makeFixture = async (root: string, integration: string, plugin: string, version: string): Promise<Fixture> => {
  const source = join(root, `source-${integration}-${version}`)
  const skill = join(source, "skills", "overview")
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, "SKILL.md"), [
    "---", "name: overview", "description: Artifact import fixture.", "---",
    `# ${integration}`, `Package version ${version}.`, ""
  ].join("\n"))
  const payload = join(source, "third_party", "tools", "payload.bin")
  await mkdir(join(source, "third_party", "tools"), { recursive: true })
  await writeFile(payload, new Uint8Array([0, 255, 128, 1, 42]))
  await chmod(payload, 0o755)
  const bundles = await Effect.runPromise(Effect.gen(function*() {
    const compiler = yield* Compiler
    const built: Array<Bundle> = []
    for (const format of formats) {
      const request = yield* Schema.decodeEffect(BuildRequest)({
        root: source,
        format,
        plugin: {
          id: plugin,
          version,
          description: `${integration} artifact fixture`,
          skills: ["skills/overview"],
          assets: ["third_party"],
          mcp: { [integration]: { url: `https://${integration}.example.test/mcp`, headers: {} } }
        }
      })
      built.push(yield* compiler.build(request))
    }
    return built
  }).pipe(Effect.provide(compilerLayer)))
  return { integration, plugin, version, bundles }
}

const key = (integration: string, release: string, organization = "acme") => Schema.decodeSync(ReleaseKey)({
  organization,
  integration,
  release
})

const packageDigests = (bundles: ReadonlyArray<Bundle>) => {
  const rows: Array<readonly [Format, BundleDigest]> = bundles.map(({ format, digest }) => [format, digest])
  return Schema.decodeSync(FormatDigests)(Object.fromEntries(rows))
}

const bundleAt = (bundles: ReadonlyArray<Bundle>, format: Format): Bundle => {
  const found = bundles.find((bundle) => bundle.format === format)
  if (found === undefined) throw new Error(`Missing compiler package ${format}`)
  return found
}

const fileAt = (bundle: Bundle, path: string) => {
  const found = bundle.files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`Missing package file ${path}`)
  return found
}

const catalogLayer = (directory: string) => Layer.provideMerge(
  ReleaseCatalogLive(Directory.make(directory)),
  NodeServices.layer
)

const runCatalog = <A, E>(
  directory: string,
  run: (catalog: typeof ReleaseCatalog.Service) => Effect.Effect<A, E>
): Promise<A> => Effect.runPromise(ReleaseCatalog.use(run).pipe(Effect.provide(catalogLayer(directory))))

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

const jsonBytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value) ?? "")

const archiveBytes = (bundles: ReadonlyArray<Bundle>): Uint8Array => {
  const [head, ...tail] = bundles
  if (head === undefined) throw new Error("Artifact fixture requires at least one compiler bundle")
  const encoded = Schema.encodeSync(PackageArchive)({ schema: 1, bundles: [head, ...tail] })
  return jsonBytes(encoded)
}

const artifactRelease = (input: {
  readonly key: PluginRelease["key"]
  readonly plugin: string
  readonly version: string
  readonly bundles: ReadonlyArray<Bundle>
  readonly location: string
  readonly pinBytes: Uint8Array
  readonly pin?: string
  readonly contentsPlugin?: string
  readonly packages?: FormatDigests
}): ArtifactPluginRelease => Schema.decodeSync(ArtifactPluginRelease)({
  key: input.key,
  version: input.version,
  origin: { type: "artifact", location: input.location, digest: input.pin ?? sha256(input.pinBytes) },
  contents: {
    type: "plugin",
    plugin: input.contentsPlugin ?? input.plugin,
    packages: input.packages ?? packageDigests(input.bundles)
  }
})

const localRelease = (
  releaseKey: PluginRelease["key"],
  fixture: Fixture,
  bundles: ReadonlyArray<Bundle> = fixture.bundles
): PluginRelease => Schema.decodeSync(PluginRelease)({
  key: releaseKey,
  version: fixture.version,
  origin: { type: "repository", repository: "https://example.test/plugins", commit: "a".repeat(40), path: "." },
  contents: { type: "plugin", plugin: fixture.plugin, packages: packageDigests(bundles) }
})

const importFailure = (directory: string, release: ArtifactPluginRelease) => runCatalog(
  directory,
  (catalog) => Effect.flip(catalog.import(release))
)

const failureTag = (error: CatalogImportError): string => Match.value(error).pipe(Match.tagsExhaustive({
  CatalogUnavailable: () => "CatalogUnavailable",
  CatalogInputRejected: () => "CatalogInputRejected",
  ContractRejected: () => "ContractRejected",
  PackageSetRejected: () => "PackageSetRejected",
  BundleRejected: () => "BundleRejected",
  ArtifactUnavailable: () => "ArtifactUnavailable",
  ArtifactRejected: () => "ArtifactRejected"
}))

const sendBytes = (response: ServerResponse, bytes: Uint8Array): void => {
  response.statusCode = 200
  response.setHeader("content-type", "application/json")
  response.setHeader("content-length", String(bytes.byteLength))
  response.end(Buffer.from(bytes))
}

it("imports independently pinned compiler archives and retains complete packages across reopen", async () => {
  await withDirectory(async (root) => {
    const support = await makeFixture(root, "support", "support-helper", "1.0.0")
    const payroll = await makeFixture(root, "payroll", "payroll-helper", "2.0.0")
    const update = await makeFixture(root, "payroll", "payroll-helper", "2.1.0")
    for (const fixture of [support, payroll, update]) for (const format of formats) {
      const payload = fileAt(bundleAt(fixture.bundles, format), "third_party/tools/payload.bin")
      expect(Array.from(payload.content)).toEqual([0, 255, 128, 1, 42])
      expect(payload.executable).toBe(true)
    }

    const bodies = new Map<string, Uint8Array>()
    const requests = new Map<string, number>()
    await withHttpServer((request, response) => {
      const path = request.url ?? "/"
      requests.set(path, (requests.get(path) ?? 0) + 1)
      const body = bodies.get(path)
      if (body === undefined) {
        response.statusCode = 404
        response.end()
        return
      }
      sendBytes(response, body)
    }, async (origin) => {
      const supportBytes = archiveBytes([...support.bundles].reverse())
      const payrollBytes = archiveBytes(payroll.bundles)
      const updateBytes = archiveBytes([...update.bundles].reverse())
      bodies.set("/support", supportBytes)
      bodies.set("/payroll", payrollBytes)
      bodies.set("/payroll-update", updateBytes)
      const supportRelease = artifactRelease({
        key: key("support", "approved-1"), plugin: support.plugin, version: support.version,
        bundles: support.bundles, location: `${origin}/support`, pinBytes: supportBytes
      })
      const payrollRelease = artifactRelease({
        key: key("payroll", "approved-1"), plugin: payroll.plugin, version: payroll.version,
        bundles: payroll.bundles, location: `${origin}/payroll`, pinBytes: payrollBytes
      })
      const payrollUpdateAtSameKey = artifactRelease({
        key: payrollRelease.key, plugin: update.plugin, version: update.version,
        bundles: update.bundles, location: `${origin}/payroll-update`, pinBytes: updateBytes
      })
      expect(supportRelease.origin.digest).toBe(sha256(supportBytes))
      expect(payrollRelease.origin.digest).toBe(sha256(payrollBytes))

      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => Effect.gen(function*() {
        yield* catalog.initialize
        expect(yield* catalog.import(supportRelease)).toEqual({ type: "admitted" })
        expect(yield* catalog.import(payrollRelease)).toEqual({ type: "admitted" })
        expect(yield* catalog.import(payrollRelease)).toEqual({ type: "unchanged" })
        expect(yield* catalog.import(payrollUpdateAtSameKey)).toEqual({ type: "conflict" })
      }))

      await runCatalog(directory, (catalog) => Effect.gen(function*() {
        yield* catalog.initialize
        const imported: ReadonlyArray<readonly [ArtifactPluginRelease, Fixture]> = [
          [supportRelease, support],
          [payrollRelease, payroll]
        ]
        for (const [release, fixture] of imported) {
          for (const format of formats) {
            const acquired = yield* catalog.acquire({ key: release.key, target: { type: "plugin", format } })
            expect(acquired).toEqual({ type: "plugin", release, bundle: bundleAt(fixture.bundles, format) })
            const packageFile = fileAt(bundleAt(fixture.bundles, format), "third_party/tools/payload.bin")
            expect(Array.from(packageFile.content)).toEqual([0, 255, 128, 1, 42])
            expect(packageFile.executable).toBe(true)
          }
        }
      }))
      expect(requests.get("/support")).toBe(1)
      expect(requests.get("/payroll")).toBe(2)
      expect(requests.get("/payroll-update")).toBe(1)
    })
  })
})

it("checks the artifact pin before parsing and leaves the catalog bytes untouched", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "pin-check", "pin-helper", "1.0.0")
    const malformed = new TextEncoder().encode("this is not valid JSON")
    const expectedPinnedBytes = new TextEncoder().encode("different bytes with a valid digest")
    await withHttpServer((_request, response) => sendBytes(response, malformed), async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const before = await readFile(join(directory, "catalog.json"))
      const release = artifactRelease({
        key: key("pin-check", "release-1"), plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/malformed`, pinBytes: expectedPinnedBytes
      })
      const error = await importFailure(directory, release)
      expect(failureTag(error)).toBe("ArtifactRejected")
      if (!(error instanceof ArtifactRejected)) throw error
      expect(error.reason).toBe("digest_mismatch")
      expect(await readFile(join(directory, "catalog.json"))).toEqual(before)
    })
  })
})

it("rejects correctly pinned malformed, noncanonical and package-inconsistent archives", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "invalid-archive", "archive-helper", "1.0.0")
    const validBytes = archiveBytes(fixture.bundles)
    const [archiveHead, ...archiveTail] = fixture.bundles
    if (archiveHead === undefined) throw new Error("Compiler fixture has no bundles")
    const encodedArchive = Schema.encodeSync(PackageArchive)({ schema: 1, bundles: [archiveHead, ...archiveTail] })
    const encodedBundle = Schema.encodeSync(PackageArchive)({ schema: 1, bundles: [bundleAt(fixture.bundles, "claude_code_v4")] })
    const bundleText = JSON.stringify(encodedBundle.bundles[0])
    if (bundleText === undefined) throw new Error("Compiler bundle did not encode as JSON")
    const duplicateKeys = new TextEncoder().encode(`{"schema":1,"bundles":[${bundleText}],"schema":1}`)
    const malformedJson = new TextEncoder().encode("{not a JSON archive")
    const extraField = jsonBytes({ ...encodedArchive, unexpected: true })
    const emptyArchive = jsonBytes({ schema: 1, bundles: [] })
    const malformedUtf8 = new Uint8Array([0xff, 0xfe, 0xfd])
    const claude = bundleAt(fixture.bundles, "claude_code_v4")
    const invalidFiles = claude.files.map((file) => file.path === ".claude-plugin/plugin.json"
      ? { ...file, content: new TextEncoder().encode("{}") }
      : file)
    const [fileHead, ...fileTail] = invalidFiles
    if (fileHead === undefined) throw new Error("Claude compiler bundle has no files")
    const body = Schema.decodeSync(Schema.toType(BundleBody))({
      schema: claude.schema,
      plugin: claude.plugin,
      format: claude.format,
      files: [fileHead, ...fileTail]
    })
    const invalidNative: Bundle = { ...body, digest: bundleDigest(body) }
    const invalidNativeBundles = fixture.bundles.map((bundle) => bundle.format === invalidNative.format ? invalidNative : bundle)
    const invalidNativeArchive = archiveBytes(invalidNativeBundles)

    const bodies = new Map<string, Uint8Array>([
      ["/utf8", malformedUtf8],
      ["/json", malformedJson],
      ["/duplicate", duplicateKeys],
      ["/extra", extraField],
      ["/empty", emptyArchive],
      ["/native", invalidNativeArchive],
      ["/metadata", validBytes]
    ])
    await withHttpServer((request, response) => {
      const bytes = bodies.get(request.url ?? "/")
      if (bytes === undefined) {
        response.statusCode = 404
        response.end()
        return
      }
      sendBytes(response, bytes)
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const originalCatalog = await readFile(join(directory, "catalog.json"))
      const invalid = [
        { path: "/utf8", release: artifactRelease({ key: key("invalid-archive", "utf8"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/utf8`, pinBytes: malformedUtf8 }), expected: "ArtifactRejected" },
        { path: "/json", release: artifactRelease({ key: key("invalid-archive", "json"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/json`, pinBytes: malformedJson }), expected: "ArtifactRejected" },
        { path: "/duplicate", release: artifactRelease({ key: key("invalid-archive", "duplicate"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/duplicate`, pinBytes: duplicateKeys }), expected: "ArtifactRejected" },
        { path: "/extra", release: artifactRelease({ key: key("invalid-archive", "extra"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/extra`, pinBytes: extraField }), expected: "ArtifactRejected" },
        { path: "/empty", release: artifactRelease({ key: key("invalid-archive", "empty"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/empty`, pinBytes: emptyArchive }), expected: "ArtifactRejected" },
        { path: "/native", release: artifactRelease({ key: key("invalid-archive", "native"), plugin: fixture.plugin, version: fixture.version, bundles: invalidNativeBundles, location: `${origin}/native`, pinBytes: invalidNativeArchive }), expected: "BundleRejected" },
        { path: "/metadata", release: artifactRelease({ key: key("invalid-archive", "metadata"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, contentsPlugin: "other-plugin", location: `${origin}/metadata`, pinBytes: validBytes }), expected: "PackageSetRejected" }
      ]
      for (const scenario of invalid) {
        const error = await importFailure(directory, scenario.release)
        expect(failureTag(error)).toBe(scenario.expected)
        expect(await readFile(join(directory, "catalog.json"))).toEqual(originalCatalog)
      }
    })
  })
})

it("rejects non-200 responses and redirects without contacting the redirect target", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "http-errors", "http-helper", "1.0.0")
    const bytes = archiveBytes(fixture.bundles)
    let targetRequests = 0
    const requests = new Map<string, number>()
    const stalledStatusHeaders = deferred<void>()
    const releaseStalledStatus = deferred<void>()
    const stalledStatusSocketClosed = deferred<void>()
    await withHttpServer((request, response) => {
      const path = request.url ?? "/"
      requests.set(path, (requests.get(path) ?? 0) + 1)
      if (path === "/redirect") {
        response.statusCode = 302
        response.setHeader("location", "/target")
        response.end()
        return
      }
      if (path === "/stalled-status") {
        response.statusCode = 503
        response.flushHeaders()
        request.socket.once("close", () => stalledStatusSocketClosed.complete(undefined))
        stalledStatusHeaders.complete(undefined)
        void releaseStalledStatus.promise.then(() => {
          if (!response.destroyed) response.end("unavailable")
        })
        return
      }
      if (path === "/target") targetRequests += 1
      response.statusCode = 503
      response.end("unavailable")
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const originalCatalog = await readFile(join(directory, "catalog.json"))
      const failures = [
        artifactRelease({ key: key("http-errors", "status"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/status`, pinBytes: bytes }),
        artifactRelease({ key: key("http-errors", "redirect"), plugin: fixture.plugin, version: fixture.version, bundles: fixture.bundles, location: `${origin}/redirect`, pinBytes: bytes })
      ]
      for (const release of failures) {
        const error = await importFailure(directory, release)
        expect(failureTag(error)).toBe("ArtifactUnavailable")
        expect(await readFile(join(directory, "catalog.json"))).toEqual(originalCatalog)
      }
      const stalledRelease = artifactRelease({
        key: key("http-errors", "stalled-status"), plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/stalled-status`, pinBytes: bytes
      })
      const stalledImport = importFailure(directory, stalledRelease)
      let releasedByGuard = false
      let releaseGuard: ReturnType<typeof setTimeout> | undefined
      try {
        await stalledStatusHeaders.promise
        releaseGuard = setTimeout(() => {
          releasedByGuard = true
          releaseStalledStatus.complete(undefined)
        }, 5_000)
        const error = await stalledImport
        expect(releasedByGuard).toBe(false)
        expect(failureTag(error)).toBe("ArtifactUnavailable")
        await stalledStatusSocketClosed.promise
        expect(await readFile(join(directory, "catalog.json"))).toEqual(originalCatalog)
      } finally {
        if (releaseGuard !== undefined) clearTimeout(releaseGuard)
        releaseStalledStatus.complete(undefined)
        await stalledImport.catch(() => undefined)
      }
      expect(requests.get("/status")).toBe(1)
      expect(requests.get("/redirect")).toBe(1)
      expect(requests.get("/stalled-status")).toBe(1)
      expect(targetRequests).toBe(0)
    })
  })
}, 10_000)

it("rejects invalid artifact locations before opening an HTTP request", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "invalid-url", "url-helper", "1.0.0")
    const bytes = archiveBytes(fixture.bundles)
    let requestCount = 0
    await withHttpServer((_request, response) => {
      requestCount += 1
      sendBytes(response, bytes)
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const originalCatalog = await readFile(join(directory, "catalog.json"))
      const invalidLocations = [
        "file:///tmp/archive.json",
        "http://user:secret@127.0.0.1/archive.json",
        "http://127.attacker.test/archive.json",
        `${origin}/archive.json#fragment`,
        `${origin}/` + "${artifactPath}"
      ]
      for (const [index, location] of invalidLocations.entries()) {
        const release = artifactRelease({
          key: key("invalid-url", `release-${index}`), plugin: fixture.plugin, version: fixture.version,
          bundles: fixture.bundles, location, pinBytes: bytes
        })
        const error = await importFailure(directory, release)
        expect(failureTag(error)).toBe("CatalogInputRejected")
        expect(await readFile(join(directory, "catalog.json"))).toEqual(originalCatalog)
      }
      expect(requestCount).toBe(0)
    })
  })
})

it("snapshots release metadata before the HTTP acquisition starts", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "snapshot", "snapshot-helper", "1.0.0")
    const bytes = archiveBytes(fixture.bundles)
    const requested = deferred<void>()
    const resumeResponse = deferred<void>()
    const paths = new Map<string, number>()
    await withHttpServer((request, response) => {
      const path = request.url ?? "/"
      paths.set(path, (paths.get(path) ?? 0) + 1)
      if (path === "/source") {
        requested.complete(undefined)
        void resumeResponse.promise.then(() => {
          if (!response.destroyed) sendBytes(response, bytes)
        })
        return
      }
      response.statusCode = 404
      response.end()
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const originalKey = key("snapshot", "release-1")
      const release = artifactRelease({
        key: originalKey, plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/source`, pinBytes: bytes
      })
      const expectedRelease = structuredClone(release)
      const importPromise = runCatalog(directory, (catalog) => catalog.import(release))
      try {
        const started = await Promise.race([
          requested.promise.then(() => true),
          importPromise.then(() => false, () => false)
        ])
        expect(started).toBe(true)
        Object.assign(release, {
          key: key("snapshot-mutated", "release-mutated"),
          origin: {
            type: "artifact",
            location: `${origin}/mutated-target`,
            digest: ArtifactDigest.make("f".repeat(64))
          }
        })
      } finally {
        resumeResponse.complete(undefined)
        await importPromise.catch(() => undefined)
      }
      expect(await importPromise).toEqual({ type: "admitted" })
      expect(paths.get("/source")).toBe(1)
      expect(paths.get("/mutated-target")).toBeUndefined()
      await runCatalog(directory, (catalog) => Effect.gen(function*() {
        const acquired = yield* catalog.acquire({ key: originalKey, target: { type: "plugin", format: "claude_code_v4" } })
        expect(acquired).toEqual({
          type: "plugin", release: expectedRelease,
          bundle: bundleAt(fixture.bundles, "claude_code_v4")
        })
      }))
    })
  })
})

it("releases the stalled HTTP exchange on interruption and keeps local admissions moving", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "interrupt", "interrupt-helper", "1.0.0")
    const bytes = archiveBytes(fixture.bundles)
    const requested = deferred<void>()
    const socketClosed = deferred<void>()
    await withHttpServer((request, response) => {
      if (request.url !== "/stalled") {
        response.statusCode = 404
        response.end()
        return
      }
      requested.complete(undefined)
      request.socket.once("close", () => socketClosed.complete(undefined))
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const firstRelease = localRelease(key("interrupt-local", "release-1"), fixture)
      const remoteRelease = artifactRelease({
        key: key("interrupt-remote", "release-1"), plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/stalled`, pinBytes: bytes
      })
      await runCatalog(directory, (catalog) => catalog.admit({ type: "plugin", release: firstRelease, bundles: [...fixture.bundles] }))
      const importFiber = Effect.runFork(ReleaseCatalog.use((catalog) => catalog.import(remoteRelease)).pipe(
        Effect.provide(catalogLayer(directory))
      ))
      try {
        await requested.promise

        const concurrentRelease = localRelease(key("interrupt-concurrent", "release-1"), fixture)
        expect(await runCatalog(directory, (catalog) => catalog.admit({
          type: "plugin",
          release: concurrentRelease,
          bundles: [...fixture.bundles]
        }))).toEqual({ type: "admitted" })
        const afterLocalAdmission = await readFile(join(directory, "catalog.json"))

        await Effect.runPromise(Fiber.interrupt(importFiber))
        const exit = await Effect.runPromise(Fiber.await(importFiber))
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
        await socketClosed.promise
        expect(await readFile(join(directory, "catalog.json"))).toEqual(afterLocalAdmission)
        await runCatalog(directory, (catalog) => Effect.gen(function*() {
          const acquired = yield* catalog.acquire({ key: firstRelease.key, target: { type: "plugin", format: "claude_code_v4" } })
          expect(acquired).toEqual({
            type: "plugin", release: firstRelease,
            bundle: bundleAt(fixture.bundles, "claude_code_v4")
          })
        }))
      } finally {
        await Effect.runPromise(Fiber.interrupt(importFiber))
      }
    })
  })
})

it("rejects both declared and streamed bodies above the 64 MiB limit", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "too-large", "large-helper", "1.0.0")
    const validBytes = archiveBytes(fixture.bundles)
    const streamed = deferred<number>()
    const requests = new Map<string, number>()
    let streamedBytes = 0
    await withHttpServer((request, response) => {
      const path = request.url ?? "/"
      requests.set(path, (requests.get(path) ?? 0) + 1)
      if (path === "/declared") {
        response.writeHead(200, { "content-type": "application/json", "content-length": String(maxArtifactBytes + 1) })
        response.flushHeaders()
        response.end()
        return
      }
      if (path !== "/chunked") {
        response.statusCode = 404
        response.end()
        return
      }
      response.writeHead(200, { "content-type": "application/json" })
      const chunk = Buffer.alloc(64 * 1024, 0x61)
      const target = maxArtifactBytes + 1
      const writeNext = (): void => {
        if (response.destroyed) return
        while (streamedBytes < target) {
          const length = Math.min(chunk.byteLength, target - streamedBytes)
          const writable = response.write(chunk.subarray(0, length))
          streamedBytes += length
          if (!writable) {
            response.once("drain", writeNext)
            return
          }
        }
        response.end()
      }
      response.once("close", () => streamed.complete(streamedBytes))
      writeNext()
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const before = await readFile(join(directory, "catalog.json"))
      const declared = artifactRelease({
        key: key("too-large", "declared"), plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/declared`, pinBytes: validBytes
      })
      const declaredError = await importFailure(directory, declared)
      expect(failureTag(declaredError)).toBe("ArtifactRejected")
      if (!(declaredError instanceof ArtifactRejected)) throw declaredError
      expect(declaredError.reason).toBe("too_large")
      expect(await readFile(join(directory, "catalog.json"))).toEqual(before)

      const chunked = artifactRelease({
        key: key("too-large", "chunked"), plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/chunked`, pinBytes: validBytes
      })
      const chunkedError = await importFailure(directory, chunked)
      expect(failureTag(chunkedError)).toBe("ArtifactRejected")
      if (!(chunkedError instanceof ArtifactRejected)) throw chunkedError
      expect(chunkedError.reason).toBe("too_large")
      expect(await streamed.promise).toBeGreaterThan(maxArtifactBytes)
      expect(await readFile(join(directory, "catalog.json"))).toEqual(before)
      expect(requests.get("/declared")).toBe(1)
      expect(requests.get("/chunked")).toBe(1)
    })
  })
})

it("enforces the real 30 second acquisition timeout", async () => {
  await withDirectory(async (root) => {
    const fixture = await makeFixture(root, "timeout", "timeout-helper", "1.0.0")
    const bytes = archiveBytes(fixture.bundles)
    const requested = deferred<void>()
    const socketClosed = deferred<void>()
    await withHttpServer((request) => {
      if (request.url !== "/stalled") return
      requested.complete(undefined)
      request.socket.once("close", () => socketClosed.complete(undefined))
    }, async (origin) => {
      const directory = join(root, "catalog")
      await runCatalog(directory, (catalog) => catalog.initialize)
      const before = await readFile(join(directory, "catalog.json"))
      const release = artifactRelease({
        key: key("timeout", "release-1"), plugin: fixture.plugin, version: fixture.version,
        bundles: fixture.bundles, location: `${origin}/stalled`, pinBytes: bytes
      })
      const started = performance.now()
      const importPromise = importFailure(directory, release)
      await requested.promise
      const error = await importPromise
      expect(failureTag(error)).toBe("ArtifactUnavailable")
      expect(performance.now() - started).toBeGreaterThanOrEqual(29_000)
      await socketClosed.promise
      expect(await readFile(join(directory, "catalog.json"))).toEqual(before)
    })
  })
}, 40_000)
