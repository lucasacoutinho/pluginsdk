import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Effect, Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { RoleName } from "../contracts/Agents.ts"
import { Activation, ConfigFile, type Activation as ActivationType } from "../contracts/ProjectActivation.ts"
import { Directory, PluginId } from "../contracts/Plugin.ts"
import { InstallationKey } from "../contracts/Installer.ts"
import { MarketplaceName, Registration } from "../contracts/ProjectConfig.ts"
import { ConfigRead } from "../src/installer/hosts/codex-config.ts"
import { ProjectTarget } from "../src/installer/project/layout.ts"
import { inspectProjectRoles } from "../src/installer/project/roles.ts"
import { roleLimits } from "../src/installer/project/codex-role-sources.ts"

type Fixture = {
  readonly root: string
  readonly home: string
  readonly codex: string
  readonly target: ProjectTarget
  readonly registration: Registration
}

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const roleBytes = (name: string | null): Uint8Array => new TextEncoder().encode(name === null
  ? 'description = "Role without an identity"\ndeveloper_instructions = "Do the work."\n'
  : `name = "${name}"\ndescription = "Project helper"\ndeveloper_instructions = "Do the work."\n`)
const writeRole = async (path: string, name: string | null): Promise<Uint8Array> => {
  await mkdir(dirname(path), { recursive: true })
  const bytes = roleBytes(name)
  await writeFile(path, bytes, { mode: 0o644 })
  await chmod(path, 0o644)
  return bytes
}

const expectUnchanged = async (path: string, bytes: Uint8Array): Promise<void> => {
  const info = await lstat(path)
  expect(new Uint8Array(await readFile(path))).toEqual(bytes)
  expect(info.mode & 0o777).toBe(0o644)
}
const cacheFile = (value: Fixture, agent = "auditor"): string => join(value.home, "plugins", "cache",
  value.registration.marketplace, value.registration.plugin, "1.0.0", "agents", `${agent}.toml`)
const activation = (value: Fixture, name: string, configFile: string): ActivationType => decode(Activation, {
  registration: value.registration, agents: [{ name: RoleName.make(name), configFile: ConfigFile.make(configFile) }]
})
const declarationConfig = (name: string, configFile: string) => ({ agents: { [name]: { config_file: configFile } } })
const effectiveDeclarationConfig = (name: string, configFile: string) => ({
  agents: { [name]: { description: null, config_file: configFile, nickname_candidates: null } }
})
const projectLayer = (value: Fixture, config: unknown = {}) => ({ name: { type: "project", dotCodexFolder: value.codex }, config })
const userLayer = (value: Fixture, config: unknown = {}) => ({ name: { type: "user", file: join(value.home, "config.toml"), profile: null }, config })
const configRead = (layers: ReadonlyArray<unknown>, config: unknown = {}) => decode(ConfigRead, { config, origins: {}, layers })

const inspect = (
  value: Fixture, layers: ReadonlyArray<unknown>, effective: unknown,
  previous: ActivationType | null, desired: ActivationType | null
) => Effect.runPromise(inspectProjectRoles(value.target, configRead(layers, effective), previous, desired))

let current: Fixture | null = null

const fixture = async (): Promise<Fixture> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-project-roles-"))
  const home = join(root, "home")
  const codex = join(root, "project", ".codex")
  await mkdir(home)
  await mkdir(codex, { recursive: true })
  const target = decode(ProjectTarget, {
    key: InstallationKey.make("project-role-reader-test"),
    destination: { type: "project", host: "codex", home: Directory.make(home), root: Directory.make(join(root, "project")) },
    plugin: PluginId.make("team-kit"),
    profile: "codex-project-cache:1",
    version: "0.163.0"
  })
  const registration = decode(Registration, {
    plugin: target.plugin,
    marketplace: MarketplaceName.make(`pluginsdk-${"a".repeat(24)}`),
    root: Directory.make(join(home, "plugins", "cache", "market"))
  })
  return { root, home, codex, target, registration }
}

beforeEach(async () => {
  current = await fixture()
})

afterEach(async () => {
  if (current !== null) await rm(current.root, { recursive: true, force: true })
  current = null
})

const fixtureValue = (): Fixture => {
  if (current === null) throw new Error("Missing fixture")
  return current
}

