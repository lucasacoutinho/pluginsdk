import { existsSync } from "node:fs"
import { chmod, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, sep } from "node:path"
import { Match, Schema } from "effect"
import { expect, it } from "vitest"
import type { Bundle, PackageFile } from "../../contracts/Compiler.ts"
import type { Planning as PlanningValue, ReadyPlan } from "../../contracts/Installer.ts"
import type { ProjectFixture } from "./project-fixture.ts"
import { withProjectFixture } from "./project-fixture.ts"

const skillName = "project-fixture"
const Manifest = Schema.Struct({ version: Schema.NonEmptyString })

const bundleFile = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => String(candidate.path) === path)
  if (file === undefined) throw new Error(`Compiler bundle omitted ${path}`)
  return file
}

const cachePath = (home: string, marketplace: string, plugin: string, version: string): string =>
  join(home, "plugins", "cache", marketplace, plugin, version)

const isInside = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate)
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

const readyPlan = (planning: PlanningValue | null): ReadyPlan => {
  if (planning === null) throw new Error("CLI output did not contain a Planning value")
  return Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
    ready: (plan) => plan,
    repair_ready: () => { throw new Error("Expected a ready project plan") },
    unchanged: () => { throw new Error("Expected a ready project plan, received unchanged") },
    blocked: () => { throw new Error("Expected a ready project plan, received blocked") },
    pending: () => { throw new Error("Expected a ready project plan, received pending") }
  }))
}

const bundleVersion = (bundle: Bundle): string => {
  const file = bundleFile(bundle, ".codex-plugin/plugin.json")
  const value: unknown = JSON.parse(Buffer.from(file.content).toString("utf8"))
  return Schema.decodeUnknownSync(Manifest)(value).version
}

