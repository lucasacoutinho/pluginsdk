import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { RoleName } from "../contracts/Agents.ts"
import type { CompanionCapture, RoleFile } from "../contracts/Companions.ts"
import { Directory, PluginId } from "../contracts/Plugin.ts"
import { InstallationKey, type Target } from "../contracts/Installer.ts"
import { executeCompanions, inspectRoles, roleFilePath, roleLimits } from "../src/installer/companions/files.ts"
import { fileDigest } from "../src/internal/identity.ts"

const originalPath = process.env.PATH ?? ""
let current: Fixture | null = null

type Fixture = {
  readonly root: string
  readonly home: string
  readonly bin: string
  readonly target: Target
  readonly responseFile: string
  writeResponse: (layers: ReadonlyArray<unknown>, config?: unknown, origins?: unknown) => Promise<void>
  cleanup: () => Promise<void>
}

const run = <A, E>(effect: Effect.Effect<A, E, import("effect/process").ChildProcessSpawner.ChildProcessSpawner>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)))

const agentRole = (name: string, instructions = "Follow the review request."): Uint8Array =>
  new TextEncoder().encode(`name = "${name}"\ndescription = "Scoped helper"\ndeveloper_instructions = "${instructions}"\n`)

const roleName = (name: string) => RoleName.make(name)

const userLayer = (home: string, config: unknown = {}) => ({
  name: { type: "user", file: join(home, "config.toml"), profile: null },
  version: "0.163.0",
  config
})

const fixture = async (): Promise<Fixture> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-agent-ownership-"))
  const home = join(root, "codex-home")
  const bin = join(root, "bin")
  await mkdir(home)
  await mkdir(bin)
  const target: Target = {
    key: InstallationKey.make("test-agent-role-target"),
    destination: { type: "user", host: "codex", home: Directory.make(home) },
    plugin: PluginId.make("team-kit"),
    profile: "codex-local-marketplace:1",
    version: "0.163.0"
  }
  const responseFile = join(home, "test-config-read.json")
  const fakeCodex = `#!${process.execPath}\nimport { createInterface } from "node:readline";\nimport { readFileSync } from "node:fs";\nconst input = createInterface({ input: process.stdin });\ninput.on("line", (line) => {\n  let request;\n  try { request = JSON.parse(line); } catch { process.exitCode = 2; return; }\n  if (!Object.hasOwn(request, "id")) return;\n  const result = request.id === 1 ? {} : JSON.parse(readFileSync(process.env.CODEX_HOME + "/test-config-read.json", "utf8"));\n  process.stdout.write(JSON.stringify({ id: request.id, result }) + "\\n");\n});\n`
  const binary = join(bin, "codex")
  await writeFile(binary, fakeCodex, { mode: 0o700 })
  await chmod(binary, 0o700)
  const writeResponse = async (layers: ReadonlyArray<unknown>, config: unknown = {}, origins: unknown = {}) => {
    await writeFile(responseFile, JSON.stringify({ config, origins, layers }))
  }
  await writeResponse([userLayer(home)])
  process.env.PATH = `${bin}:${originalPath}`
  return {
    root,
    home,
    bin,
    target,
    responseFile,
    writeResponse,
    cleanup: async () => rm(root, { recursive: true, force: true })
  }
}

const capture = (previous: ReadonlyArray<RoleFile>, desired: ReadonlyArray<RoleFile>) =>
  ({ previous: [...previous], desired: [...desired] } satisfies CompanionCapture)

beforeEach(async () => {
  current = await fixture()
})

afterEach(async () => {
  if (current !== null) await current.cleanup()
  current = null
  process.env.PATH = originalPath
})

afterAll(() => {
  process.env.PATH = originalPath
})