describe("Codex project role inspection", () => {
  it("accepts the native merged declaration with null defaults and an unchanged 0644 cache role", async () => {
    const value = fixtureValue()
    const name = RoleName.make("team-kit:auditor")
    const path = cacheFile(value)
    const bytes = await writeRole(path, name)
    const before = await lstat(path)
    const declaration = declarationConfig(name, path)
    const result = await inspect(value, [projectLayer(value, declaration)], effectiveDeclarationConfig(name, path),
      activation(value, name, path), null)

    expect(result).toEqual({ type: "ready" })
    await expectUnchanged(path, bytes)
    expect((await lstat(path)).ino).toBe(before.ino)
    await expect(inspect(value, [projectLayer(value, declaration)], {}, activation(value, name, path), null))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
  })

  it("reports drift when a managed cache file changes its declared role identity", async () => {
    const value = fixtureValue()
    const name = RoleName.make("team-kit:auditor")
    const path = cacheFile(value)
    const bytes = await writeRole(path, "team-kit:reviewer")
    const declaration = declarationConfig(name, path)

    await expect(inspect(value, [projectLayer(value, declaration)], declaration,
      activation(value, name, path), null)).resolves.toEqual({ type: "blocked", reason: "drift" })
    await expectUnchanged(path, bytes)
  })

  it("refuses effective overrides, unknown fields, and an incomplete merged declaration", async () => {
    const value = fixtureValue(), name = RoleName.make("team-kit:auditor"), path = cacheFile(value)
    const bytes = await writeRole(path, name)
    const layer = projectLayer(value, declarationConfig(name, path))
    for (const effective of [
      { config_file: path, description: "Foreign override", nickname_candidates: null },
      { config_file: path, description: null, nickname_candidates: ["Foreign nickname"] },
      { config_file: join(value.root, "different.toml"), description: null, nickname_candidates: null },
      { config_file: path, description: null, nickname_candidates: null, extra: true },
      { config_file: path }
    ]) {
      await expect(inspect(value, [layer], { agents: { [name]: effective } }, activation(value, name, path), null))
        .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    }
    await expectUnchanged(path, bytes)
  })

  it("resolves relative config_file paths at the project folder and uses the file name", async () => {
    const value = fixtureValue()
    const alias = RoleName.make("team-kit:alias")
    const fileName = RoleName.make("team-kit:effective")
    const relative = "agents/alias.toml"
    const resolved = join(value.codex, relative)
    const bytes = await writeRole(resolved, fileName)
    const desired = activation(value, fileName, cacheFile(value, "effective"))
    const declaration = declarationConfig(alias, relative)

    await expect(inspect(value, [projectLayer(value, declaration)], {}, null, desired))
      .resolves.toEqual({ type: "blocked", reason: "unowned" })
    await expectUnchanged(resolved, bytes)
  })

  it("blocks foreign declarations that claim a desired role name or cache path", async () => {
    const value = fixtureValue()
    const name = RoleName.make("team-kit:auditor")
    const desiredPath = cacheFile(value)
    const desired = activation(value, name, desiredPath)
    const foreignPath = join(value.home, "foreign-role.toml")
    const foreignBytes = await writeRole(foreignPath, name)

    await expect(inspect(value, [userLayer(value, declarationConfig(name, foreignPath))], {}, null, desired))
      .resolves.toEqual({ type: "blocked", reason: "unowned" })

    const alias = RoleName.make("team-kit:alias")
    const aliasedBytes = await writeRole(desiredPath, alias)
    await expect(inspect(value, [userLayer(value, declarationConfig(alias, desiredPath))], {}, null, desired))
      .resolves.toEqual({ type: "blocked", reason: "unowned" })
    await expectUnchanged(foreignPath, foreignBytes)
    await expectUnchanged(desiredPath, aliasedBytes)

    await writeRole(desiredPath, name)
    const declaration = declarationConfig(name, desiredPath)
    await expect(inspect(value, [userLayer(value, declaration), projectLayer(value, declaration)], declaration,
      activation(value, name, desiredPath), null)).resolves.toEqual({ type: "blocked", reason: "unowned" })
  })

  it("recursively discovers lowercase toml conflicts and ignores uppercase extensions", async () => {
    const value = fixtureValue()
    const name = RoleName.make("team-kit:auditor")
    const desired = activation(value, name, cacheFile(value))
    const upper = join(value.codex, "agents", "Upper.TOML")
    const upperBytes = await writeRole(upper, name)

    await expect(inspect(value, [projectLayer(value)], {}, null, desired)).resolves.toEqual({ type: "ready" })

    const lower = join(value.codex, "agents", "nested", "conflict.toml")
    const lowerBytes = await writeRole(lower, name)
    await expect(inspect(value, [projectLayer(value)], {}, null, desired))
      .resolves.toEqual({ type: "blocked", reason: "unowned" })
    await expectUnchanged(upper, upperBytes)
    await expectUnchanged(lower, lowerBytes)
  })

  it("permits unrelated valid roles and skips disabled layers", async () => {
    const value = fixtureValue()
    const requested = RoleName.make("team-kit:requested")
    const unrelated = RoleName.make("team-kit:unrelated")
    const discovered = RoleName.make("team-kit:discovered")
    const discoveredPath = join(value.codex, "agents", "nested", "unrelated.toml")
    const bytes = await writeRole(discoveredPath, discovered)
    const disabledFolder = join(value.root, "disabled", ".codex")
    const disabled = {
      name: { type: "project", dotCodexFolder: disabledFolder },
      config: { agents: [] },
      disabledReason: "project is untrusted"
    }
    const desired = activation(value, requested, cacheFile(value))

    await expect(inspect(value, [
      userLayer(value, { agents: { [unrelated]: { description: "Unrelated helper" } } }),
      projectLayer(value),
      disabled
    ], {}, null, desired)).resolves.toEqual({ type: "ready" })
    await expectUnchanged(discoveredPath, bytes)
  })

  it("refuses discovered symlinks and roles without a usable identity", async () => {
    const value = fixtureValue()
    const name = RoleName.make("team-kit:auditor")
    const desired = activation(value, name, cacheFile(value))
    const external = join(value.root, "external.toml")
    const bytes = await writeRole(external, name)
    const link = join(value.codex, "agents", "nested", "linked.toml")
    await mkdir(dirname(link), { recursive: true })
    await symlink(external, link)

    await expect(inspect(value, [projectLayer(value)], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    await expect(inspect(value, [projectLayer(value, declarationConfig(name, link))], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    await expectUnchanged(external, bytes)

    await rm(link)
    const nameless = join(dirname(link), "nameless.toml")
    const namelessBytes = await writeRole(nameless, null)
    await expect(inspect(value, [projectLayer(value)], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    await expectUnchanged(nameless, namelessBytes)

    const missing = join(value.codex, "cache", "missing.toml")
    await expect(inspect(value, [projectLayer(value, declarationConfig(name, missing))], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
  })

  it("refuses malformed role config and declaration inventory overflow", async () => {
    const value = fixtureValue()
    const desired = activation(value, "team-kit:requested", cacheFile(value))

    await expect(inspect(value, [projectLayer(value, { agents: [] })], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })

    const declarations = Object.fromEntries(Array.from({ length: roleLimits.files + 1 }, (_, index) => [
      `team-kit:role-${index}`, { description: "Unrelated helper" }
    ]))
    await expect(inspect(value, [projectLayer(value, { agents: declarations })], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
    const currentAtLimit = Object.fromEntries(Object.entries(declarations).slice(0, roleLimits.files))
    await expect(inspect(value, [projectLayer(value, { agents: currentAtLimit })], {}, null, desired))
      .rejects.toMatchObject({ _tag: "InspectionUnavailable" })
  })

  it("returns ready for an empty transition without scanning hostile irrelevant paths", async () => {
    const value = fixtureValue()
    const outside = join(value.root, "outside")
    await mkdir(outside)
    const irrelevant = join(outside, "irrelevant.toml")
    const bytes = await writeRole(irrelevant, "team-kit:unrelated")
    const agents = join(value.codex, "agents")
    await symlink(outside, agents)
    const malformed = projectLayer(value, { agents: [] })

    await expect(inspect(value, [malformed], {}, null, null)).resolves.toEqual({ type: "ready" })
    expect((await lstat(agents)).isSymbolicLink()).toBe(true)
    await expectUnchanged(irrelevant, bytes)
  })
})
