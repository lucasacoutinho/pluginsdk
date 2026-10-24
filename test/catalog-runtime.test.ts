import { spawn } from "node:child_process"
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Match, Schema } from "effect"
import { FormatDigests } from "../contracts/Catalog.ts"
import { BuildRequest, BundleBody, Compiler, type Bundle, type BundleDigest, type Format } from "../contracts/Compiler.ts"
import {
  Admission as AdmissionSchema,
  AdmissionRequest,
  CatalogUnavailable,
  PluginRelease,
  ReleaseCatalog,
  ReleaseKey
} from "../contracts/Registry.ts"
import type { Admission } from "../contracts/Registry.ts"
import { Directory } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { ReleaseCatalogLive } from "../src/catalog/index.ts"

const formats: ReadonlyArray<Format> = ["claude_code", "codex"]
const compilerLayer = Layer.provideMerge(CompilerLive, NodeServices.layer)
const writerPath = fileURLToPath(new URL("./fixtures/catalog-writer.ts", import.meta.url))

type Fixture = {
  readonly integration: string
  readonly plugin: string
  readonly version: string
  readonly bundles: ReadonlyArray<Bundle>
}

const withDirectory = async <A>(run: (root: string) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-catalog-runtime-"))
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const makeFixture = async (root: string, integration: string, plugin: string, version: string): Promise<Fixture> => {
  const source = join(root, `source-${integration}-${version}`)
  const skill = join(source, "skills", "overview")
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, "SKILL.md"), [
    "---", "name: overview", "description: Catalog runtime fixture.", "---",
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
          description: `${integration} application integration`,
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

const makeRelease = (
  releaseKey: PluginRelease["key"],
  plugin: string,
  version: string,
  bundles: ReadonlyArray<Bundle>,
  packages = packageDigests(bundles)
): PluginRelease => Schema.decodeSync(PluginRelease)({
  key: releaseKey,
  version,
  origin: { type: "repository", repository: "https://example.test/acme/plugins", commit: "a".repeat(40), path: "." },
  contents: { type: "plugin", plugin, packages }
})

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

const packageIssues = (catalog: typeof ReleaseCatalog.Service, request: AdmissionRequest) =>
  Effect.flip(catalog.admit(request)).pipe(Effect.map((error) => Match.value(error).pipe(Match.tagsExhaustive({
    CatalogUnavailable: (cause) => { throw cause },
    CatalogInputRejected: (cause) => { throw cause },
    PackageSetRejected: (cause) => cause.issues,
    BundleRejected: (cause) => { throw cause },
    ContractRejected: (cause) => { throw cause }
  }))))

const bundleIssues = (catalog: typeof ReleaseCatalog.Service, request: AdmissionRequest) =>
  Effect.flip(catalog.admit(request)).pipe(Effect.map((error) => Match.value(error).pipe(Match.tagsExhaustive({
    CatalogUnavailable: (cause) => { throw cause },
    CatalogInputRejected: (cause) => { throw cause },
    PackageSetRejected: (cause) => { throw cause },
    BundleRejected: (cause) => cause.issues,
    ContractRejected: (cause) => { throw cause }
  }))))

const repackage = (bundle: Bundle, files: ReadonlyArray<Bundle["files"][number]>): Bundle => {
  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files
  })
  return { ...body, digest: bundleDigest(body) }
}

const launchWriter = (directory: string, requestPath: string): Promise<Admission> => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--experimental-strip-types", writerPath, directory, requestPath], {
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000)
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
  child.once("error", (cause) => {
    clearTimeout(timeout)
    reject(cause)
  })
  child.once("close", (code) => {
    clearTimeout(timeout)
    if (code !== 0) {
      reject(new Error(`Catalog writer exited ${String(code)}: ${stderr}`))
      return
    }
    try {
      resolve(Schema.decodeUnknownSync(AdmissionSchema)(JSON.parse(stdout)))
    } catch (cause) {
      reject(cause)
    }
  })
})