describe("Codex companion role files", () => {
  it("derives a safe user path only for an exact plugin-qualified agent name", () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    expect(roleFilePath(value.target, roleName("team-kit:auditor"))).toBe(join(value.home, "agents", "psdk_team-kit_auditor.toml"))
    expect(() => roleFilePath(value.target, roleName("other:auditor"))).toThrow()
    expect(() => roleFilePath(value.target, roleName("team-kit:../auditor"))).toThrow()
    expect(() => roleFilePath({
      ...value.target,
      destination: { type: "project", host: "codex", home: value.target.destination.home, root: Directory.make(value.root) }
    }, roleName("team-kit:auditor"))).toThrow()
    expect(roleLimits).toEqual({ files: 4096, bytes: 2 * 1024 * 1024 })
  })

  it("creates, keeps, replaces, and removes owned bytes while preserving unrelated files", async () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    const name = roleName("team-kit:auditor")
    const path = roleFilePath(value.target, name)
    const desired = agentRole(name)
    const unrelatedPath = join(value.home, "agents", "nested", "other.toml")
    const unrelated = agentRole("another-plugin:helper")
    await mkdir(dirname(unrelatedPath), { recursive: true })
    await writeFile(unrelatedPath, unrelated, { mode: 0o600 })
    await writeFile(join(value.home, "agents", "keep.txt"), "unrelated", { mode: 0o600 })

    await run(executeCompanions(value.target, capture([], [{ name, content: desired }])))
    expect(new Uint8Array(await readFile(path))).toEqual(desired)
    expect((await lstat(path)).mode & 0o777).toBe(0o600)
    const created = await lstat(path, { bigint: true })
    const inspection = await run(inspectRoles(value.target, [name]))
    expect(inspection.observed).toEqual([{ name, observed: { type: "file", digest: fileDigest(desired) } }])
    expect(inspection.files).toEqual([{ name, content: desired }])
    expect(inspection.facts[name]).toMatchObject({ path, kind: "file", digest: fileDigest(desired), mode: 0o600, conflicts: [] })

    await run(executeCompanions(value.target, capture([{ name, content: desired }], [{ name, content: desired }])))
    expect((await lstat(path, { bigint: true })).ino).toBe(created.ino)

    const replacement = agentRole(name, "Compare evidence and report only concrete findings.")
    await run(executeCompanions(value.target, capture([{ name, content: desired }], [{ name, content: replacement }])))
    expect(new Uint8Array(await readFile(path))).toEqual(replacement)
    expect((await lstat(path)).mode & 0o777).toBe(0o600)

    await run(executeCompanions(value.target, capture([{ name, content: replacement }], [])))
    await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" })
    expect(new Uint8Array(await readFile(unrelatedPath))).toEqual(unrelated)
    expect(await readFile(join(value.home, "agents", "keep.txt"), "utf8")).toBe("unrelated")
  })

  it("refuses to adopt byte-identical unowned files, drift, unsafe modes, and symlinks", async () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    const name = roleName("team-kit:auditor")
    const path = roleFilePath(value.target, name)
    const desired = agentRole(name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, desired, { mode: 0o600 })
    await expect(run(executeCompanions(value.target, capture([], [{ name, content: desired }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    expect(new Uint8Array(await readFile(path))).toEqual(desired)

    const changed = agentRole(name, "Different content.")
    await writeFile(path, changed, { mode: 0o600 })
    await expect(run(executeCompanions(value.target, capture([{ name, content: desired }], [{ name, content: desired }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    expect(new Uint8Array(await readFile(path))).toEqual(changed)

    await writeFile(path, desired, { mode: 0o644 })
    await chmod(path, 0o644)
    await expect(run(executeCompanions(value.target, capture([{ name, content: desired }], [{ name, content: changed }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    expect(new Uint8Array(await readFile(path))).toEqual(desired)

    await rm(path)
    const external = join(value.root, "external.toml")
    await writeFile(external, desired)
    await symlink(external, path)
    await expect(run(executeCompanions(value.target, capture([], [{ name, content: desired }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    expect((await lstat(path)).isSymbolicLink()).toBe(true)
    expect(new Uint8Array(await readFile(external))).toEqual(desired)
  })

  it("blocks nested standalone aliases, config_file name overrides, and project role collisions", async () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    const name = roleName("team-kit:auditor")
    const aliasPath = join(value.home, "agents", "nested", "alias.toml")
    await mkdir(dirname(aliasPath), { recursive: true })
    await writeFile(aliasPath, agentRole(name), { mode: 0o600 })
    await expect(run(executeCompanions(value.target, capture([], [{ name, content: agentRole(name) }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })

    await writeFile(aliasPath, agentRole(`\u0085${name}\u0085`), { mode: 0o600 })
    const nativeWhitespace = await run(inspectRoles(value.target, [name]))
    expect(nativeWhitespace.observed).toEqual([{ name, observed: { type: "conflict" } }])

    await writeFile(aliasPath, agentRole(`\uFEFF${name}\uFEFF`), { mode: 0o600 })
    const ecmaWhitespace = await run(inspectRoles(value.target, [name]))
    expect(ecmaWhitespace.observed).toEqual([{ name, observed: { type: "absent" } }])

    await rm(join(value.home, "agents"), { recursive: true })
    const configFile = join(value.home, "role-files", "alias.toml")
    await mkdir(dirname(configFile), { recursive: true })
    await writeFile(configFile, agentRole(name), { mode: 0o600 })
    const layer = userLayer(value.home, { agents: { declared_alias: { config_file: configFile, description: "Alias role" } } })
    await value.writeResponse([layer], { agents: { declared_alias: { config_file: configFile, description: "Alias role" } } }, {
      [`agents.declared_alias.config_file`]: `user:${join(value.home, "config.toml")}`
    })
    await expect(run(executeCompanions(value.target, capture([], [{ name, content: agentRole(name) }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })

    const projectFolder = join(value.root, ".codex")
    const projectRole = join(projectFolder, "agents", "nested", "same.toml")
    await mkdir(dirname(projectRole), { recursive: true })
    await writeFile(projectRole, agentRole(name), { mode: 0o600 })
    await value.writeResponse([
      userLayer(value.home),
      { name: { type: "project", dotCodexFolder: projectFolder }, version: "0.163.0", config: {} }
    ])
    await expect(run(executeCompanions(value.target, capture([], [{ name, content: agentRole(name) }])))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })
  })

  it("fails closed on a cyclic role directory and oversized referenced role file", async () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    const name = roleName("team-kit:auditor")
    const agents = join(value.home, "agents")
    await mkdir(agents, { recursive: true })
    await symlink(agents, join(agents, "loop"))
    await expect(run(inspectRoles(value.target, [name]))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })

    await rm(agents, { recursive: true, force: true })
    const configFile = join(value.home, "large-role.toml")
    await writeFile(configFile, `name = "${name}"\ndescription = "Alias"\ndeveloper_instructions = "${"x".repeat(2 * 1024 * 1024)}"\n`)
    const layer = userLayer(value.home, { agents: { alias: { config_file: configFile } } })
    await value.writeResponse([layer])
    await expect(run(inspectRoles(value.target, [name]))).rejects.toMatchObject({ _tag: "InspectionUnavailable" })
  })

  it("uses a declared key as the native name hint for config_file roles", async () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    const name = roleName("team-kit:auditor")
    const legacyPath = join(value.home, "legacy-role.toml")
    await writeFile(legacyPath, 'description = "Legacy helper"\ndeveloper_instructions = "Do the work."\n', { mode: 0o600 })
    await value.writeResponse([userLayer(value.home, { agents: { legacy_helper: { config_file: legacyPath } } })])

    const unrelated = await run(inspectRoles(value.target, [name]))
    expect(unrelated.observed).toEqual([{ name, observed: { type: "absent" } }])
    expect(unrelated.facts[name]).toMatchObject({ kind: "absent", conflicts: [] })

    const hintedPath = join(value.home, "hinted-role.toml")
    await writeFile(hintedPath, 'description = "Legacy helper"\ndeveloper_instructions = "Do the work."\n', { mode: 0o600 })
    await value.writeResponse([userLayer(value.home, { agents: { [name]: { config_file: hintedPath } } })])

    const collision = await run(inspectRoles(value.target, [name]))
    expect(collision.observed).toEqual([{ name, observed: { type: "conflict" } }])
    expect(collision.facts[name]).toMatchObject({
      conflicts: expect.arrayContaining([
        expect.objectContaining({ type: "config_file", name, path: hintedPath, declaration: name })
      ])
    })
  })

  it("reports a fixed-path name mismatch as an alias for the declared identity", async () => {
    const value = current
    if (value === null) throw new Error("Missing fixture")
    const pathName = roleName("team-kit:auditor")
    const declaredName = roleName("team-kit:reviewer")
    const path = roleFilePath(value.target, pathName)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, agentRole(declaredName), { mode: 0o600 })

    const inspection = await run(inspectRoles(value.target, [pathName, declaredName]))
    expect(inspection.observed).toEqual([
      { name: pathName, observed: { type: "conflict" } },
      { name: declaredName, observed: { type: "conflict" } }
    ])
    expect(inspection.facts[pathName]).toMatchObject({
      conflicts: expect.arrayContaining([
        expect.objectContaining({ type: "fixed_path_name_mismatch", name: declaredName, path })
      ])
    })
    expect(inspection.facts[declaredName]).toMatchObject({
      conflicts: expect.arrayContaining([
        expect.objectContaining({ type: "discovered", name: declaredName, path })
      ])
    })
  })
})
