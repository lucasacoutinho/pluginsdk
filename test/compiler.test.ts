import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { join } from "node:path"
import {
  BuildRequest,
  Bundle as BundleSchema,
  BundleBody,
  BundleDigest,
  BundleRejected,
  Compiler,
  SourceUnavailable,
  type BuildIssue,
  type Bundle,
  type BundleIssue,
  type Format,
  type PackageFile
} from "../contracts/Compiler.ts"
import { bundleDigest, commitment, fileDigest, sha256 } from "../src/internal/identity.ts"
import { canonicalJson, parseJson } from "../src/internal/json.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/native.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

type HeaderInput = string | {
  readonly type: "environment"
  readonly name: string
  readonly prefix: string
}

type ServerInput = {
  readonly url: string
  readonly headers: Record<string, HeaderInput>
}

type RequestOptions = {
  readonly id?: string
  readonly version?: string
  readonly description?: string
  readonly skills?: ReadonlyArray<string>
  readonly format?: Format
  readonly mcp?: Record<string, ServerInput>
}

type BuildOutcome =
  | { readonly type: "built"; readonly bundle: Bundle }
  | { readonly type: "rejected"; readonly issues: ReadonlyArray<BuildIssue> }
  | { readonly type: "unavailable"; readonly error: SourceUnavailable }

const makeRequest = (root: string, options: RequestOptions = {}) =>
  Schema.decodeSync(BuildRequest)({
    root,
    format: options.format ?? "agent_plugins_v1",
    plugin: {
      id: options.id ?? "demo",
      version: options.version ?? "1.0.0",
      description: options.description ?? "Compiler test",
      skills: options.skills ?? ["skills/alpha"],
      mcp: options.mcp ?? {}
    }
  })

const buildOutcome = (request: ReturnType<typeof makeRequest>) =>
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
    rejected: () => { throw new Error("Expected compiler build to succeed") },
    unavailable: (value) => { throw value.error }
  })
)

const issuesFrom = (outcome: BuildOutcome): ReadonlyArray<BuildIssue> => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    built: () => { throw new Error("Expected compiler build to fail") },
    rejected: (value) => value.issues,
    unavailable: (value) => { throw value.error }
  })
)

const writeSkill = (fs: FileSystem.FileSystem, root: string, name: string) => {
  const directory = join(root, "skills", name)
  return Effect.gen(function*() {
    yield* fs.makeDirectory(directory, { recursive: true })
    yield* fs.writeFileString(join(directory, "SKILL.md"), [
      "---",
      `name: ${name}`,
      "description: Compiler fixture",
      "---",
      `# ${name}`,
      ""
    ].join("\n"))
  })
}