it("stores complete compiler packages for two integrations and reloads them after a layer restart", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const apps = [
      await makeFixture(root, "support", "support-helper", "1.0.0"),
      await makeFixture(root, "payroll", "payroll-helper", "2.1.0")
    ]
    const releases = apps.map((app) => makeRelease(key(app.integration, "release-1"), app.plugin, app.version, app.bundles))
    const firstApp = apps[0]
    if (firstApp === undefined) throw new Error("Catalog fixture has no applications")
    const claudeBundle = bundleAt(firstApp.bundles, "claude_code")
    const claudeOnlyRelease = makeRelease(
      key(firstApp.integration, "release-claude-only"), firstApp.plugin, firstApp.version, [claudeBundle]
    )
    for (const app of apps) for (const format of formats) {
      const payload = fileAt(bundleAt(app.bundles, format), "third_party/tools/payload.bin")
      expect(Array.from(payload.content)).toEqual([0, 255, 128, 1, 42])
      expect(payload.executable).toBe(true)
    }

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      for (const [index, app] of apps.entries()) {
        const release = releases[index]
        if (release === undefined) throw new Error(`Missing release ${index}`)
        expect(yield* catalog.admit({ type: "plugin", release, bundles: [...app.bundles] })).toEqual({ type: "admitted" })
      }
      expect(yield* catalog.admit({ type: "plugin", release: claudeOnlyRelease, bundles: [claudeBundle] }))
        .toEqual({ type: "admitted" })
    }))
    expect(await readdir(directory)).toContain("catalog.json")

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      for (const [index, app] of apps.entries()) {
        const release = releases[index]
        if (release === undefined) throw new Error(`Missing release ${index}`)
        for (const format of formats) {
          const acquired = yield* catalog.acquire({ key: release.key, target: { type: "plugin", format } })
          const expected = bundleAt(app.bundles, format)
          expect(acquired).toEqual({ type: "plugin", release, bundle: expected })
        }
      }
      const first = releases[0]
      if (first === undefined) throw new Error("First application release is missing")
      expect(yield* catalog.acquire({
        key: key(first.key.integration, first.key.release, "another-org"),
        target: { type: "plugin", format: "claude_code" }
      }))
        .toEqual({ type: "blocked", reason: "release_missing" })
      expect(yield* catalog.acquire({
        key: claudeOnlyRelease.key, target: { type: "plugin", format: "codex" }
      })).toEqual({ type: "blocked", reason: "format_unavailable" })
    }))
  })
})

it("keeps an admitted key immutable while admitting a new key and ignoring bundle order", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const original = await makeFixture(root, "inventory", "inventory-helper", "1.0.0")
    const changed = await makeFixture(root, "inventory", "inventory-helper", "1.1.0")
    const originalKey = key("inventory", "release-1")
    const originalRelease = makeRelease(originalKey, original.plugin, original.version, original.bundles)
    const changedAtSameKey = makeRelease(originalKey, changed.plugin, changed.version, changed.bundles)
    const changedAtNewKey = makeRelease(key("inventory", "release-2"), changed.plugin, changed.version, changed.bundles)

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      expect(yield* catalog.admit({ type: "plugin", release: originalRelease, bundles: [...original.bundles] })).toEqual({ type: "admitted" })
      expect(yield* catalog.admit({ type: "plugin", release: originalRelease, bundles: [...original.bundles].reverse() })).toEqual({ type: "unchanged" })
      expect(yield* catalog.admit({ type: "plugin", release: changedAtSameKey, bundles: [...changed.bundles] })).toEqual({ type: "conflict" })
      expect(yield* catalog.admit({ type: "plugin", release: changedAtNewKey, bundles: [...changed.bundles] })).toEqual({ type: "admitted" })
      const retained = yield* catalog.acquire({ key: originalKey, target: { type: "plugin", format: "claude_code" } })
      expect(retained).toEqual({
        type: "plugin", release: originalRelease, bundle: bundleAt(original.bundles, "claude_code")
      })
    }))
  })
})

