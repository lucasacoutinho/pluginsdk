import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import {
  BuildRequest,
  Bundle as BundleSchema,
  BundleBody,
  BundleRejected,
  Compiler,
  PackageFile as PackageFileSchema,
  SourceUnavailable,
  type BuildIssue,
  type Bundle,
  type BundleIssue,
  type Format,
  type PackageFile
} from "../contracts/Compiler.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { bundleDigest, fileDigest } from "../src/internal/identity.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)
const clientFormats: ReadonlyArray<Format> = ["claude_code", "codex"]

type RequestOptions = {
  readonly format?: Format
  readonly skills?: ReadonlyArray<string>
  readonly assets?: ReadonlyArray<string>
}

type BuildOutcome =
  | { readonly type: "built"; readonly bundle: Bundle }
  | { readonly type: "rejected"; readonly issues: ReadonlyArray<BuildIssue> }
  | { readonly type: "unavailable"; readonly error: SourceUnavailable }

const makeRequest = (root: string, options: RequestOptions = {}) =>
  Schema.decodeSync(BuildRequest)({
    root,
    format: options.format ?? "codex",
    plugin: {
      id: "demo",
      version: "1.0.0",
      description: "Compiler test",
      skills: options.skills ?? [],
      ...(options.assets === undefined ? {} : { assets: options.assets }),
      mcp: {}
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
    rejected: (value) => { throw new Error(`Expected build success, received ${JSON.stringify(value.issues)}`) },
    unavailable: (value) => { throw value.error }
  })
)

const issuesFrom = (outcome: BuildOutcome): ReadonlyArray<BuildIssue> => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    built: () => { throw new Error("Expected compiler build rejection") },
    rejected: (value) => value.issues,
    unavailable: (value) => { throw value.error }
  })
)

