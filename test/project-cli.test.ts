import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Bundle, BundleDigest, Format } from "../contracts/Compiler.ts"
import { BuildSnapshot } from "../contracts/Project.ts"
import { parseJson } from "../src/internal/json.ts"

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const claudeIndexPath = ".claude-plugin/marketplace.json"
const codexIndexPath = ".agents/plugins/marketplace.json"
const registryPath = ".pluginsdk/publications.json"

type CliResult = {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

const PublishedPackage = Schema.Struct({
  client: Schema.Literals(["claude_code", "codex"]),
  format: Format,
  digest: BundleDigest
})
const PublishedRelease = Schema.Struct({
  plugin: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  packages: Schema.Array(PublishedPackage),
  digest: Schema.NonEmptyString
})
const PublishedRegistry = Schema.Struct({
  schema: Schema.Literal(1),
  marketplace: Schema.NonEmptyString,
  releases: Schema.Array(PublishedRelease)
})
const MarketplaceIndex = Schema.Struct({
  name: Schema.NonEmptyString,
  owner: Schema.optionalKey(Schema.JsonObject),
  plugins: Schema.Array(Schema.JsonObject)
})
type PublishedRelease = typeof PublishedRelease.Type

const gitEnvironment = (home: string): NodeJS.ProcessEnv => ({
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: join(home, ".gitconfig")
})

const runCli = (directory: string, home: string, args: ReadonlyArray<string>): CliResult => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, ...args], {
    cwd: directory,
    encoding: "utf8",
    env: gitEnvironment(home),
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000
  })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const runGit = (directory: string, home: string, args: ReadonlyArray<string>): Buffer => {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "buffer",
    env: gitEnvironment(home),
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Git command failed: ${result.stderr.toString("utf8")}`)
  }
  return result.stdout
}

const runGitText = (directory: string, home: string, args: ReadonlyArray<string>): string =>
  runGit(directory, home, args).toString("utf8").trimEnd()

const withTempDirectory = (run: (directory: string, home: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), "pluginsdk-author-cli-"))
  const home = join(directory, "home")
  mkdirSync(home)
  try {
    run(directory, home)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const writeFile = (path: string, content: string | Uint8Array): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

const definitionText = (repository: string | undefined, version: string, id = "release-notes"): string => {
  const base = {
    id,
    version,
    description: "Prepare evidence-backed release notes.",
    skills: ["skills/release-notes"],
    mcp: {}
  }
  const definition = repository === undefined
    ? base
    : { ...base, publish: { type: "git", repository, branch: "main", marketplace: "acme" } }
  return `${JSON.stringify(definition, null, 2)}\n`
}

const initialClaudeForeign = (name = "foreign-claude") => ({
  name,
  source: `./plugins/${name}`,
  extension: { preserve: true, owner: "external-team" }
})

const initialCodexForeign = {
  name: "foreign-codex",
  source: { source: "local", path: "./plugins/foreign-codex" },
  policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  category: "Tools",
  extension: { preserve: true, owner: "external-team" }
}

type SeededMarketplace = {
  readonly repository: string
  readonly claudeForeign: ReturnType<typeof initialClaudeForeign>
  readonly codexForeign: typeof initialCodexForeign
}

const seedMarketplace = (directory: string, home: string, collisionName?: string): SeededMarketplace => {
  const repository = join(directory, "marketplace.git")
  const seed = join(directory, "seed")
  mkdirSync(seed)
  runGit(directory, home, ["-c", "init.defaultBranch=main", "init", "--bare", repository])
  runGit(directory, home, ["-c", "init.defaultBranch=main", "init", seed])

  const claudeForeign = initialClaudeForeign(collisionName)
  writeFile(join(seed, "README.md"), "Externally maintained marketplace content.\n")
  writeFile(join(seed, claudeIndexPath), `${JSON.stringify({
    name: "acme",
    owner: { name: "acme" },
    plugins: [claudeForeign]
  }, null, 2)}\n`)
  writeFile(join(seed, codexIndexPath), `${JSON.stringify({ name: "acme", plugins: [initialCodexForeign] }, null, 2)}\n`)
  runGit(seed, home, ["add", "README.md", claudeIndexPath, codexIndexPath])
  runGit(seed, home, [
    "-c", "user.name=PluginSDK fixture",
    "-c", "user.email=pluginsdk-fixture@example.test",
    "commit", "-m", "Seed foreign marketplace content"
  ])
  runGit(seed, home, ["remote", "add", "origin", repository])
  runGit(seed, home, ["push", "origin", "main"])
  return { repository, claudeForeign, codexForeign: initialCodexForeign }
}

const readBuild = (project: string) => Schema.decodeUnknownSync(BuildSnapshot)(parseJson(
  readFileSync(join(project, ".pluginsdk", "build", "build.json"), "utf8")
))

const remoteCommit = (repository: string, home: string): string =>
  runGitText(process.cwd(), home, ["--git-dir=" + repository, "rev-parse", "refs/heads/main"])

const remoteFile = (repository: string, home: string, path: string): Buffer =>
  runGit(process.cwd(), home, ["--git-dir=" + repository, "show", "refs/heads/main:" + path])

const readJsonAtRemote = (repository: string, home: string, path: string) =>
  parseJson(remoteFile(repository, home, path).toString("utf8"))

const readRegistry = (repository: string, home: string) =>
  Schema.decodeUnknownSync(PublishedRegistry)(readJsonAtRemote(repository, home, registryPath))

const readIndex = (repository: string, home: string, client: "claude_code" | "codex") =>
  Schema.decodeUnknownSync(MarketplaceIndex)(readJsonAtRemote(
    repository,
    home,
    client === "claude_code" ? claudeIndexPath : codexIndexPath
  ))

const releaseFor = (releases: ReadonlyArray<PublishedRelease>, version: string): PublishedRelease => {
  const release = releases.find((candidate) => candidate.version === version)
  if (release === undefined) throw new Error(`Missing published release ${version}`)
  return release
}

const bundleFile = (bundle: Bundle, path: string): Uint8Array => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Missing built package file ${path}`)
  return file.content
}