it("returns typed package-set rejections for missing, extra, duplicate and mismatched packages", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const app = await makeFixture(root, "calendar", "calendar-helper", "1.0.0")
    const otherPlugin = await makeFixture(root, "calendar-other", "other-helper", "1.0.0")
    const otherVersion = await makeFixture(root, "calendar", app.plugin, "1.1.0")
    const claude = bundleAt(app.bundles, "claude_code")
    const codex = bundleAt(app.bundles, "codex")
    const otherClaude = bundleAt(otherPlugin.bundles, "claude_code")
    const versionClaude = bundleAt(otherVersion.bundles, "claude_code")
    const fullRelease = makeRelease(key("calendar", "release-full"), app.plugin, app.version, app.bundles)
    const onlyClaudeRelease = makeRelease(key("calendar", "release-one"), app.plugin, app.version, [claude])
    const pluginMismatch = makeRelease(
      key("calendar", "release-plugin"), app.plugin, app.version, [otherClaude], packageDigests([otherClaude])
    )
    const versionMismatch = makeRelease(
      key("calendar", "release-version"), app.plugin, app.version, [versionClaude], packageDigests([versionClaude])
    )
    const digestMismatch = makeRelease(
      key("calendar", "release-digest"), app.plugin, app.version, [claude], packageDigests([versionClaude])
    )

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      expect(yield* packageIssues(catalog, { type: "plugin", release: fullRelease, bundles: [claude] })).toEqual([
        { type: "missing_package", format: "codex" }
      ])
      expect(yield* packageIssues(catalog, { type: "plugin", release: onlyClaudeRelease, bundles: [claude, codex] })).toEqual([
        { type: "unexpected_package", format: "codex" }
      ])
      expect(yield* packageIssues(catalog, { type: "plugin", release: fullRelease, bundles: [claude, codex, claude] })).toEqual([
        { type: "duplicate_package", format: "claude_code" }
      ])
      expect(yield* packageIssues(catalog, { type: "plugin", release: pluginMismatch, bundles: [otherClaude] })).toEqual([
        { type: "plugin_mismatch", format: "claude_code" }
      ])
      expect(yield* packageIssues(catalog, { type: "plugin", release: versionMismatch, bundles: [versionClaude] })).toEqual([
        { type: "version_mismatch", format: "claude_code" }
      ])
      expect(yield* packageIssues(catalog, { type: "plugin", release: digestMismatch, bundles: [claude] })).toEqual([
        { type: "digest_mismatch", format: "claude_code" }
      ])
    }))
  })
})

it("rejects a changed digest and a resealed invalid native manifest", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const app = await makeFixture(root, "notes", "notes-helper", "1.0.0")
    const claude = bundleAt(app.bundles, "claude_code")
    const manifest = claude.files.find((file) => file.path === ".claude-plugin/plugin.json")
    if (manifest === undefined) throw new Error("Compiler package has no Claude manifest")
    const tampered = {
      ...repackage(claude, claude.files.map((file) => file.path === manifest.path
        ? { ...file, content: new Uint8Array([...file.content, 0]) }
        : file)),
      digest: claude.digest
    }
    const resealed = repackage(claude, claude.files.map((file) => file.path === manifest.path
      ? { ...file, content: new TextEncoder().encode("{}") }
      : file))
    const tamperedRelease = makeRelease(key("notes", "release-tampered"), app.plugin, app.version, [claude])
    const resealedRelease = makeRelease(key("notes", "release-resealed"), app.plugin, app.version, [resealed])

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      const changed = yield* bundleIssues(catalog, { type: "plugin", release: tamperedRelease, bundles: [tampered] })
      expect(changed.some((issue) => issue.type === "digest_mismatch")).toBe(true)
      const invalidNative = yield* bundleIssues(catalog, { type: "plugin", release: resealedRelease, bundles: [resealed] })
      expect(invalidNative.some((issue) => issue.type === "invalid_native_package")).toBe(true)
    }))
  })
})

it("copies caller and acquisition bytes so neither can alter later reads", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const app = await makeFixture(root, "docs", "docs-helper", "1.0.0")
    const release = makeRelease(key("docs", "release-1"), app.plugin, app.version, app.bundles)
    const candidates = [...app.bundles]
    const expected = bundleAt(app.bundles, "claude_code")
    const original = structuredClone(expected)

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      expect(yield* catalog.admit({ type: "plugin", release, bundles: candidates })).toEqual({ type: "admitted" })
      for (const bundle of candidates) for (const file of bundle.files) file.content.fill(0)
      candidates.splice(0, candidates.length)

      const first = yield* catalog.acquire({ key: release.key, target: { type: "plugin", format: "claude_code" } })
      expect(first.type).toBe("plugin")
      if (first.type === "plugin") {
        expect(first.bundle).toEqual(original)
        for (const file of first.bundle.files) file.content.fill(0)
      }
      const second = yield* catalog.acquire({ key: release.key, target: { type: "plugin", format: "claude_code" } })
      expect(second).toEqual({ type: "plugin", release, bundle: original })
    }))
  })
})