const assertBundleAt = async (bundle: Bundle, directory: string): Promise<void> => {
  const paths: Array<string> = []
  const walk = async (parent: string, prefix = ""): Promise<void> => {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`
      const absolute = join(parent, entry.name)
      if (entry.isDirectory()) await walk(absolute, path)
      else if (entry.isFile()) paths.push(path)
      else throw new Error("Installed cache contains a non-file entry")
    }
  }
  await walk(directory)
  const expectedPaths = bundle.files.map((file) => String(file.path)).sort()
  paths.sort()
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) throw new Error("Installed cache file set differs from its compiler bundle")
  for (const file of bundle.files) {
    const path = join(directory, String(file.path))
    if (!(await readFile(path)).equals(Buffer.from(file.content))) throw new Error(`Installed cache bytes differ at ${String(file.path)}`)
    const mode = (await stat(path)).mode & 0o777
    if ((mode & 0o111) !== (file.executable ? 0o111 : 0)) throw new Error(`Installed cache executable mode differs at ${String(file.path)}`)
  }
}

const installedSkill = async (fixture: ProjectFixture, bundle: Bundle, project: string) => {
  const rows = await fixture.discover(project)
  const matches = rows.filter((row) => row.pluginId?.startsWith(`${String(bundle.plugin)}@`) && row.name.endsWith(`:${skillName}`))
  if (matches.length !== 1 || matches[0] === undefined) throw new Error("Native discovery did not return exactly one project fixture skill")
  const row = matches[0]
  if (row.pluginId === null) throw new Error("Native discovery omitted the marketplace qualified plugin ID")
  const marketplace = row.pluginId.slice(row.pluginId.lastIndexOf("@") + 1)
  const cache = cachePath(fixture.home, marketplace, String(bundle.plugin), bundleVersion(bundle))
  if (!isInside(cache, row.path)) throw new Error("Native skill path escaped its installed project cache")
  if (!(await readFile(row.path)).equals(Buffer.from(bundleFile(bundle, `skills/${skillName}/SKILL.md`).content))) {
    throw new Error("Native skill bytes differ from the compiler bundle")
  }
  const reference = join(dirname(row.path), "reference.md")
  if (!(await readFile(reference)).equals(Buffer.from(bundleFile(bundle, `skills/${skillName}/reference.md`).content))) {
    throw new Error("Native reference bytes differ from the compiler bundle")
  }
  await assertBundleAt(bundle, cache)
  return { row, marketplace, cache }
}

const assertNoFixtureSkill = async (fixture: ProjectFixture, project: string, plugin: string): Promise<void> => {
  const rows = await fixture.discover(project)
  expect(rows.filter((row) => row.pluginId?.startsWith(`${plugin}@`))).toHaveLength(0)
}

const capture = async (path: string) => ({ bytes: await readFile(path), mode: (await stat(path)).mode & 0o777 })

const assertSame = async (path: string, before: { readonly bytes: Buffer; readonly mode: number }, label: string): Promise<void> => {
  const after = await capture(path)
  if (!after.bytes.equals(before.bytes)) throw new Error(`${label} bytes changed`)
  if (after.mode !== before.mode) throw new Error(`${label} mode changed`)
}

const projectPluginCache = (fixture: ProjectFixture): string => join(fixture.home, "plugins", "cache")

it("Codex project install, replacement, stale review, removal, and replay stay scoped to A", async () => {
  await withProjectFixture(async (fixture) => {
    const userBefore = await capture(fixture.userConfig)
    const initial = await fixture.bundle("first revision")
    const desired = await fixture.bundle("second revision")
    expect(initial.bundle.format).toBe("codex")
    expect(bundleFile(initial.bundle, `skills/${skillName}/reference.md`).content).toEqual(Buffer.from("reference bytes for first revision\n"))
    expect(bundleFile(initial.bundle, "tools/run.sh")).toMatchObject({
      content: Buffer.from("#!/bin/sh\nprintf '%s\\n' 'first revision'\n"),
      executable: true
    })
    expect(bundleVersion(initial.bundle)).toBe(bundleVersion(desired.bundle))
    expect(initial.bundle.digest).not.toBe(desired.bundle.digest)

    const initialRun = await fixture.plan(initial.bundlePath)
    expect(initialRun.result.code).toBe(0)
    const initialPlan = readyPlan(initialRun.planning)
    expect(initialPlan.change.type).toBe("install")
    const installed = await fixture.apply(initialRun.path)
    expect(installed.result.code).toBe(0)
    expect(installed.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
    expect((await fixture.apply(initialRun.path)).outcome).toStrictEqual(installed.outcome)
    expect((await fixture.plan(initial.bundlePath)).planning?.type).toBe("unchanged")

    const originalProject = await readFile(fixture.projectConfig, "utf8")
    expect(originalProject.startsWith("# Trusted project configuration.\n")).toBe(true)
    const firstInstall = await installedSkill(fixture, initial.bundle, fixture.projectA)
    await assertNoFixtureSkill(fixture, fixture.projectB, String(fixture.pluginId))
    await assertSame(fixture.userConfig, userBefore, "Ordinary Codex user config")
    expect(existsSync(firstInstall.cache)).toBe(true)

    await writeFile(fixture.projectConfig, `model = "gpt-5.1-codex"\n${originalProject}`)
    const afterUserSetting = await capture(fixture.projectConfig)
    expect((await fixture.plan(initial.bundlePath)).planning?.type).toBe("unchanged")
    await assertSame(fixture.projectConfig, afterUserSetting, "Project config after unchanged planning")
    const replacementRun = await fixture.plan(desired.bundlePath)
    expect(replacementRun.result.code).toBe(0)
    const replacementPlan = readyPlan(replacementRun.planning)
    expect(replacementPlan.change.type).toBe("replace")
    const previous = replacementPlan.project?.previous
    if (previous === undefined || previous === null) throw new Error("Replacement review did not capture prior project ownership")
    const oldMarketplace = String(previous.marketplace)
    const oldCacheRoot = join(projectPluginCache(fixture), oldMarketplace)
    expect(existsSync(oldCacheRoot)).toBe(true)

    await writeFile(fixture.projectConfig, `model = "gpt-5.2-codex"\n${originalProject}`)
    await chmod(fixture.projectConfig, 0o600)
    const newerConfig = await capture(fixture.projectConfig)
    const stale = await fixture.applyResult(replacementRun.path)
    expect(stale.code).not.toBe(0)
    expect(stale.stderr).toContain("stale_plan")
    await assertSame(fixture.projectConfig, newerConfig, "Newer project config after stale apply")
    const afterStale = await installedSkill(fixture, initial.bundle, fixture.projectA)
    expect(afterStale.marketplace).toBe(oldMarketplace)
    await assertNoFixtureSkill(fixture, fixture.projectB, String(fixture.pluginId))

    const replacementReview = await fixture.plan(desired.bundlePath)
    expect(replacementReview.result.code).toBe(0)
    const replacement = readyPlan(replacementReview.planning)
    expect(replacement.change.type).toBe("replace")
    const appliedReplacement = await fixture.apply(replacementReview.path)
    expect(appliedReplacement.result.code).toBe(0)
    expect(appliedReplacement.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
    const secondInstall = await installedSkill(fixture, desired.bundle, fixture.projectA)
    expect(secondInstall.marketplace).not.toBe(oldMarketplace)
    expect(secondInstall.cache).not.toBe(firstInstall.cache)
    expect(existsSync(oldCacheRoot)).toBe(false)
    const changedConfig = await readFile(fixture.projectConfig, "utf8")
    expect(changedConfig.startsWith("model = \"gpt-5.2-codex\"\n")).toBe(true)
    expect((await stat(fixture.projectConfig)).mode & 0o777).toBe(0o600)
    await assertSame(fixture.userConfig, userBefore, "Ordinary Codex user config after replacement")

    const removalRun = await fixture.plan(null)
    expect(removalRun.result.code).toBe(0)
    expect(readyPlan(removalRun.planning).change.type).toBe("remove")
    const removed = await fixture.apply(removalRun.path)
    expect(removed.result.code).toBe(0)
    expect(removed.outcome).toMatchObject({ type: "completed", result: { type: "removed" } })
    expect((await fixture.apply(removalRun.path)).outcome).toStrictEqual(removed.outcome)
    await assertNoFixtureSkill(fixture, fixture.projectA, String(fixture.pluginId))
    await assertNoFixtureSkill(fixture, fixture.projectB, String(fixture.pluginId))
    expect(existsSync(join(projectPluginCache(fixture), secondInstall.marketplace))).toBe(false)
    expect((await fixture.plan(null)).planning?.type).toBe("unchanged")
    await assertSame(fixture.userConfig, userBefore, "Ordinary Codex user config after removal")
  })
})

it("Codex project installation creates an absent project config and preserves user state", async () => {
  await withProjectFixture(async (fixture) => {
    const userBefore = await capture(fixture.userConfig)
    const built = await fixture.bundle("new project configuration")
    await rm(join(fixture.projectA, ".codex"), { recursive: true })
    const planned = await fixture.plan(built.bundlePath)
    expect(planned.result.code).toBe(0)
    const plan = readyPlan(planned.planning)
    expect(plan.change.type).toBe("install")
    expect(plan.project?.before).toEqual({ type: "absent" })
    const applied = await fixture.apply(planned.path)
    expect(applied.result.code).toBe(0)
    const active = await installedSkill(fixture, built.bundle, fixture.projectA)
    await assertNoFixtureSkill(fixture, fixture.projectB, String(fixture.pluginId))
    const removal = await fixture.plan(null)
    expect(readyPlan(removal.planning).change.type).toBe("remove")
    expect((await fixture.apply(removal.path)).outcome).toMatchObject({ type: "completed", result: { type: "removed" } })
    await assertNoFixtureSkill(fixture, fixture.projectA, String(fixture.pluginId))
    expect(existsSync(join(projectPluginCache(fixture), active.marketplace))).toBe(false)
    await assertSame(fixture.userConfig, userBefore, "Ordinary Codex user config after project lifecycle")
  })
})

it("untrusted project config and an effective plugins=false setting block before cache or registration writes", async () => {
  await withProjectFixture(async (fixture) => {
    const built = await fixture.bundle("admission check")
    const untrustedConfig = `[features]\nplugins = true\n\n[projects.${JSON.stringify(fixture.projectA)}]\ntrust_level = "trusted"\n`
    await writeFile(fixture.userConfig, untrustedConfig)
    const untrustedHomeBefore = await capture(fixture.userConfig)
    const untrustedProjectConfig = join(fixture.projectB, ".codex", "config.toml")
    const untrustedProjectBefore = await capture(untrustedProjectConfig)
    const untrusted = await fixture.plan(built.bundlePath, fixture.projectB)
    expect(untrusted.result.code).not.toBe(0)
    expect(untrusted.planning).toMatchObject({ type: "blocked", reason: "unknown" })
    await assertSame(fixture.userConfig, untrustedHomeBefore, "User config after untrusted plan")
    await assertSame(untrustedProjectConfig, untrustedProjectBefore, "Untrusted project config")
    expect(existsSync(projectPluginCache(fixture))).toBe(false)

    await writeFile(fixture.projectConfig, "[features]\nplugins = false\n")
    const disabledProjectBefore = await capture(fixture.projectConfig)
    const disabledHomeBefore = await capture(fixture.userConfig)
    const disabled = await fixture.plan(built.bundlePath)
    expect(disabled.result.code).not.toBe(0)
    expect(disabled.planning).toMatchObject({ type: "blocked", reason: "unknown" })
    await assertSame(fixture.userConfig, disabledHomeBefore, "User config after disabled feature plan")
    await assertSame(fixture.projectConfig, disabledProjectBefore, "Disabled project config")
    expect(existsSync(projectPluginCache(fixture))).toBe(false)
  })
})

it("unowned same-ID selectors in user and project config remain untouched", async () => {
  await withProjectFixture(async (fixture) => {
    const built = await fixture.bundle("selector conflict")
    const cleanHome = await readFile(fixture.userConfig, "utf8")
    const homeSelector = `${cleanHome}\n[plugins."${String(fixture.pluginId)}@foreign-home"]\nenabled = true\n\n[marketplaces.foreign-home]\nsource_type = "local"\nsource = "${fixture.source}"\n`
    await writeFile(fixture.userConfig, homeSelector)
    const homeBefore = await capture(fixture.userConfig)
    const projectBefore = await capture(fixture.projectConfig)
    const blockedAtHome = await fixture.plan(built.bundlePath)
    expect(blockedAtHome.result.code).not.toBe(0)
    expect(blockedAtHome.planning?.type).toBe("blocked")
    await assertSame(fixture.userConfig, homeBefore, "Unowned home selector")
    await assertSame(fixture.projectConfig, projectBefore, "Project config after home selector conflict")
    expect(existsSync(projectPluginCache(fixture))).toBe(false)

    await writeFile(fixture.userConfig, cleanHome)
    const projectSelector = `# Trusted project configuration.\n\n[plugins."${String(fixture.pluginId)}@foreign-project"]\nenabled = true\n\n[marketplaces.foreign-project]\nsource_type = "local"\nsource = "${fixture.source}"\n`
    await writeFile(fixture.projectConfig, projectSelector)
    const homeRestored = await capture(fixture.userConfig)
    const projectSelectorBefore = await capture(fixture.projectConfig)
    const blockedAtProject = await fixture.plan(built.bundlePath)
    expect(blockedAtProject.result.code).not.toBe(0)
    expect(blockedAtProject.planning?.type).toBe("blocked")
    await assertSame(fixture.userConfig, homeRestored, "Ordinary user config after project selector conflict")
    await assertSame(fixture.projectConfig, projectSelectorBefore, "Unowned project selector")
    expect(existsSync(projectPluginCache(fixture))).toBe(false)
  })
})