const expectIndexPath = (
  repository: string,
  home: string,
  client: "claude_code" | "codex",
  plugin: string,
  release: PublishedRelease
): void => {
  const index = readIndex(repository, home, client)
  const matches = index.plugins.filter((entry) => entry.name === plugin)
  expect(matches).toHaveLength(1)
  const entry = matches[0]
  if (entry === undefined) throw new Error(`Missing marketplace entry for ${plugin}`)
  const expectedPath = `./plugins/${plugin}/${release.digest}/${client}`
  if (client === "claude_code") {
    expect(Schema.decodeUnknownSync(Schema.String)(entry.source)).toBe(expectedPath)
  } else {
    const source = Schema.decodeUnknownSync(Schema.Struct({ source: Schema.Literal("local"), path: Schema.String }))(entry.source)
    expect(source.path).toBe(expectedPath)
  }
}

const expectPublishedPackageBytes = (
  repository: string,
  home: string,
  release: PublishedRelease,
  snapshot: BuildSnapshot
): void => {
  for (const bundle of snapshot.bundles) {
    const client = bundle.format.startsWith("claude_code") ? "claude_code" : "codex"
    const prefix = `plugins/${release.plugin}/${release.digest}/${client}`
    for (const file of bundle.files) {
      expect(remoteFile(repository, home, `${prefix}/${file.path}`)).toEqual(Buffer.from(file.content))
    }
  }
}

const expectForeignEntries = (
  repository: string,
  home: string,
  marketplace: SeededMarketplace
): void => {
  expect(remoteFile(repository, home, "README.md").toString("utf8")).toBe("Externally maintained marketplace content.\n")
  expect(readIndex(repository, home, "claude_code").plugins.find((entry) => entry.name === marketplace.claudeForeign.name))
    .toEqual(marketplace.claudeForeign)
  expect(readIndex(repository, home, "codex").plugins.find((entry) => entry.name === marketplace.codexForeign.name))
    .toEqual(marketplace.codexForeign)
}