it("blocks missing, corrupt, linked and schema-invalid stores without recreating them", async () => {
  const appRoot = await mkdtemp(join(tmpdir(), "pluginsdk-catalog-invalid-fixture-"))
  try {
    const app = await makeFixture(appRoot, "mail", "mail-helper", "1.0.0")
    const bundle = bundleAt(app.bundles, "claude_code")
    const release = makeRelease(key("mail", "release-1"), app.plugin, app.version, [bundle])
    const cases = ["missing", "corrupt", "symlink", "invalid"] as const
    for (const kind of cases) {
      await withDirectory(async (root) => {
        const directory = join(root, "catalog")
        const file = join(directory, "catalog.json")
        await mkdir(directory)
        if (kind === "corrupt") await writeFile(file, "{")
        if (kind === "invalid") await writeFile(file, "{}")
        if (kind === "symlink") {
          const target = join(root, "external.json")
          await writeFile(target, "{}")
          await symlink(target, file)
        }

        await runCatalog(directory, (catalog) => Effect.gen(function*() {
          const initialization = yield* Effect.flip(catalog.initialize)
          expect(initialization).toBeInstanceOf(CatalogUnavailable)
          const admission = yield* Effect.flip(catalog.admit({ type: "plugin", release, bundles: [bundle] }))
          expect(admission).toBeInstanceOf(CatalogUnavailable)
          const acquisition = yield* Effect.flip(catalog.acquire({
            key: release.key,
            target: { type: "plugin", format: "claude_code" }
          }))
          expect(acquisition).toBeInstanceOf(CatalogUnavailable)
        }))

        if (kind === "missing") await expect(readFile(file)).rejects.toHaveProperty("code", "ENOENT")
        if (kind === "corrupt") expect(await readFile(file, "utf8")).toBe("{")
        if (kind === "invalid") expect(await readFile(file, "utf8")).toBe("{}")
        if (kind === "symlink") {
          expect((await lstat(file)).isSymbolicLink()).toBe(true)
          expect(await readlink(file)).toBe(join(root, "external.json"))
          expect(await readFile(join(root, "external.json"), "utf8")).toBe("{}")
        }
      })
    }
  } finally {
    await rm(appRoot, { recursive: true, force: true })
  }
})

it("serializes independent child-process admissions and keeps one complete conflicting winner", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const base = await makeFixture(root, "crm", "crm-helper", "1.0.0")
    const update = await makeFixture(root, "crm", "crm-helper", "1.1.0")
    const uniqueA = makeRelease(key("crm-a", "release-1"), base.plugin, base.version, base.bundles)
    const uniqueB = makeRelease(key("crm-b", "release-1"), base.plugin, base.version, base.bundles)
    const conflictA = makeRelease(key("crm-conflict", "release-1"), base.plugin, base.version, base.bundles)
    const conflictB = makeRelease(conflictA.key, update.plugin, update.version, update.bundles)
    const requests: ReadonlyArray<AdmissionRequest> = [
      { type: "plugin", release: uniqueA, bundles: [...base.bundles] },
      { type: "plugin", release: uniqueB, bundles: [...base.bundles] },
      { type: "plugin", release: conflictA, bundles: [...base.bundles] },
      { type: "plugin", release: conflictB, bundles: [...update.bundles] }
    ]
    await runCatalog(directory, (catalog) => catalog.initialize)

    const paths = await Promise.all(requests.map(async (request, index) => {
      const path = join(root, `request-${index}.json`)
      await writeFile(path, JSON.stringify(Schema.encodeSync(AdmissionRequest)(request)))
      return path
    }))
    const admissions = await Promise.all(paths.map((path) => launchWriter(directory, path)))
    expect(admissions.slice(0, 2)).toEqual([{ type: "admitted" }, { type: "admitted" }])
    expect(admissions.slice(2).map((result) => result.type).sort()).toEqual(["admitted", "conflict"])

    const firstConflict = admissions[2]
    if (firstConflict === undefined) throw new Error("Conflicting writer result is missing")
    const winner = Match.value(firstConflict).pipe(Match.discriminatorsExhaustive("type")({
      admitted: () => ({ type: "plugin", release: conflictA, bundles: base.bundles }),
      unchanged: () => { throw new Error("Conflicting release was unchanged") },
      conflict: () => ({ type: "plugin", release: conflictB, bundles: update.bundles })
    }))
    const retained = [
      { type: "plugin", release: uniqueA, bundles: base.bundles },
      { type: "plugin", release: uniqueB, bundles: base.bundles },
      winner
    ]

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      for (const row of retained) {
        const acquired = yield* catalog.acquire({
          key: row.release.key,
          target: { type: "plugin", format: "codex" }
        })
        expect(acquired).toEqual({
          type: "plugin", release: row.release, bundle: bundleAt(row.bundles, "codex")
        })
      }
    }))
  })
})