it("blocks changed cache bytes and registration values without refreshing or removing them", async () => {
  await withProjectFixture(async (fixture) => {
    const built = await fixture.bundle("owned revision")
    const desired = await fixture.bundle("replacement revision")
    const saved = await fixture.plan(built.bundlePath)
    readyPlan(saved.planning)
    expect((await fixture.apply(saved.path)).outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
    const active = await installedSkill(fixture, built.bundle, fixture.projectA)
    const userBefore = await capture(fixture.userConfig)
    const configBefore = await capture(fixture.projectConfig)
    const support = join(dirname(active.row.path), "reference.md")
    const original = await readFile(support)
    const changed = Buffer.from("changed outside PluginSDK\n")
    await writeFile(support, changed)
    expect((await fixture.plan(desired.bundlePath)).planning).toMatchObject({ type: "blocked", reason: "drift" })
    expect((await fixture.plan(null)).planning).toMatchObject({ type: "blocked", reason: "drift" })
    expect(await readFile(support)).toEqual(changed)
    await assertSame(fixture.projectConfig, configBefore, "Project config after cache drift")
    await writeFile(support, original)
    const edited = configBefore.bytes.toString("utf8").replace("enabled = true", "enabled = false")
    await writeFile(fixture.projectConfig, edited)
    expect((await fixture.plan(desired.bundlePath)).planning).toMatchObject({ type: "blocked", reason: "drift" })
    expect((await fixture.plan(null)).planning).toMatchObject({ type: "blocked", reason: "drift" })
    expect(await readFile(fixture.projectConfig, "utf8")).toBe(edited)
    await assertSame(fixture.userConfig, userBefore, "Ordinary user config after drift checks")
  })
})