it("builds declared executable sources for Claude, Codex and Cursor targets", () => withTempDirectory((directory, home) => {
  const project = join(directory, "project")
  mkdirSync(project)
  const definition = {
    id: "executable-cli",
    version: "1.0.0",
    description: "A packaged report command and its documentation.",
    skills: [],
    assets: ["tools"],
    executables: ["tools/report.sh"],
    mcp: {}
  }
  writeFile(join(project, "definition.json"), JSON.stringify(definition))
  writeFile(join(project, "tools/report.sh"), "#!/bin/sh\nprintf 'report\\n'\n")
  writeFile(join(project, "tools/README.md"), "Run the packaged report command.\n")
  const built = runCli(project, home, ["build"])
  expect(built.status, built.stderr).toBe(0)
  const snapshot = readBuild(project)
  expect(new Set(snapshot.bundles.map(({ format }) => format))).toEqual(new Set(["claude_code_v2", "agent_plugins_v2"]))
  for (const bundle of snapshot.bundles) {
    expect(bundle.files.find(({ path }) => path === "tools/report.sh")?.executable).toBe(true)
    expect(bundle.files.find(({ path }) => path === "tools/README.md")?.executable).toBe(false)
    expect(Buffer.from(bundleFile(bundle, "tools/report.sh"))).toEqual(Buffer.from("#!/bin/sh\nprintf 'report\\n'\n"))
  }
  const cursor = runCli(project, home, ["build", "--target", "cursor"])
  expect(cursor.status, cursor.stderr).toBe(0)
  expect(readBuild(project).bundles).toEqual(snapshot.bundles.filter(({ format }) => format === "claude_code_v2"))
  writeFile(join(project, "definition.json"), JSON.stringify({ ...definition, executables: ["tools/missing.sh"] }))
  const rejected = runCli(project, home, ["build"])
  expect(rejected.status).toBe(1)
  expect(rejected.stderr).toContain("invalid executable declaration at tools/missing.sh")
}), 60_000)

