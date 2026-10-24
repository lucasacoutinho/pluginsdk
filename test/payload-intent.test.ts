import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem } from "effect"
import { dirname, join } from "node:path"
import type { PackageFile } from "../contracts/Compiler.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { readPayload } from "../src/installer/payload/read.ts"

const payloadFiles: ReadonlyArray<PackageFile> = [
  {
    path: PackagePath.make("bin/run.sh"),
    content: new TextEncoder().encode("#!/bin/sh\nexit 0\n"),
    executable: true
  },
  {
    path: PackagePath.make("docs/README.md"),
    content: new TextEncoder().encode("Keep this documentation as data.\n"),
    executable: false
  }
]

const writePayloadFile = (fs: FileSystem.FileSystem, root: string, file: PackageFile) =>
  Effect.gen(function*() {
    const path = join(root, file.path)
    yield* fs.makeDirectory(dirname(path), { recursive: true })
    yield* fs.writeFile(path, file.content)
    yield* fs.chmod(path, file.executable ? 0o755 : 0o644)
  })

const writePayload = (fs: FileSystem.FileSystem, root: string, files: ReadonlyArray<PackageFile>) =>
  Effect.gen(function*() {
    for (const file of files) yield* writePayloadFile(fs, root, file)
  })

it.effect("matches an intact native payload and repeats its fingerprint", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-payload-match-" })
    yield* writePayload(fs, root, payloadFiles)

    const first = yield* readPayload(root, payloadFiles)
    const second = yield* readPayload(root, payloadFiles)
    expect(first.matches).toBe(true)
    expect(second.matches).toBe(true)
    expect(first.fingerprint).toBe("37a1d864ecc755d464783687b0c5b14d3d6d33eed23a10afe6e265cc1f011037")
    expect(second.fingerprint).toBe(first.fingerprint)
  }).pipe(Effect.provide(NodeServices.layer))
)

it.effect("marks byte and execute-mode drift as mismatches with changed fingerprints", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-payload-drift-" })
    yield* writePayload(fs, root, payloadFiles)
    const baseline = yield* readPayload(root, payloadFiles)
    const executablePath = join(root, "bin/run.sh")

    yield* fs.writeFileString(executablePath, "#!/bin/sh\nexit 7\n")
    const changedBytes = yield* readPayload(root, payloadFiles)
    expect(changedBytes.matches).toBe(false)
    expect(changedBytes.fingerprint).not.toBe(baseline.fingerprint)

    const executable = payloadFiles[0]
    if (executable === undefined) throw new Error("Missing executable payload fixture")
    yield* fs.writeFile(executablePath, executable.content)
    yield* fs.chmod(executablePath, 0o644)
    const changedMode = yield* readPayload(root, payloadFiles)
    expect(changedMode.matches).toBe(false)
    expect(changedMode.fingerprint).not.toBe(baseline.fingerprint)
  }).pipe(Effect.provide(NodeServices.layer))
)

it.effect("marks missing and extra payload paths as mismatches with changed fingerprints", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-payload-paths-" })
    yield* writePayload(fs, root, payloadFiles)
    const baseline = yield* readPayload(root, payloadFiles)

    yield* fs.remove(join(root, "docs/README.md"))
    const missing = yield* readPayload(root, payloadFiles)
    expect(missing.matches).toBe(false)
    expect(missing.fingerprint).not.toBe(baseline.fingerprint)

    const documentation = payloadFiles[1]
    if (documentation === undefined) throw new Error("Missing documentation payload fixture")
    yield* writePayloadFile(fs, root, documentation)
    yield* fs.writeFileString(join(root, "extra.txt"), "Unexpected payload file.\n")
    const extra = yield* readPayload(root, payloadFiles)
    expect(extra.matches).toBe(false)
    expect(extra.fingerprint).not.toBe(baseline.fingerprint)
  }).pipe(Effect.provide(NodeServices.layer))
)

it.effect("refuses a symbolic-link root and symbolic links inside the payload", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-payload-links-" })
    const root = join(workspace, "payload")
    const rootLink = join(workspace, "payload-link")
    yield* fs.makeDirectory(root)
    yield* writePayload(fs, root, payloadFiles)
    yield* fs.symlink(root, rootLink)

    const rootResult = yield* Effect.exit(readPayload(rootLink, payloadFiles))
    expect(rootResult._tag).toBe("Failure")

    const documentation = join(root, "docs/README.md")
    yield* fs.remove(documentation)
    yield* fs.symlink(join(root, "bin/run.sh"), documentation)
    const linkedFileResult = yield* Effect.exit(readPayload(root, payloadFiles))
    expect(linkedFileResult._tag).toBe("Failure")
  }).pipe(Effect.provide(NodeServices.layer))
)
