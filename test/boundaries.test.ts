import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Deferred, Effect, Fiber, FileSystem, Layer, Match, Schema } from "effect"
import { join } from "node:path"
import { BuildRequest, Bundle as BundleSchema, BundleBody, Compiler, SourceUnavailable, type BuildIssue, type Bundle, type PackageFile } from "../contracts/Compiler.ts"
import { DestinationUnsupported, InstallationKey, Installer, PlanBody, PlanRequest, ReadyPlan, type Destination, type Host, type PlanChange, type Planning } from "../contracts/Installer.ts"
import { Directory, PackagePath, PluginId } from "../contracts/Plugin.ts"
import { bundleDigest, planId } from "../src/internal/identity.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { InstallerLive } from "../src/installer/index.ts"
import { snapshotPlan, snapshotRequest } from "../src/installer/lifecycle/plans.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

type BuildOutcome =
  | { readonly type: "built"; readonly bundle: Bundle }
  | { readonly type: "rejected"; readonly issues: ReadonlyArray<BuildIssue> }
  | { readonly type: "unavailable"; readonly error: SourceUnavailable }

const makeRequest = (root: string, options: { readonly version?: string; readonly skills?: ReadonlyArray<string> } = {}) =>
  Schema.decodeSync(BuildRequest)({
    root,
    format: "codex",
    plugin: {
      id: "demo",
      version: options.version ?? "1.0.0",
      description: "Boundary fixture",
      skills: options.skills ?? [],
      mcp: {}
    }
  })

const buildOutcome = (request: BuildRequest) =>
  Compiler.use((compiler) => Effect.result(compiler.build(request))).pipe(
    Effect.map((result): BuildOutcome => Match.value(result).pipe(
      Match.tagsExhaustive({
        Failure: (failure) => Match.value(failure.failure).pipe(Match.tagsExhaustive({
          BuildRejected: (rejected): BuildOutcome => ({ type: "rejected", issues: rejected.issues }),
          SourceUnavailable: (unavailable): BuildOutcome => ({ type: "unavailable", error: unavailable })
        })),
        Success: (success): BuildOutcome => ({ type: "built", bundle: success.success })
      })
    ))
  )

const bundleFrom = (outcome: BuildOutcome): Bundle => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    built: (value) => value.bundle,
    rejected: () => { throw new Error("Expected a successful build") },
    unavailable: (value) => { throw value.error }
  })
)

const issuesFrom = (outcome: BuildOutcome): ReadonlyArray<BuildIssue> => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    built: () => { throw new Error("Expected a rejected build") },
    rejected: (value) => value.issues,
    unavailable: (value) => { throw value.error }
  })
)

type PlanOutcome =
  | { readonly type: "planned"; readonly planning: Planning }
  | { readonly type: "unsupported"; readonly error: DestinationUnsupported }
  | { readonly type: "other_error"; readonly detail: string }

const planOutcome = (request: PlanRequest) =>
  Installer.use((installer) => Effect.result(installer.plan(request))).pipe(
    Effect.map((result): PlanOutcome => Match.value(result).pipe(
      Match.tagsExhaustive({
        Failure: (failure) => Match.value(failure.failure).pipe(Match.tagsExhaustive({
          BundleRejected: (): PlanOutcome => ({ type: "other_error", detail: "BundleRejected" }),
          DestinationUnsupported: (error): PlanOutcome => ({ type: "unsupported", error }),
          HostUnavailable: (): PlanOutcome => ({ type: "other_error", detail: "HostUnavailable" }),
          StateUnavailable: (): PlanOutcome => ({ type: "other_error", detail: "StateUnavailable" })
        })),
        Success: (success): PlanOutcome => ({ type: "planned", planning: success.success })
      })
    ))
  )

const unsupportedFrom = (outcome: PlanOutcome): DestinationUnsupported => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    planned: () => { throw new Error("Expected an unsupported destination") },
    unsupported: (value) => value.error,
    other_error: (value) => { throw new Error(`Expected DestinationUnsupported; got ${value.detail}`) }
  })
)