const bundleFile = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Expected bundle file ${path}`)
  return file
}

const repackage = (bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle => {
  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files
  })
  return Schema.decodeSync(Schema.toType(BundleSchema))({ ...body, digest: bundleDigest(body) })
}

const replaceFileContent = (bundle: Bundle, path: string, content: Uint8Array): Array<PackageFile> =>
  bundle.files.map((file) => file.path === path ? { ...file, content } : file)

const validationIssues = (bundle: Bundle): ReadonlyArray<BundleIssue> => {
  try {
    validateBundle(bundle)
    return []
  } catch (cause) {
    if (cause instanceof BundleRejected) return cause.issues
    throw cause
  }
}

const containsInvalidSkillAt = (issues: ReadonlyArray<BuildIssue>, path: string): boolean =>
  issues.some((issue) => issue.type === "invalid_skill" && issue.path === path)

it.effect("builds byte-complete deterministic bundles and keeps captured bytes stable", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-compiler-" })
    yield* writeSkill(fs, root, "alpha")
    yield* writeSkill(fs, root, "beta")

    const alphaBytes = new Uint8Array([0, 255, 128, 1])
    const alphaAsset = join(root, "skills", "alpha", "assets", "payload.bin")
    yield* fs.makeDirectory(join(root, "skills", "alpha", "assets"), { recursive: true })
    yield* fs.writeFile(alphaAsset, alphaBytes)
    yield* fs.chmod(alphaAsset, 0o755)
    const betaAsset = join(root, "skills", "beta", "nested", "readme.txt")
    yield* fs.makeDirectory(join(root, "skills", "beta", "nested"), { recursive: true })
    yield* fs.writeFileString(betaAsset, "nested asset\n")

    const first = bundleFrom(yield* buildOutcome(makeRequest(root, {
      skills: ["skills/beta", "skills/alpha"],
      mcp: {
        zeta: { url: "https://zeta.example.test/mcp", headers: {} },
        alpha: { url: "https://alpha.example.test/mcp", headers: {} }
      }
    })))
    const second = bundleFrom(yield* buildOutcome(makeRequest(root, {
      skills: ["skills/alpha", "skills/beta"],
      mcp: {
        alpha: { url: "https://alpha.example.test/mcp", headers: {} },
        zeta: { url: "https://zeta.example.test/mcp", headers: {} }
      }
    })))

    expect(first).toStrictEqual(second)
    expect(first.digest).toBe(second.digest)
    expect(first.files.map((file) => file.path)).toEqual([
      "mcp.json",
      "plugin.json",
      "skills/alpha/SKILL.md",
      "skills/alpha/assets/payload.bin",
      "skills/beta/SKILL.md",
      "skills/beta/nested/readme.txt"
    ])
    expect(Array.from(bundleFile(first, "skills/alpha/assets/payload.bin").content)).toEqual([0, 255, 128, 1])
    expect(bundleFile(first, "skills/alpha/assets/payload.bin").executable).toBe(true)
    expect(new TextDecoder().decode(bundleFile(first, "skills/beta/nested/readme.txt").content)).toBe("nested asset\n")

    const retainedBytes = Array.from(bundleFile(first, "skills/alpha/assets/payload.bin").content)
    const retainedDigest = first.digest
    yield* fs.writeFile(alphaAsset, new Uint8Array([9, 8, 7]))
    yield* fs.chmod(alphaAsset, 0o644)
    expect(Array.from(bundleFile(first, "skills/alpha/assets/payload.bin").content)).toEqual(retainedBytes)
    expect(first.digest).toBe(retainedDigest)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("captures in-root file and directory symlinks", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-links-" })
    yield* writeSkill(fs, root, "alpha")
    const shared = join(root, "shared")
    yield* fs.makeDirectory(shared)
    const payload = new Uint8Array([16, 0, 254])
    yield* fs.writeFile(join(shared, "payload.bin"), payload)
    const skillDirectory = join(root, "skills", "alpha")
    yield* fs.symlink(shared, join(skillDirectory, "assets-directory"))
    yield* fs.symlink(join(shared, "payload.bin"), join(skillDirectory, "asset-file.bin"))

    const bundle = bundleFrom(yield* buildOutcome(makeRequest(root)))
    expect(Array.from(bundleFile(bundle, "skills/alpha/assets-directory/payload.bin").content)).toEqual([16, 0, 254])
    expect(Array.from(bundleFile(bundle, "skills/alpha/asset-file.bin").content)).toEqual([16, 0, 254])
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects file and directory symlink escapes", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-escapes-" })
    const root = join(workspace, "root")
    const outside = join(workspace, "outside")
    yield* fs.makeDirectory(root)
    yield* fs.makeDirectory(outside)

    const externalSkill = join(outside, "external-skill")
    yield* fs.makeDirectory(externalSkill)
    yield* fs.makeDirectory(join(root, "skills"), { recursive: true })
    yield* fs.writeFileString(join(externalSkill, "SKILL.md"), [
      "---", "name: escape", "description: External skill", "---", ""
    ].join("\n"))
    yield* fs.symlink(externalSkill, join(root, "skills", "escape"))
    const directoryEscape = yield* buildOutcome(makeRequest(root, { skills: ["skills/escape"] }))
    expect(issuesFrom(directoryEscape)).toEqual([{ type: "source_escape", path: "skills/escape" }])

    const fileRoot = join(workspace, "file-root")
    yield* fs.makeDirectory(fileRoot)
    yield* writeSkill(fs, fileRoot, "alpha")
    const secret = join(outside, "secret.bin")
    yield* fs.writeFile(secret, new Uint8Array([4, 5, 6]))
    yield* fs.symlink(secret, join(fileRoot, "skills", "alpha", "leak.bin"))
    const fileEscape = yield* buildOutcome(makeRequest(fileRoot))
    expect(issuesFrom(fileEscape)).toEqual([{ type: "source_escape", path: "skills/alpha/leak.bin" }])
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects cyclic skill directories", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-cycle-" })
    yield* writeSkill(fs, root, "alpha")
    const skillDirectory = join(root, "skills", "alpha")
    yield* fs.symlink(skillDirectory, join(skillDirectory, "cycle"))

    const issues = issuesFrom(yield* buildOutcome(makeRequest(root)))
    expect(containsInvalidSkillAt(issues, "skills/alpha/cycle")).toBe(true)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects duplicate and mismatched frontmatter and reports a missing entry", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-frontmatter-" })

    const duplicateRoot = join(workspace, "duplicate")
    yield* fs.makeDirectory(join(duplicateRoot, "skills", "alpha"), { recursive: true })
    yield* fs.writeFileString(join(duplicateRoot, "skills", "alpha", "SKILL.md"), [
      "---", "name: alpha", "name: alpha", "description: Duplicate key", "---", ""
    ].join("\n"))
    const duplicateIssues = issuesFrom(yield* buildOutcome(makeRequest(duplicateRoot)))
    expect(containsInvalidSkillAt(duplicateIssues, "skills/alpha/SKILL.md")).toBe(true)

    const mismatchRoot = join(workspace, "mismatch")
    yield* fs.makeDirectory(join(mismatchRoot, "skills", "alpha"), { recursive: true })
    yield* fs.writeFileString(join(mismatchRoot, "skills", "alpha", "SKILL.md"), [
      "---", "name: beta", "description: Mismatched name", "---", ""
    ].join("\n"))
    const mismatchIssues = issuesFrom(yield* buildOutcome(makeRequest(mismatchRoot)))
    expect(containsInvalidSkillAt(mismatchIssues, "skills/alpha/SKILL.md")).toBe(true)

    const missingRoot = join(workspace, "missing")
    yield* fs.makeDirectory(join(missingRoot, "skills", "alpha"), { recursive: true })
    const missing = yield* buildOutcome(makeRequest(missingRoot))
    expect(missing.type).toBe("unavailable")
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("reports header collisions and format-incompatible expansions", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-headers-" })

    const collision = issuesFrom(yield* buildOutcome(makeRequest(root, {
      skills: [],
      mcp: {
        docs: {
          url: "https://docs.example.test/mcp",
          headers: { "X-Token": "one", "x-token": "two" }
        }
      }
    })))
    expect(collision).toEqual([{
      type: "unsupported_mcp",
      server: "docs",
      reason: { type: "header_collision", header: "x-token" }
    }])

    const environmentReference = issuesFrom(yield* buildOutcome(makeRequest(root, {
      skills: [],
      format: "agent_plugins_v1",
      mcp: {
        docs: {
          url: "https://docs.example.test/mcp",
          headers: { Authorization: { type: "environment", name: "DOCS_TOKEN", prefix: "Bearer " } }
        }
      }
    })))
    expect(environmentReference).toEqual([{
      type: "unsupported_mcp",
      server: "docs",
      reason: { type: "environment_reference", header: "authorization" }
    }])

    const literalExpansion = issuesFrom(yield* buildOutcome(makeRequest(root, {
      skills: [],
      format: "claude_code_v1",
      mcp: {
        docs: {
          url: "https://docs.example.test/mcp",
          headers: { Authorization: "Bearer ${TOKEN}" }
        }
      }
    })))
    expect(literalExpansion).toEqual([{
      type: "unsupported_mcp",
      server: "docs",
      reason: { type: "literal_expansion", header: "authorization" }
    }])
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("normalizes source URLs and rejects malformed metadata Unicode", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-normalize-" })
    const bundle = bundleFrom(yield* buildOutcome(makeRequest(root, {
      skills: [],
      format: "claude_code_v1",
      mcp: {
        docs: { url: "https://EXAMPLE.com:443/a/../mcp", headers: {} }
      }
    })))
    const mcp = new TextDecoder().decode(bundleFile(bundle, ".mcp.json").content)
    expect(mcp).toContain("https://example.com/mcp")

    const malformed = issuesFrom(yield* buildOutcome(makeRequest(root, {
      skills: [],
      description: "invalid\uD800"
    })))
    expect(malformed).toEqual([{
      type: "invalid_metadata",
      field: "description",
      detail: "Metadata must contain valid Unicode"
    }])
  }).pipe(Effect.provide(CompilerTest))
)

it("matches canonical JSON and known SHA-256 domain commitments", () => {
  const value = Schema.decodeSync(Schema.Json)({
    z: 1e30,
    a: [Number("333333333.33333329"), 4.50, 0.002, 1e-7, 1e21],
    "\uE000": 2,
    "\uD800\uDC00": 1
  })
  expect(canonicalJson(value)).toBe("{\"a\":[333333333.3333333,4.5,0.002,1e-7,1e+21],\"z\":1e+30,\"𐀀\":1,\"\":2}")
  expect(canonicalJson(Schema.decodeSync(Schema.Json)("line\n\"\\"))).toBe("\"line\\n\\\"\\\\\"")
  expect(() => parseJson('{"a":1,"a":2}')).toThrow("Duplicate JSON property: a")
  expect(() => parseJson('{"a":"\\ud800"}')).toThrow("unpaired Unicode surrogate")

  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({
    schema: 1,
    plugin: "demo",
    format: "claude_code_v1",
    files: [{ path: "a", content: new Uint8Array([0]), executable: false }]
  })
  const encodedBody = Schema.decodeSync(Schema.Json)({
    format: "claude_code_v1",
    files: [{ content: "AA==", executable: false, path: "a" }],
    plugin: "demo",
    schema: 1
  })
  expect(sha256(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  expect(fileDigest(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  expect(commitment("test", null)).toBe("4bb2b81d1b0bf43411a30f1903a474bd4151a6a29b3bae1151787ab3a6d3297a")
  expect(commitment("bundle", encodedBody)).toBe("3ef29d7f9c80f44d0997e96132fd88ef2f57dafd5bbd0e199b997d20f6520330")
  expect(bundleDigest(body)).toBe("3ef29d7f9c80f44d0997e96132fd88ef2f57dafd5bbd0e199b997d20f6520330")
})

it.effect("rejects imported tampering, noncanonical order, and invalid native documents", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-import-" })
    yield* writeSkill(fs, root, "alpha")
    const bundle = bundleFrom(yield* buildOutcome(makeRequest(root)))

    const entryPath = "skills/alpha/SKILL.md"
    const changedContent = yield* Schema.decodeUnknownEffect(Schema.toType(BundleSchema))({
      ...bundle,
      files: replaceFileContent(bundle, entryPath, new TextEncoder().encode("tampered content"))
    })
    expect(validationIssues(changedContent).map((issue) => issue.type)).toEqual(["digest_mismatch"])

    const changedDigest = yield* Schema.decodeEffect(Schema.toType(BundleSchema))({
      ...bundle,
      digest: BundleDigest.make("0".repeat(64))
    })
    expect(validationIssues(changedDigest).map((issue) => issue.type)).toEqual(["digest_mismatch"])

    const wrongOrder = repackage(bundle, [...bundle.files].reverse())
    expect(validationIssues(wrongOrder).map((issue) => issue.type)).toEqual(["noncanonical_order"])

    const manifest = "plugin.json"
    const unknownFeature = repackage(bundle, replaceFileContent(bundle, manifest, new TextEncoder().encode(
      '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","description":"Compiler test","name":"demo","unexpected":true,"version":"1.0.0"}'
    )))
    const unknownFeatureIssues = validationIssues(unknownFeature)
    expect(unknownFeatureIssues).toHaveLength(1)
    expect(unknownFeatureIssues[0]?.type).toBe("invalid_native_package")

    const mismatchedName = repackage(bundle, replaceFileContent(bundle, manifest, new TextEncoder().encode(
      '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","description":"Compiler test","name":"other-plugin","version":"1.0.0"}'
    )))
    const mismatchedNameIssues = validationIssues(mismatchedName)
    expect(mismatchedNameIssues).toHaveLength(1)
    expect(mismatchedNameIssues[0]?.type).toBe("invalid_native_package")
  }).pipe(Effect.provide(CompilerTest))
)