it("builds and publishes immutable releases while preserving marketplace state", () => withTempDirectory((directory, home) => {
  const marketplace = seedMarketplace(directory, home)
  const project = join(directory, "project")
  mkdirSync(project)
  const definitionPath = join(project, "definition.json")
  const skillPath = join(project, "skills", "release-notes", "SKILL.md")
  const buildPath = join(project, ".pluginsdk", "build", "build.json")
  const firstDefinition = definitionText(marketplace.repository, "1.0.0")
  const firstSkill = new TextEncoder().encode("---\nname: release-notes\ndescription: First captured release.\n---\n# First release\n")
  writeFile(definitionPath, firstDefinition)
  writeFile(skillPath, firstSkill)

  const firstBuild = runCli(project, home, ["build", "--json"])
  expect(firstBuild.status, firstBuild.stderr).toBe(0)
  const firstSnapshotBytes = readFileSync(buildPath)
  const firstSnapshot = readBuild(project)
  expect(firstSnapshot.bundles.map((bundle) => bundle.format)).toEqual(["claude_code_v2", "agent_plugins_v2"])
  expect(firstSnapshot.definition).toMatch(/^[a-f0-9]{64}$/)
  const firstBuildDirectory = join(project, ".pluginsdk", "build")
  const claudeBundle = Schema.decodeUnknownSync(Bundle)(parseJson(readFileSync(join(firstBuildDirectory, "claude_code.bundle.json"), "utf8")))
  const codexBundle = Schema.decodeUnknownSync(Bundle)(parseJson(readFileSync(join(firstBuildDirectory, "codex.bundle.json"), "utf8")))
  expect(bundleFile(claudeBundle, "skills/release-notes/SKILL.md")).toEqual(firstSkill)
  expect(bundleFile(codexBundle, "skills/release-notes/SKILL.md")).toEqual(firstSkill)

  const firstPublish = runCli(project, home, ["publish"])
  expect(firstPublish.status, firstPublish.stderr).toBe(0)
  expect(firstPublish.stdout).toContain("published: release-notes@1.0.0")
  const firstCommit = remoteCommit(marketplace.repository, home)
  const firstRegistry = readRegistry(marketplace.repository, home)
  expect(firstRegistry.marketplace).toBe("acme")
  expect(firstRegistry.releases.map((release) => release.version)).toEqual(["1.0.0"])
  const firstRelease = releaseFor(firstRegistry.releases, "1.0.0")
  expect(firstRelease.packages.map((pkg) => pkg.client)).toEqual(["claude_code", "codex"])
  expectIndexPath(marketplace.repository, home, "claude_code", "release-notes", firstRelease)
  expectIndexPath(marketplace.repository, home, "codex", "release-notes", firstRelease)
  expectPublishedPackageBytes(marketplace.repository, home, firstRelease, firstSnapshot)
  expectForeignEntries(marketplace.repository, home, marketplace)

  const editedAfterBuild = new TextEncoder().encode("---\nname: release-notes\ndescription: Edited after build.\n---\n# Source changed after build\n")
  writeFile(skillPath, editedAfterBuild)
  const repeatedPublish = runCli(project, home, ["publish"])
  expect(repeatedPublish.status, repeatedPublish.stderr).toBe(0)
  expect(repeatedPublish.stdout).toContain("unchanged: release-notes@1.0.0")
  expect(remoteCommit(marketplace.repository, home)).toBe(firstCommit)
  expectPublishedPackageBytes(marketplace.repository, home, firstRelease, firstSnapshot)

  writeFile(definitionPath, definitionText(marketplace.repository, "1.1.0"))
  const secondSkill = new TextEncoder().encode("---\nname: release-notes\ndescription: Second captured release.\n---\n# Second release\n")
  writeFile(skillPath, secondSkill)
  const secondBuild = runCli(project, home, ["build"])
  expect(secondBuild.status, secondBuild.stderr).toBe(0)
  const secondSnapshot = readBuild(project)
  const secondPublish = runCli(project, home, ["publish"])
  expect(secondPublish.status, secondPublish.stderr).toBe(0)
  expect(secondPublish.stdout).toContain("published: release-notes@1.1.0")
  const secondCommit = remoteCommit(marketplace.repository, home)
  expect(secondCommit).not.toBe(firstCommit)
  const secondRegistry = readRegistry(marketplace.repository, home)
  expect(secondRegistry.releases.map((release) => release.version)).toEqual(["1.0.0", "1.1.0"])
  const secondRelease = releaseFor(secondRegistry.releases, "1.1.0")
  expectIndexPath(marketplace.repository, home, "claude_code", "release-notes", secondRelease)
  expectIndexPath(marketplace.repository, home, "codex", "release-notes", secondRelease)
  expectPublishedPackageBytes(marketplace.repository, home, secondRelease, secondSnapshot)
  expectPublishedPackageBytes(marketplace.repository, home, firstRelease, firstSnapshot)
  expectForeignEntries(marketplace.repository, home, marketplace)

  writeFile(definitionPath, firstDefinition)
  writeFile(buildPath, firstSnapshotBytes)
  const replay = runCli(project, home, ["publish"])
  expect(replay.status, replay.stderr).toBe(0)
  expect(replay.stdout).toContain("unchanged: release-notes@1.0.0")
  expect(remoteCommit(marketplace.repository, home)).toBe(secondCommit)
  expectIndexPath(marketplace.repository, home, "claude_code", "release-notes", secondRelease)
  expectIndexPath(marketplace.repository, home, "codex", "release-notes", secondRelease)
  expect(readRegistry(marketplace.repository, home).releases).toHaveLength(2)

  const conflictingSource = new TextEncoder().encode("---\nname: release-notes\ndescription: Conflicting same-version source.\n---\n# Conflict\n")
  writeFile(skillPath, conflictingSource)
  const sameVersionBuild = runCli(project, home, ["build"])
  expect(sameVersionBuild.status, sameVersionBuild.stderr).toBe(0)
  expect(readBuild(project).version).toBe("1.0.0")
  const beforeConflict = remoteCommit(marketplace.repository, home)
  const conflict = runCli(project, home, ["publish"])
  expect(conflict.status).not.toBe(0)
  expect(conflict.stderr).toContain("Version 1.0.0 already has different contents")
  expect(remoteCommit(marketplace.repository, home)).toBe(beforeConflict)

  writeFile(definitionPath, definitionText(join(directory, "other-marketplace.git"), "1.0.0"))
  const staleTarget = runCli(project, home, ["publish"])
  expect(staleTarget.status).not.toBe(0)
  expect(staleTarget.stderr).toContain("Definition changed since this build; rebuild the project")
  expect(remoteCommit(marketplace.repository, home)).toBe(beforeConflict)

  writeFile(definitionPath, definitionText(marketplace.repository, "1.2.0"))
  const codexSkill = new TextEncoder().encode("---\nname: release-notes\ndescription: Codex-only release.\n---\n# Codex release\n")
  writeFile(skillPath, codexSkill)
  const codexBuild = runCli(project, home, ["build", "--target", "codex"])
  expect(codexBuild.status, codexBuild.stderr).toBe(0)
  const codexSnapshot = readBuild(project)
  expect(codexSnapshot.bundles).toHaveLength(1)
  expect(codexSnapshot.bundles[0]?.format).toBe("agent_plugins_v2")
  const codexPublish = runCli(project, home, ["publish"])
  expect(codexPublish.status, codexPublish.stderr).toBe(0)
  expect(codexPublish.stdout).toContain("published: release-notes@1.2.0")
  const finalRegistry = readRegistry(marketplace.repository, home)
  expect(finalRegistry.releases.map((release) => release.version)).toEqual(["1.0.0", "1.1.0", "1.2.0"])
  const codexRelease = releaseFor(finalRegistry.releases, "1.2.0")
  expect(codexRelease.packages.map((pkg) => pkg.client)).toEqual(["codex"])
  expectIndexPath(marketplace.repository, home, "claude_code", "release-notes", secondRelease)
  expectIndexPath(marketplace.repository, home, "codex", "release-notes", codexRelease)
  expectPublishedPackageBytes(marketplace.repository, home, codexRelease, codexSnapshot)
  expectForeignEntries(marketplace.repository, home, marketplace)
}), 60_000)