const bundleFile = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Expected package file ${path}`)
  return file
}

const makeBundle = (content: Uint8Array): Bundle => {
  const body = Schema.decodeSync(Schema.toType(BundleBody))({
    schema: 1,
    plugin: PluginId.make("demo"),
    format: "codex",
    files: [{ path: PackagePath.make(".codex-plugin/plugin.json"), content, executable: false }]
  })
  return Schema.decodeSync(Schema.toType(BundleSchema))({ ...body, digest: bundleDigest(body) })
}

const validManifestBytes = (): Uint8Array => new TextEncoder().encode(JSON.stringify({
  name: "demo",
  version: "opaque build_7",
  description: "Boundary snapshot"
}))

const sharedBundle = () => {
  const shared = new SharedArrayBuffer(validManifestBytes().byteLength)
  const content = new Uint8Array(shared)
  content.set(validManifestBytes())
  const bundle = makeBundle(content)
  return { shared, content, bundle }
}

it.effect("Compiler.build snapshots mutable request values before real filesystem suspension", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-boundary-build-" })
    const entryPath = join(root, "skills", "alpha", "SKILL.md")
    yield* fs.makeDirectory(join(root, "skills", "alpha"), { recursive: true })
    const originalEntry = ["---", "name: alpha", "description: boundary test", "---", "# alpha", ""].join("\n")
    yield* fs.writeFileString(entryPath, originalEntry)
    yield* fs.writeFileString(join(root, "LICENSE"), "Original license asset\n")

    const entered = yield* Deferred.make<void>()
    const resume = yield* Deferred.make<void>()
    const gatedFileSystem = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function*() {
        const realFileSystem = yield* FileSystem.FileSystem
        return {
          ...realFileSystem,
          realPath: (path: string) => Effect.gen(function*() {
            if (path === root) {
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(resume)
            }
            return yield* realFileSystem.realPath(path)
          })
        } satisfies FileSystem.FileSystem
      })
    ).pipe(Layer.provide(NodeServices.layer))
    const gatedCompiler = Layer.provideMerge(CompilerLive, gatedFileSystem)

    const request = yield* Schema.decodeEffect(BuildRequest)({
      root,
      format: "claude_code",
      plugin: {
        id: "demo",
        version: "1.0.0",
        description: "Original metadata",
        skills: ["skills/alpha"],
        assets: ["LICENSE"],
        mcp: { docs: { url: "https://EXAMPLE.com:443/original", headers: {} } }
      }
    })
    const docs = request.plugin.mcp["docs"]
    if (docs === undefined) throw new Error("Expected docs endpoint in test request")
    const url = Match.value(docs).pipe(
      Match.when({ url: Match.defined }, (source) => source.url),
      Match.when({ type: "stdio" }, () => { throw new Error("Expected a remote endpoint in test request") }),
      Match.exhaustive
    )

    const fiber = yield* buildOutcome(request).pipe(Effect.provide(gatedCompiler), Effect.forkChild)
    yield* Deferred.await(entered)

    Object.assign(request.plugin, {
      id: PluginId.make("mutated"),
      version: "invalid/path",
      description: "Mutated metadata"
    })
    Object.assign(request.plugin, { skills: [PackagePath.make("skills/missing")] })
    Object.assign(request.plugin, { assets: [PackagePath.make("missing-license")] })
    url.hostname = "mutated.example"
    yield* Deferred.succeed(resume, undefined)

    const bundle = bundleFrom(yield* Fiber.join(fiber))
    expect(bundle.plugin).toBe("demo")
    expect(new TextDecoder().decode(bundleFile(bundle, ".claude-plugin/plugin.json").content)).toContain("Original metadata")
    expect(new TextDecoder().decode(bundleFile(bundle, ".mcp.json").content)).toContain("https://example.com/original")
    const capturedEntry = bundleFile(bundle, "skills/alpha/SKILL.md")
    const capturedText = new TextDecoder().decode(capturedEntry.content)
    expect(capturedText).toBe(originalEntry)
    expect(new TextDecoder().decode(bundleFile(bundle, "LICENSE").content)).toBe("Original license asset\n")

    yield* fs.writeFileString(entryPath, "changed on disk\n")
    expect(new TextDecoder().decode(capturedEntry.content)).toBe(capturedText)
    capturedEntry.content[0] = 0
    expect(yield* fs.readFileString(entryPath)).toBe("changed on disk\n")
  }).pipe(Effect.provide(NodeServices.layer))
)

it("installer request and plan snapshots detach SharedArrayBuffer-backed bytes", () => {
    const requestSource = sharedBundle()
    const request: PlanRequest = {
      destination: { type: "user", host: "codex", home: Directory.make("/home/example/.codex") },
      intent: { type: "present", bundle: requestSource.bundle }
    }
    const capturedRequest = snapshotRequest(request)
    const requestBundle = Match.value(capturedRequest.intent).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => { throw new Error("Expected a present request intent") },
      repair: () => { throw new Error("Expected a present request intent") },
      present: (intent) => intent.bundle
    }))
    const requestBytes = bundleFile(requestBundle, ".codex-plugin/plugin.json").content
    const requestDigest = requestBundle.digest
    expect(bundleFile(requestSource.bundle, ".codex-plugin/plugin.json").content.buffer).toBe(requestSource.shared)
    expect(requestBytes.buffer).not.toBe(requestSource.shared)
    requestSource.content.fill(0)
    expect(new TextDecoder().decode(requestBytes)).toContain("opaque build_7")
    expect(bundleDigest(requestBundle)).toBe(requestDigest)

    const planSource = sharedBundle()
    const planChange: PlanChange = { type: "install", bundle: planSource.bundle }
    const planBody = Schema.decodeSync(Schema.toType(PlanBody))({
      type: "ready",
      schema: 1,
      target: {
        key: InstallationKey.make("codex:demo"),
        destination: { type: "user", host: "codex", home: Directory.make("/home/example/.codex") },
        plugin: PluginId.make("demo"),
        profile: "codex-profile-v1",
        version: "0.1.0"
      },
      before: { revision: null, receipt: null, observed: { type: "absent" } },
      change: planChange
    })
    const plan = Schema.decodeSync(Schema.toType(ReadyPlan))({ ...planBody, id: planId(planBody) })
    const capturedPlan = snapshotPlan(plan)
    const capturedPlanBundle = Match.value(capturedPlan.change).pipe(Match.discriminatorsExhaustive("type")({
      install: (change) => change.bundle,
      replace: (change) => change.bundle,
      remove: () => { throw new Error("Expected an install plan") }
    }))
    const planBytes = bundleFile(capturedPlanBundle, ".codex-plugin/plugin.json").content
    const planDigest = capturedPlanBundle.digest
    expect(bundleFile(planSource.bundle, ".codex-plugin/plugin.json").content.buffer).toBe(planSource.shared)
    expect(planBytes.buffer).not.toBe(planSource.shared)
    planSource.content.fill(0)
    expect(new TextDecoder().decode(planBytes)).toContain("opaque build_7")
    expect(bundleDigest(capturedPlanBundle)).toBe(planDigest)
    expect(planId(capturedPlan)).toBe(capturedPlan.id)
})

it.effect("rejects unsafe native version components and accepts a safe non-semver version", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-native-version-" })
    for (const version of ["release/7", "release\\7", ".", "..", "release\u0000seven"]) {
      const outcome = yield* buildOutcome(makeRequest(root, { version }))
      expect(issuesFrom(outcome)).toContainEqual({
        type: "invalid_metadata",
        field: "version",
        detail: "Version must be a single native cache path component"
      })
    }

    const accepted = bundleFrom(yield* buildOutcome(makeRequest(root, { version: "opaque build_7" })))
    expect(accepted.plugin).toBe("demo")
    expect(new TextDecoder().decode(bundleFile(accepted, ".codex-plugin/plugin.json").content)).toContain("opaque build_7")
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects unsupported hosts and Cursor project scope before native inspection", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-unsupported-target-" })
    const bundle = bundleFrom(yield* buildOutcome(makeRequest(root)).pipe(Effect.provide(CompilerTest)))
    const unsupportedHosts: ReadonlyArray<Host> = ["grok_bot", "muse"]

    for (const host of unsupportedHosts) {
      const destination: Destination = {
        type: "user",
        host,
        home: Directory.make(join(root, `missing-${host}-home`))
      }
      const outcome = yield* planOutcome({ destination, intent: { type: "present", bundle } }).pipe(
        Effect.provide(Layer.provideMerge(InstallerLive, NodeServices.layer))
      )
      expect(unsupportedFrom(outcome).destination.host).toBe(host)
    }

    const cursorProject: Destination = {
      type: "project",
      host: "cursor",
      home: Directory.make(join(root, "missing-cursor-home")),
      root: Directory.make(join(root, "missing-project-root"))
    }
    const claudeBundle = bundleFrom(yield* buildOutcome({ ...makeRequest(root), format: "claude_code" }).pipe(Effect.provide(CompilerTest)))
    const projectOutcome = yield* planOutcome({ destination: cursorProject, intent: { type: "present", bundle: claudeBundle } }).pipe(
      Effect.provide(Layer.provideMerge(InstallerLive, NodeServices.layer))
    )
    expect(unsupportedFrom(projectOutcome).destination.host).toBe("cursor")
    expect(unsupportedFrom(projectOutcome).detail).toContain("Native contract is unqualified")
  }).pipe(Effect.provide(NodeServices.layer))
)
