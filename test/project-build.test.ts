import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { join } from "node:path"
import { Bundle, type Bundle as BundleType } from "../contracts/Compiler.ts"
import { Directory } from "../contracts/Plugin.ts"
import { BuildSnapshot, GitBranch, GitRepository, ProjectDefinition, ProjectError } from "../contracts/Project.ts"
import type { BuildSnapshot as BuildSnapshotType, ProjectDefinition as ProjectDefinitionType } from "../contracts/Project.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { jsonBytes } from "../src/internal/json.ts"
import { compileProject, readBuild, readDefinition, writeBuild } from "../src/project/build.ts"
import { capturedPublication } from "../src/project/marketplace.ts"

const ProjectTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

type DefinitionOptions = {
  readonly id?: string
  readonly version?: string
  readonly publish?: {
    readonly type: "git"
    readonly repository: string
    readonly branch: string
    readonly marketplace: string
  }
}

const makeDefinition = (options: DefinitionOptions = {}) => Schema.decodeSync(ProjectDefinition)({
  id: options.id ?? "build-fixture",
  version: options.version ?? "1.0.0",
  description: "Captured build fixture",
  skills: ["skills/review"],
  mcp: {},
  ...(options.publish === undefined ? {} : { publish: options.publish })
})

const writeSkill = (fs: FileSystem.FileSystem, root: string, bytes: Uint8Array) => Effect.gen(function*() {
  const directory = join(root, "skills", "review")
  yield* fs.makeDirectory(directory, { recursive: true })
  yield* fs.writeFile(join(directory, "SKILL.md"), bytes)
})

const skillFile = (bundle: BundleType) => {
  const file = bundle.files.find((candidate) => candidate.path === "skills/review/SKILL.md")
  if (file === undefined) throw new Error("Expected captured skill file")
  return file
}

const encodedDefinition = (definition: ProjectDefinitionType): Uint8Array =>
  jsonBytes(Schema.encodeSync(ProjectDefinition)(definition))

const tamperBundle = (bundle: BundleType): BundleType => {
  const change = (file: BundleType["files"][number]) => file.path === "skills/review/SKILL.md"
    ? { ...file, content: new TextEncoder().encode("tampered") }
    : file
  const [head, ...tail] = bundle.files
  return Schema.decodeSync(Schema.toType(Bundle))({ ...bundle, files: [change(head), ...tail.map(change)] })
}

const tamperSnapshot = (snapshot: BuildSnapshotType, bundle: BundleType): BuildSnapshotType =>
  Schema.decodeSync(Schema.toType(BuildSnapshot))({ ...snapshot, bundles: [bundle] })

const encodedSnapshot = (snapshot: BuildSnapshotType): Uint8Array =>
  jsonBytes(Schema.encodeSync(BuildSnapshot)(snapshot))

it("accepts configured Git locations and rejects helper commands, credentials and invalid refs", () => {
  for (const repository of [
    "git@github.com:acme/plugins.git", "ssh://git@github.com/acme/plugins.git",
    "https://github.com/acme/plugins.git", "/tmp/owned repository.git", "file:///tmp/owned-repository.git"
  ]) expect(Schema.decodeSync(GitRepository)(repository)).toBe(repository)
  for (const repository of [
    "ext::sh -c command", "--upload-pack=command", "https://user:secret@github.com/acme/plugins.git",
    "https://user@github.com/acme/plugins.git", " /tmp/repo.git", "git@github.com:acme/plugins.git\n", "./repo.git"
  ]) expect(() => Schema.decodeSync(GitRepository)(repository)).toThrow()
  for (const branch of ["main", "releases/pluginsdk", "v1.0"]) expect(Schema.decodeSync(GitBranch)(branch)).toBe(branch)
  for (const branch of ["--bad", "main.lock", "a/../b", "a//b", "a/"]) expect(() => Schema.decodeSync(GitBranch)(branch)).toThrow()
})