const bundleFile = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Expected bundle file ${path}`)
  return file
}

const writeSourceFile = (fs: FileSystem.FileSystem, root: string, path: string, bytes: Uint8Array | string) =>
  Effect.gen(function*() {
    const target = join(root, path)
    yield* fs.makeDirectory(dirname(target), { recursive: true })
    yield* typeof bytes === "string" ? fs.writeFileString(target, bytes) : fs.writeFile(target, bytes)
  })

const repackage = (bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle => {
  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files
  })
  return Schema.decodeSync(Schema.toType(BundleSchema))({ ...body, digest: bundleDigest(body) })
}

const validationIssues = (bundle: Bundle): ReadonlyArray<BundleIssue> => {
  try {
    validateBundle(bundle)
    return []
  } catch (cause) {
    if (cause instanceof BundleRejected) return cause.issues
    throw cause
  }
}

const hasIssueAt = (issues: ReadonlyArray<BuildIssue>, type: BuildIssue["type"], path: string): boolean =>
  issues.some((issue) => issue.type === type && "path" in issue && issue.path === path)

it.effect("preserves legal root assets and recursive byte-complete trees for both clients", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-client-assets-" })
    const binary = new Uint8Array([0, 255, 4, 0, 128, 10])
    yield* writeSourceFile(fs, root, "LICENSE", "MIT License\n")
    yield* writeSourceFile(fs, root, "NOTICE.md", "Package notices\n")
    yield* writeSourceFile(fs, root, "third_party/LICENSE", "Third-party terms\n")
    yield* writeSourceFile(fs, root, "third_party/nested/reference.txt", "See the sibling reference.\n")
    yield* writeSourceFile(fs, root, "third_party/tools/run.sh", binary)
    yield* fs.chmod(join(root, "third_party/tools/run.sh"), 0o755)

    for (const format of clientFormats) {
      const request = makeRequest(root, { format, assets: ["LICENSE", "NOTICE.md", "third_party"] })
      const first = bundleFrom(yield* buildOutcome(request))
      const second = bundleFrom(yield* buildOutcome(request))

      expect(first.digest).toBe(second.digest)
      expect(first.digest).toBe(bundleDigest(first))
      expect(bundleFile(first, "LICENSE").content).toEqual(new TextEncoder().encode("MIT License\n"))
      expect(bundleFile(first, "NOTICE.md").content).toEqual(new TextEncoder().encode("Package notices\n"))
      expect(bundleFile(first, "third_party/LICENSE").content).toEqual(new TextEncoder().encode("Third-party terms\n"))
      expect(bundleFile(first, "third_party/nested/reference.txt").content).toEqual(new TextEncoder().encode("See the sibling reference.\n"))
      expect(Array.from(bundleFile(first, "third_party/tools/run.sh").content)).toEqual(Array.from(binary))
      expect(bundleFile(first, "third_party/tools/run.sh").executable).toBe(true)
      expect(fileDigest(bundleFile(first, "third_party/tools/run.sh").content)).toBe(fileDigest(binary))
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("captures contained file and directory symlinks and rejects escapes and cycles", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-asset-links-" })
    const root = join(workspace, "root")
    const outside = join(workspace, "outside")
    yield* fs.makeDirectory(root)
    yield* fs.makeDirectory(outside)
    const payload = new Uint8Array([9, 0, 245])
    yield* writeSourceFile(fs, root, "shared/payload.bin", payload)
    yield* writeSourceFile(fs, root, "tree/nested/data.bin", payload)
    yield* fs.symlink(join(root, "shared/payload.bin"), join(root, "file-link.bin"))
    yield* fs.symlink(join(root, "tree"), join(root, "tree-link"))

    const linked = bundleFrom(yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: ["file-link.bin", "tree-link"]
    })))
    expect(Array.from(bundleFile(linked, "file-link.bin").content)).toEqual(Array.from(payload))
    expect(Array.from(bundleFile(linked, "tree-link/nested/data.bin").content)).toEqual(Array.from(payload))

    yield* writeSourceFile(fs, outside, "secret.bin", payload)
    yield* fs.makeDirectory(join(outside, "external-tree"))
    yield* writeSourceFile(fs, outside, "external-tree/secret.bin", payload)
    yield* fs.symlink(join(outside, "secret.bin"), join(root, "escape.bin"))
    yield* fs.symlink(join(outside, "external-tree"), join(root, "escape-tree"))
    const fileEscape = issuesFrom(yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: ["escape.bin"]
    })))
    expect(hasIssueAt(fileEscape, "source_escape", "escape.bin")).toBe(true)
    const directoryEscape = issuesFrom(yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: ["escape-tree"]
    })))
    expect(hasIssueAt(directoryEscape, "source_escape", "escape-tree")).toBe(true)

    yield* fs.makeDirectory(join(root, "cycle"))
    yield* fs.symlink(join(root, "cycle"), join(root, "cycle", "back"))
    const cycle = issuesFrom(yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: ["cycle"]
    })))
    expect(hasIssueAt(cycle, "invalid_asset", "cycle/back")).toBe(true)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("does not let assets introduce native manifests, skills, agents, commands or hooks", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-reserved-assets-" })
    const paths = [
      "plugin.json", "mcp.json", ".mcp.json", ".lsp.json", ".claude-plugin/plugin.json",
      ".codex-plugin/metadata.json", ".claude/commands/run.md", ".codex/agents/reviewer.md",
      "skills/alpha/SKILL.md", "commands/run.md", "agents/reviewer.md", "hooks/pre.sh"
    ]
    for (const path of paths) yield* writeSourceFile(fs, root, path, "reserved asset fixture\n")

    const issues = issuesFrom(yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: paths
    })))
    for (const path of paths) expect(hasIssueAt(issues, "reserved_asset", path), `${path} is reserved`).toBe(true)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects repeated, case-folded and ancestor asset collisions even when bytes match", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-asset-collisions-" })
    const repeatedRoot = join(workspace, "repeated")
    yield* fs.makeDirectory(repeatedRoot)
    yield* writeSourceFile(fs, repeatedRoot, "same.bin", new Uint8Array([1, 0, 2]))
    const repeated = issuesFrom(yield* buildOutcome(makeRequest(repeatedRoot, {
      format: "codex",
      assets: ["same.bin", "same.bin"]
    })))
    expect(hasIssueAt(repeated, "path_collision", "same.bin")).toBe(true)

    const caseRoot = join(workspace, "case")
    yield* fs.makeDirectory(caseRoot)
    const sameContent = new Uint8Array([3, 0, 4])
    yield* writeSourceFile(fs, caseRoot, "Case.bin", sameContent)
    yield* writeSourceFile(fs, caseRoot, "case.bin", sameContent)
    const folded = issuesFrom(yield* buildOutcome(makeRequest(caseRoot, {
      format: "codex",
      assets: ["Case.bin", "case.bin"]
    })))
    expect(hasIssueAt(folded, "path_collision", "case.bin")).toBe(true)

    const ancestorRoot = join(workspace, "ancestor")
    yield* fs.makeDirectory(ancestorRoot)
    const ancestorContent = new Uint8Array([5, 0, 6])
    yield* writeSourceFile(fs, ancestorRoot, "tree", ancestorContent)
    yield* writeSourceFile(fs, ancestorRoot, "TREE/child.bin", ancestorContent)
    const ancestor = issuesFrom(yield* buildOutcome(makeRequest(ancestorRoot, {
      format: "codex",
      assets: ["tree", "TREE/child.bin"]
    })))
    expect(hasIssueAt(ancestor, "path_collision", "tree")).toBe(true)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("keeps captured assets independent of caller path and source byte edits", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-asset-snapshot-" })
    const originalBytes = new Uint8Array([0, 32, 0, 255])
    const callerPaths = [PackagePath.make("LICENSE")]
    yield* writeSourceFile(fs, root, "LICENSE", originalBytes)
    const request = yield* Schema.decodeEffect(BuildRequest)({
      root,
      format: "codex",
      plugin: {
        id: "demo",
        version: "1.0.0",
        description: "Compiler test",
        skills: [],
        assets: callerPaths,
        mcp: {}
      }
    })
    const bundle = bundleFrom(yield* buildOutcome(request))
    const savedBytes = Array.from(bundleFile(bundle, "LICENSE").content)
    const savedDigest = bundle.digest

    callerPaths.splice(0, 1, PackagePath.make("missing-after-capture.bin"))
    callerPaths.push(PackagePath.make("added-after-capture.bin"))
    yield* fs.writeFile(join(root, "LICENSE"), new Uint8Array([9, 8, 7]))
    expect(Array.from(bundleFile(bundle, "LICENSE").content)).toEqual(savedBytes)
    expect(savedBytes).toEqual(Array.from(originalBytes))
    expect(bundle.digest).toBe(savedDigest)
    expect(bundle.digest).toBe(bundleDigest(bundle))
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("validates nested skill metadata and rejects mismatched skill identity for both clients", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-skill-metadata-" })
    const entry = "---\nname: demo\ndescription: Metadata extension\nmetadata:\n  lstack:\n    mode: true\n    icon: crown\n---\n\n# Demo\n"
    yield* writeSourceFile(fs, root, "skills/demo/SKILL.md", entry)
    for (const format of clientFormats) {
      const bundle = bundleFrom(yield* buildOutcome(makeRequest(root, { format, skills: ["skills/demo"] })))
      expect(new TextDecoder().decode(bundleFile(bundle, "skills/demo/SKILL.md").content)).toBe(entry)
      expect(validationIssues(bundle)).toEqual([])
    }
    yield* writeSourceFile(fs, root, "skills/demo/SKILL.md", entry.replace("name: demo", "name: different"))
    for (const format of clientFormats) {
      const issues = issuesFrom(yield* buildOutcome(makeRequest(root, { format, skills: ["skills/demo"] })))
      expect(hasIssueAt(issues, "invalid_skill", "skills/demo/SKILL.md")).toBe(true)
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects imported bundles with invalid native agent documents after resealing", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-import-agents-" })
    for (const format of clientFormats) {
      const valid = bundleFrom(yield* buildOutcome(makeRequest(root, { format })))
      const injected = yield* Schema.decodeEffect(Schema.toType(PackageFileSchema))({
        path: PackagePath.make("agents/reviewer.md"),
        content: new TextEncoder().encode("# Reviewer\n"),
        executable: false
      })
      const files = [...valid.files, injected].sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0
      )
      const tampered = repackage(valid, files)
      expect(tampered.digest).toBe(bundleDigest(tampered))
      expect(validationIssues(tampered).some((issue) => issue.type === "invalid_native_package")).toBe(true)
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("returns typed invalid-asset failures for missing and non-regular support paths", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-invalid-assets-" })
    const missingOutcome = yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: ["missing.bin"]
    }))
    const missingHasTypedFailure = Match.value(missingOutcome).pipe(
      Match.discriminatorsExhaustive("type")({
        built: () => false,
        rejected: (value) => hasIssueAt(value.issues, "invalid_asset", "missing.bin"),
        unavailable: (value) => value.error.root === root
      })
    )
    expect(missingHasTypedFailure).toBe(true)

    const pipePath = join(root, "pipe")
    const pipe = spawnSync("mkfifo", [pipePath], { encoding: "utf8", timeout: 5_000 })
    if (pipe.error !== undefined) throw pipe.error
    if (pipe.status !== 0) throw new Error(`mkfifo failed with status ${String(pipe.status)}: ${pipe.stderr}`)
    const nonRegular = issuesFrom(yield* buildOutcome(makeRequest(root, {
      format: "codex",
      assets: ["pipe"]
    })))
    expect(hasIssueAt(nonRegular, "invalid_asset", "pipe")).toBe(true)
  }).pipe(Effect.provide(CompilerTest))
)
