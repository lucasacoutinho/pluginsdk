import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Schema } from "effect"
import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { delimiter, join } from "node:path"
import { GitPublication, ProjectError } from "../contracts/Project.ts"
import { GitEdit, publishGit, TreeFile } from "../src/project/git.ts"

const runGit = (cwd: string, hooksPath: string, ...args: ReadonlyArray<string>): string => {
  const result = spawnSync("git", ["-c", "core.hooksPath=" + hooksPath, ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024
  })
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.stderr?.toString("utf8").trim() ?? ""
    throw new Error("Fixture Git command failed: " + args.join(" ") + (detail === "" ? "" : "\n" + detail))
  }
  return result.stdout.toString("utf8").trimEnd()
}

const createRepository = (root: string, hooksPath: string, objectFormat: "sha1" | "sha256" = "sha1") => {
  mkdirSync(hooksPath, { recursive: true })
  const bare = join(root, "remote.git")
  const work = join(root, "author")
  const format = objectFormat === "sha256" ? ["--object-format=sha256"] : []
  runGit(root, hooksPath, "init", "--bare", "--template=", "--initial-branch=main", ...format, bare)
  if (objectFormat === "sha1") {
    runGit(root, hooksPath, "init", "--template=", "--initial-branch=main", work)
    runGit(work, hooksPath, "config", "user.name", "Fixture")
    runGit(work, hooksPath, "config", "user.email", "fixture@localhost")
    writeFileSync(join(work, "foreign.bin"), new Uint8Array([0, 10, 255, 65]))
    runGit(work, hooksPath, "add", "--", "foreign.bin")
    runGit(work, hooksPath, "commit", "-m", "Initial publication tree")
    runGit(work, hooksPath, "push", bare, "HEAD:refs/heads/main")
  }
  return { bare, work }
}

const publicationFor = (repository: string, branch = "main") => Schema.decodeSync(GitPublication)({
  type: "git",
  repository,
  branch,
  marketplace: "fixture"
})

const file = (path: string, content: Uint8Array, executable = false) => Schema.decodeSync(TreeFile)({
  path,
  content,
  executable
})

const update = (files: ReadonlyArray<ReturnType<typeof file>>) => Schema.decodeSync(GitEdit)({
  type: "update",
  files
})

const unchanged = Schema.decodeSync(GitEdit)({ type: "unchanged" })

const ProjectTest = NodeServices.layer

it.effect("publishes exact bytes while retaining unrelated files and executable modes", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-git-publish-" })
    const hooksPath = join(root, "fixture-hooks")
    const { bare } = createRepository(root, hooksPath)
    const publication = publicationFor(bare)
    const payload = new Uint8Array([0, 10, 255, 65, 13, 10])
    const releaseFile = file("dist/café binary.dat", payload)
    const executableFile = file("scripts/publish", new TextEncoder().encode("#!/bin/sh\nexit 0\n"), true)
    const baseCommit = runGit(root, hooksPath, "--git-dir=" + bare, "rev-parse", "refs/heads/main")

    const result = yield* publishGit(publication, (snapshot) => Effect.gen(function*() {
      expect(snapshot.commit).toBe(baseCommit)
      const existing = yield* snapshot.read(["foreign.bin"])
      expect(Array.from(existing.get("foreign.bin") ?? [])).toEqual([0, 10, 255, 65])
      return update([releaseFile, executableFile])
    })).pipe(Effect.provide(ProjectTest))

    expect(result.type).toBe("published")
    expect(result.commit).not.toBeNull()

    const replay = yield* publishGit(publication, (snapshot) => Effect.gen(function*() {
      expect(snapshot.commit).toBe(result.commit)
      expect(snapshot.entries.get("scripts/publish")?.mode).toBe("100755")
      const content = yield* snapshot.read(["foreign.bin", "dist/café binary.dat", "scripts/publish"])
      expect(Array.from(content.get("foreign.bin") ?? [])).toEqual([0, 10, 255, 65])
      expect(Array.from(content.get("dist/café binary.dat") ?? [])).toEqual(Array.from(payload))
      expect(content.get("scripts/publish")?.byteLength).toBeGreaterThan(0)
      return unchanged
    })).pipe(Effect.provide(ProjectTest))

    expect(replay).toEqual({ type: "unchanged", commit: result.commit })
  }).pipe(Effect.provide(ProjectTest))
)

it.effect("reconciles a concurrent branch advance after the leased push is rejected", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-git-race-" })
    const hooksPath = join(root, "fixture-hooks")
    const { bare, work } = createRepository(root, hooksPath)
    const publication = publicationFor(bare)
    let calls = 0

    const result = yield* publishGit(publication, (snapshot) => Effect.sync(() => {
      calls += 1
      if (calls === 1) {
        writeFileSync(join(work, "raced.txt"), "concurrent author\n")
        runGit(work, hooksPath, "add", "--", "raced.txt")
        runGit(work, hooksPath, "commit", "-m", "Concurrent branch advance")
        runGit(work, hooksPath, "push", bare, "HEAD:refs/heads/main")
        return update([file("dist/release.txt", new TextEncoder().encode("our update\n"))])
      }
      expect(snapshot.entries.has("raced.txt")).toBe(true)
      expect(snapshot.entries.has("dist/release.txt")).toBe(false)
      return update([file("dist/release.txt", new TextEncoder().encode("our update\n"))])
    })).pipe(Effect.provide(ProjectTest), Effect.flip)

    expect(calls).toBe(2)
    expect(result).toBeInstanceOf(ProjectError)
    expect(result.detail).toContain("retry publish")
    expect(runGit(root, hooksPath, "--git-dir=" + bare, "rev-parse", "refs/heads/main"))
      .toBe(runGit(work, hooksPath, "rev-parse", "HEAD"))
  }).pipe(Effect.provide(ProjectTest))
)