it.effect("captures canonical default packages and retains source bytes after edits", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-project-build-" })
    const skillPath = join(root, "skills", "review", "SKILL.md")
    const originalBytes = new TextEncoder().encode("---\nname: review\ndescription: Exact bytes\n---\n# Review\n\n")
    yield* writeSkill(fs, root, originalBytes)

    const definition = makeDefinition()
    const definitionPath = join(root, "definition.json")
    yield* fs.writeFile(definitionPath, encodedDefinition(definition))
    expect(yield* readDefinition(definitionPath)).toStrictEqual(definition)

    const bundles = yield* compileProject(definition, Directory.make(root), ["codex", "claude_code"])
    expect(bundles.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
    for (const bundle of bundles) expect(Array.from(skillFile(bundle).content)).toEqual(Array.from(originalBytes))

    const cursorBundles = yield* compileProject(definition, Directory.make(root), ["cursor", "codex", "claude_code", "cursor"])
    expect(cursorBundles).toEqual(bundles)

    const directory = join(root, ".pluginsdk", "build")
    const written = yield* writeBuild(directory, definition, bundles)
    expect(written.bundles.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
    const cursorBuild = yield* writeBuild(join(root, ".pluginsdk", "cursor-build"), definition, cursorBundles)
    expect(capturedPublication(cursorBuild)).toEqual(capturedPublication(written))
    yield* fs.writeFile(skillPath, new TextEncoder().encode("edited after build"))

    const captured = yield* readBuild(directory, definition)
    for (const bundle of captured.bundles) expect(Array.from(skillFile(bundle).content)).toEqual(Array.from(originalBytes))
  }).pipe(Effect.provide(ProjectTest))
)

it.effect("rejects a build when its publication target changes", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-project-stale-" })
    yield* writeSkill(fs, root, new TextEncoder().encode("---\nname: review\ndescription: Stale check\n---\n# Review\n"))
    const original = makeDefinition({
      publish: { type: "git", repository: "https://github.com/acme/plugins.git", branch: "main", marketplace: "acme" }
    })
    const changed = makeDefinition({
      publish: { type: "git", repository: "https://github.com/acme/new-plugins.git", branch: "main", marketplace: "acme" }
    })
    const bundles = yield* compileProject(original, Directory.make(root), ["claude_code"])
    const directory = join(root, ".pluginsdk", "build")
    yield* writeBuild(directory, original, bundles)

    const error = yield* Effect.flip(readBuild(directory, changed))
    expect(error).toBeInstanceOf(ProjectError)
    expect(error.detail).toContain("rebuild")
  }).pipe(Effect.provide(ProjectTest))
)

it.effect("rejects tampered package bytes, duplicate hosts, and mismatched package metadata", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-project-invalid-" })
    yield* writeSkill(fs, root, new TextEncoder().encode("---\nname: review\ndescription: Validation\n---\n# Review\n"))
    const definition = makeDefinition()
    const bundles = yield* compileProject(definition, Directory.make(root), ["claude_code"])
    const bundle = bundles[0]
    if (bundle === undefined) throw new Error("Expected one compiled package")
    const directory = join(root, ".pluginsdk", "build")
    const written = yield* writeBuild(directory, definition, [bundle])

    const tamperedBundle = tamperBundle(bundle)
    const writeError = yield* Effect.flip(writeBuild(directory, definition, [tamperedBundle]))
    expect(writeError.detail).toContain("rebuild")

    yield* fs.writeFile(join(directory, "build.json"), encodedSnapshot(tamperSnapshot(written, tamperedBundle)))
    const readError = yield* Effect.flip(readBuild(directory, definition))
    expect(readError.detail).toContain("rebuild")

    const duplicateError = yield* Effect.flip(writeBuild(directory, definition, [bundle, bundle]))
    expect(duplicateError.detail).toContain("rebuild")

    const changedVersion = makeDefinition({ version: "2.0.0" })
    const metadataError = yield* Effect.flip(writeBuild(directory, changedVersion, [bundle]))
    expect(metadataError.detail).toContain("rebuild")
  }).pipe(Effect.provide(ProjectTest))
)
