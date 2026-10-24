import { execFileSync } from "node:child_process"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { expect, it } from "vitest"
import { Target as TargetSchema } from "../contracts/Installer.ts"
import type { Target } from "../contracts/Installer.ts"
import { fileDigest } from "../src/internal/identity.ts"
import { readProjectFile, replaceProjectFile } from "../src/installer/project/files/file.ts"

type ProjectFixture = {
  readonly root: string
  readonly home: string
  readonly project: string
  readonly directory: string
  readonly config: string
  readonly target: Target
}

const withProject = async (run: (fixture: ProjectFixture) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-project-file-"))
  const home = join(root, "home")
  const project = join(root, "project")
  const directory = join(project, ".codex")
  await mkdir(home)
  await mkdir(project)
  const target = Schema.decodeSync(TargetSchema)({
    key: "project-file-test",
    destination: { type: "project", host: "codex", home, root: project },
    plugin: "project-file-test",
    profile: "codex",
    version: "0.163.0"
  })
  try {
    await run({ root, home, project, directory, config: join(directory, "config.toml"), target })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const readMode = async (path: string): Promise<number> => Number((await lstat(path, { bigint: true })).mode & 0o7777n)

const expectUnavailable = async <A, E>(effect: Effect.Effect<A, E>): Promise<unknown> => {
  let failure: unknown
  try {
    await Effect.runPromise(effect)
  } catch (cause) {
    failure = cause
  }
  expect(failure).toMatchObject({ _tag: "StateUnavailable" })
  return failure
}

it("reads an absent project config without creating its directory", async () => {
  await withProject(async ({ directory, target }) => {
    const result = await Effect.runPromise(readProjectFile(target))
    expect(result).toEqual({ basis: { type: "absent" }, text: "" })
    await expect(readdir(directory)).rejects.toMatchObject({ code: "ENOENT" })
  })
})

it("creates an absent config with mode 0600 and removes the staging name", async () => {
  await withProject(async ({ directory, config, target }) => {
    await mkdir(directory)
    const before = await Effect.runPromise(readProjectFile(target))

    await Effect.runPromise(replaceProjectFile(target, before.basis, "enabled = true\n"))

    expect(await readFile(config, "utf8")).toBe("enabled = true\n")
    expect(await readMode(config)).toBe(0o600)
    expect(await readdir(directory)).toEqual(["config.toml"])
  })
})

it("atomically replaces the complete config while preserving foreign bytes and mode", async () => {
  await withProject(async ({ directory, config, target }) => {
    await mkdir(directory)
    const foreignBytes = "\uFEFF# kept exactly: é and 🙂\n[other]\nvalue = \"outside the managed block\"\n"
    const initial = `${foreignBytes}\n[plugins.old]\nenabled = true\n`
    const desired = `${foreignBytes}\n[plugins.new]\nenabled = true\n`
    const foreignFile = join(directory, "outside.toml")
    const foreignFileBytes = Buffer.from("independent foreign bytes\n")
    await writeFile(config, initial, { mode: 0o600 })
    await chmod(config, 0o4751)
    await writeFile(foreignFile, foreignFileBytes, { mode: 0o600 })
    await chmod(foreignFile, 0o640)
    const before = await Effect.runPromise(readProjectFile(target))
    expect(before.basis).toEqual({ type: "file", digest: fileDigest(Buffer.from(initial)), mode: 0o4751 })
    expect(before.text).toBe(initial)

    await Effect.runPromise(replaceProjectFile(target, before.basis, desired))

    expect(await readFile(config, "utf8")).toBe(desired)
    expect(await readMode(config)).toBe(0o4751)
    expect(await readFile(foreignFile)).toEqual(foreignFileBytes)
    expect(await readMode(foreignFile)).toBe(0o640)
    expect((await readdir(directory)).toSorted()).toEqual(["config.toml", "outside.toml"])
  })
})

it("does not clobber a config that appears after an absent capture", async () => {
  await withProject(async ({ directory, config, target }) => {
    await mkdir(directory)
    const before = await Effect.runPromise(readProjectFile(target))
    const newer = "private concurrent config = true\n"
    await writeFile(config, newer, { mode: 0o600 })
    await chmod(config, 0o640)

    const failure = await expectUnavailable(replaceProjectFile(target, before.basis, "must not replace the concurrent file\n"))

    expect(String(failure)).not.toContain(newer)
    expect(await readFile(config, "utf8")).toBe(newer)
    expect(await readMode(config)).toBe(0o640)
    expect(await readdir(directory)).toEqual(["config.toml"])
  })
})

it("rejects stale file digests and stale modes while keeping the newer config", async () => {
  await withProject(async ({ directory, config, target }) => {
    await mkdir(directory)
    const initial = "setting = \"reviewed\"\n"
    const newer = "setting = \"concurrent\"\n"
    await writeFile(config, initial, { mode: 0o640 })
    const beforeDigestChange = await Effect.runPromise(readProjectFile(target))
    await writeFile(config, newer, { mode: 0o640 })
    await expectUnavailable(replaceProjectFile(target, beforeDigestChange.basis, "must not replace newer bytes\n"))
    expect(await readFile(config, "utf8")).toBe(newer)
    expect(await readMode(config)).toBe(0o640)

    const beforeModeChange = await Effect.runPromise(readProjectFile(target))
    await chmod(config, 0o600)
    await expectUnavailable(replaceProjectFile(target, beforeModeChange.basis, "must not replace newer mode\n"))
    expect(await readFile(config, "utf8")).toBe(newer)
    expect(await readMode(config)).toBe(0o600)
    expect(await readdir(directory)).toEqual(["config.toml"])
  })
})

it("rejects symlinks, special files, and invalid UTF-8 without exposing config bytes", async () => {
  await withProject(async ({ root, directory, config, target }) => {
    await mkdir(directory)
    const secret = "private-config-value"
    const outside = join(root, "outside.toml")
    await writeFile(outside, secret)
    await symlink(outside, config)
    const symlinkFailure = await expectUnavailable(readProjectFile(target))
    expect(String(symlinkFailure)).not.toContain(secret)
    await rm(config)

    execFileSync("mkfifo", [config], { stdio: "ignore" })
    await expectUnavailable(readProjectFile(target))
    await rm(config)

    await writeFile(config, Buffer.concat([Buffer.from(secret), Buffer.from([0xff])]))
    const encodingFailure = await expectUnavailable(readProjectFile(target))
    expect(String(encodingFailure)).not.toContain(secret)
  })
})

it("rejects a symlink in the project config directory path", async () => {
  await withProject(async ({ root, project, directory, target }) => {
    const outside = join(root, "outside")
    await mkdir(outside)
    await symlink(outside, directory)

    await expectUnavailable(readProjectFile(target))

    expect(await readdir(project)).toEqual([".codex"])
  })
})

it("rejects non-Codex and noncanonical project destinations through both operations", async () => {
  await withProject(async ({ project, target }) => {
    const nonCodex = Schema.decodeSync(TargetSchema)({
      ...target,
      destination: { ...target.destination, host: "claude_code" }
    })
    const noncanonical = Schema.decodeUnknownSync(TargetSchema)({
      ...target,
      destination: { ...target.destination, root: `${project}/..` }
    })

    await expectUnavailable(readProjectFile(nonCodex))
    await expectUnavailable(replaceProjectFile(noncanonical, { type: "absent" }, "enabled = true\n"))
  })
})