it.effect("recognizes a pushed commit when the client loses the push acknowledgement", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-git-lost-ack-" })
    const hooksPath = join(root, "fixture-hooks")
    const { bare } = createRepository(root, hooksPath)
    const publication = publicationFor(bare)
    const wrapperDirectory = join(root, "git-wrapper")
    mkdirSync(wrapperDirectory, { recursive: true })
    const wrapper = join(wrapperDirectory, "git")
    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim()
    writeFileSync(wrapper, [
      "#!/usr/bin/env node",
      'const { spawnSync } = require("node:child_process")',
      "const args = process.argv.slice(2)",
      "const child = spawnSync(" + JSON.stringify(realGit) + ", args, { stdio: \"inherit\" })",
      'if (child.error) process.exit(127)',
      'process.exit(child.status === 0 && args.includes("push") ? 1 : (child.status ?? 1))',
      ""
    ].join("\n"))
    chmodSync(wrapper, 0o755)
    const originalPath = process.env.PATH
    process.env.PATH = [wrapperDirectory, originalPath].filter((part): part is string => part !== undefined).join(delimiter)
    let calls = 0
    const result = yield* publishGit(publication, (snapshot) => Effect.gen(function*() {
      calls += 1
      if (calls === 1) return update([file("dist/release.txt", new TextEncoder().encode("published once\n"))])
      const contents = yield* snapshot.read(["dist/release.txt"])
      expect(contents.get("dist/release.txt")).toEqual(new TextEncoder().encode("published once\n"))
      return unchanged
    })).pipe(
      Effect.provide(ProjectTest),
      Effect.ensuring(Effect.sync(() => {
        if (originalPath === undefined) delete process.env.PATH
        else process.env.PATH = originalPath
      }))
    )

    expect(calls).toBe(2)
    expect(result.type).toBe("unchanged")
    expect(result.commit).toBe(runGit(root, hooksPath, "--git-dir=" + bare, "rev-parse", "refs/heads/main"))
  }).pipe(Effect.provide(ProjectTest))
)

it.effect("publishes to an empty SHA-256 bare repository without assuming an object width", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-git-sha256-" })
    const hooksPath = join(root, "fixture-hooks")
    const { bare } = createRepository(root, hooksPath, "sha256")
    const publication = publicationFor(bare)
    const result = yield* publishGit(publication, () => Effect.succeed(update([
      file("dist/release.txt", new TextEncoder().encode("sha256\n"))
    ]))).pipe(Effect.provide(ProjectTest))

    expect(result.type).toBe("published")
    expect(result.commit).toMatch(/^[a-f0-9]{64}$/)
    expect(result.commit).toBe(runGit(root, hooksPath, "--git-dir=" + bare, "rev-parse", "refs/heads/main"))
  }).pipe(Effect.provide(ProjectTest))
)

it.effect("reports an unconfirmed push as uncertain and resolves it on a fresh retry", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-git-unconfirmed-" })
    const hooksPath = join(root, "fixture-hooks")
    const { bare } = createRepository(root, hooksPath)
    const publication = publicationFor(bare)
    const wrapperDirectory = join(root, "git-wrapper")
    mkdirSync(wrapperDirectory)
    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim()
    const marker = join(root, "accepted")
    const wrapper = join(wrapperDirectory, "git")
    writeFileSync(wrapper, [
      "#!/usr/bin/env node",
      'const { spawnSync } = require("node:child_process")',
      'const { existsSync, writeFileSync } = require("node:fs")',
      `const marker = ${JSON.stringify(marker)}`,
      "const args = process.argv.slice(2)",
      'if (existsSync(marker) && args.includes("ls-remote")) process.exit(1)',
      `const child = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" })`,
      'if (child.error) process.exit(127)',
      'if (child.status === 0 && args.includes("push")) { writeFileSync(marker, "accepted"); process.exit(1) }',
      "process.exit(child.status ?? 1)", ""
    ].join("\n"))
    chmodSync(wrapper, 0o755)
    const originalPath = process.env.PATH
    process.env.PATH = [wrapperDirectory, originalPath].filter((part): part is string => part !== undefined).join(delimiter)
    const releaseFile = file("dist/release.txt", new TextEncoder().encode("accepted once\n"))
    const result = yield* publishGit(publication, () => Effect.succeed(update([releaseFile]))).pipe(
      Effect.provide(ProjectTest),
      Effect.ensuring(Effect.sync(() => {
        if (originalPath === undefined) delete process.env.PATH
        else process.env.PATH = originalPath
      }))
    )
    expect(result).toEqual({ type: "uncertain", commit: null })
    const accepted = runGit(root, hooksPath, "--git-dir=" + bare, "rev-parse", "refs/heads/main")
    const retry = yield* publishGit(publication, (snapshot) => Effect.gen(function*() {
      const contents = yield* snapshot.read(["dist/release.txt"])
      expect(contents.get("dist/release.txt")).toEqual(releaseFile.content)
      return unchanged
    })).pipe(Effect.provide(ProjectTest))
    expect(retry).toEqual({ type: "unchanged", commit: accepted })
    expect(runGit(root, hooksPath, "--git-dir=" + bare, "rev-list", "--count", "refs/heads/main")).toBe("2")
  }).pipe(Effect.provide(ProjectTest))
)