it("blocks unowned marketplace collisions without changing the Git branch", () => withTempDirectory((directory, home) => {
  const plugin = "collision-plugin"
  const marketplace = seedMarketplace(directory, home, plugin)
  const project = join(directory, "project")
  mkdirSync(project)
  writeFile(join(project, "definition.json"), definitionText(marketplace.repository, "1.0.0", plugin))
  writeFile(join(project, "skills", "release-notes", "SKILL.md"), "---\nname: release-notes\ndescription: Collision fixture.\n---\n# Collision\n")

  const built = runCli(project, home, ["build"])
  expect(built.status, built.stderr).toBe(0)
  const before = remoteCommit(marketplace.repository, home)
  const publish = runCli(project, home, ["publish"])
  expect(publish.status).not.toBe(0)
  expect(publish.stderr).toContain(`Marketplace entry is not owned by PluginSDK: ${plugin}`)
  expect(remoteCommit(marketplace.repository, home)).toBe(before)
  expectForeignEntries(marketplace.repository, home, marketplace)
  expect(readIndex(marketplace.repository, home, "claude_code").plugins).toHaveLength(1)
  expect(readIndex(marketplace.repository, home, "codex").plugins).toHaveLength(1)
  expect(existsSync(join(project, ".claude"))).toBe(false)
  expect(existsSync(join(project, ".codex"))).toBe(false)
}), 60_000)

it("requires a publication destination and creates no local installation", () => withTempDirectory((directory, home) => {
  const project = join(directory, "project")
  mkdirSync(project)
  writeFile(join(project, "definition.json"), definitionText(undefined, "1.0.0"))

  const publish = runCli(project, home, ["publish"])
  expect(publish.status).not.toBe(0)
  expect(publish.stderr).toContain("Add a publish destination to the definition")
  expect(existsSync(join(project, ".pluginsdk"))).toBe(false)
  expect(existsSync(join(project, ".claude"))).toBe(false)
  expect(existsSync(join(project, ".codex"))).toBe(false)
  expect(existsSync(join(home, ".claude"))).toBe(false)
  expect(existsSync(join(home, ".codex"))).toBe(false)
}), 60_000)

it("blocks a changed retained package before advancing the publication branch", () => withTempDirectory((directory, home) => {
  const marketplace = seedMarketplace(directory, home)
  const project = join(directory, "project")
  mkdirSync(project)
  const definition = join(project, "definition.json")
  writeFile(definition, definitionText(marketplace.repository, "1.0.0"))
  writeFile(join(project, "skills/release-notes/SKILL.md"), "---\nname: release-notes\ndescription: Retained package.\n---\n# Original\n")
  const built = runCli(project, home, ["build"])
  expect(built.status, built.stderr).toBe(0)
  const published = runCli(project, home, ["publish"])
  expect(published.status, published.stderr).toBe(0)
  const release = releaseFor(readRegistry(marketplace.repository, home).releases, "1.0.0")
  const seed = join(directory, "seed")
  runGit(seed, home, ["pull", "--ff-only", "origin", "main"])
  writeFile(join(seed, `plugins/release-notes/${release.digest}/claude_code/skills/release-notes/SKILL.md`), "Changed outside PluginSDK\n")
  runGit(seed, home, ["add", "plugins"])
  runGit(seed, home, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "Change retained package"])
  runGit(seed, home, ["push", "origin", "main"])
  const before = remoteCommit(marketplace.repository, home)

  writeFile(definition, definitionText(marketplace.repository, "1.1.0"))
  const rebuilt = runCli(project, home, ["build"])
  expect(rebuilt.status, rebuilt.stderr).toBe(0)
  const rejected = runCli(project, home, ["publish"])
  expect(rejected.status).toBe(1)
  expect(rejected.stderr).toContain("Published package changed: release-notes@1.0.0 (claude_code)")
  expect(remoteCommit(marketplace.repository, home)).toBe(before)
  expect(readRegistry(marketplace.repository, home).releases).toHaveLength(1)
}), 60_000)
