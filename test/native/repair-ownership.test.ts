import { expect, it } from "vitest"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Match, Schema } from "effect"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"
import { ApplyOutcome, type Planning as PlanningValue } from "../../contracts/Installer.ts"
import { targetPaths } from "../../src/installer/target/resolve.ts"
import {
  executionGroupAt,
  makeRepairFixture,
  pausedApply,
  prepareInterruptedReplacement,
  stopGroup,
  waitForCheckpoint,
  type InterruptedReplacement,
  type QualifiedHost,
  type RepairFixture
} from "./repair-fixture.ts"

const hosts: ReadonlyArray<QualifiedHost> = ["claude_code", "codex"]

const expectUnowned = (planning: PlanningValue): void => {
  const reason = Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
    ready: () => { throw new Error("Expected blocked repair planning") },
    repair_ready: () => { throw new Error("Expected blocked repair planning") },
    unchanged: () => { throw new Error("Expected blocked repair planning") },
    blocked: ({ reason }) => reason,
    pending: () => { throw new Error("Expected blocked repair planning") }
  }))
  expect(reason).toBe("unowned")
}

const makeOrphanedReplacement = async (fixture: RepairFixture): Promise<InterruptedReplacement> => {
  const interrupted = await prepareInterruptedReplacement(fixture)
  const running = await pausedApply(fixture, interrupted.originalPath)
  let group: number | undefined
  try {
    await waitForCheckpoint(fixture)
    group = await executionGroupAt(interrupted.original.target)
    stopGroup(group)
    const stopped = await running.done
    const value: unknown = JSON.parse(stopped.stdout)
    expect(Schema.decodeUnknownSync(ApplyOutcome)(value)).toMatchObject({ type: "uncertain" })
    return interrupted
  } finally {
    if (group === undefined) {
      try { group = await executionGroupAt(interrupted.original.target) }
      catch { group = undefined }
    }
    if (group !== undefined) stopGroup(group)
    running.child.kill("SIGKILL")
    await running.done
  }
}

const reviewedOrphanRepair = async (fixture: RepairFixture) => {
  const interrupted = await makeOrphanedReplacement(fixture)
  const reviewed = await fixture.repair(interrupted.originalPath, join(fixture.root, "reviewed-cleanup.json"))
  expect(reviewed.result.code).toBe(0)
  expect(reviewed.planning.type).toBe("repair_ready")
  return { interrupted, reviewed }
}

const addConfiguredForeignConsumer = async (fixture: RepairFixture, selector: string): Promise<void> => Match.value(fixture.host).pipe(
  Match.when("claude_code", async () => {
    const value: unknown = JSON.parse(await readFile(fixture.settings, "utf8"))
    const config = Schema.decodeUnknownSync(Schema.JsonObject)(value)
    const configured = config["enabledPlugins"] === undefined
      ? {}
      : Schema.decodeUnknownSync(Schema.JsonObject)(config["enabledPlugins"])
    await writeFile(fixture.settings, JSON.stringify({
      ...config,
      enabledPlugins: { ...configured, [selector]: false }
    }))
  }),
  Match.when("codex", async () => {
    const value: unknown = parseToml(await readFile(fixture.settings, "utf8"))
    const config = Schema.decodeUnknownSync(Schema.JsonObject)(value)
    const configured = config["plugins"] === undefined
      ? {}
      : Schema.decodeUnknownSync(Schema.JsonObject)(config["plugins"])
    const existing = configured[selector] === undefined
      ? {}
      : Schema.decodeUnknownSync(Schema.JsonObject)(configured[selector])
    const next = {
      ...config,
      plugins: { ...configured, [selector]: { ...existing, enabled: false } }
    }
    await writeFile(fixture.settings, stringifyToml(next))
  }),
  Match.exhaustive
)

const expectConfiguredForeignConsumer = async (fixture: RepairFixture, selector: string): Promise<void> => Match.value(fixture.host).pipe(
  Match.when("claude_code", async () => {
    const value: unknown = JSON.parse(await readFile(fixture.settings, "utf8"))
    const config = Schema.decodeUnknownSync(Schema.JsonObject)(value)
    const configured = Schema.decodeUnknownSync(Schema.JsonObject)(config["enabledPlugins"])
    expect(config["theme"]).toBe("dark")
    expect(configured[selector]).toBe(false)
  }),
  Match.when("codex", async () => {
    const value: unknown = parseToml(await readFile(fixture.settings, "utf8"))
    const config = Schema.decodeUnknownSync(Schema.JsonObject)(value)
    const configured = Schema.decodeUnknownSync(Schema.JsonObject)(config["plugins"])
    const entry = Schema.decodeUnknownSync(Schema.JsonObject)(configured[selector])
    expect(config["model"]).toBe("gpt-5.1-codex")
    expect(entry["enabled"]).toBe(false)
  }),
  Match.exhaustive
)

const expectStaleWithoutMutation = async (
  fixture: RepairFixture,
  planPath: string,
  nativeLog: ReadonlyArray<string>
): Promise<void> => {
  const rejected = await fixture.launch(["apply", planPath, "--json"], fixture.env).done
  expect(rejected.code).not.toBe(0)
  expect(rejected.signal).toBeNull()
  expect(rejected.stdout).toBe("")
  expect(rejected.stderr).toContain("Plan rejected: stale_plan")
  expect(await fixture.log()).toEqual(nativeLog)
}

for (const host of hosts) {
  it(`${host}: foreign configured plugin consumers block repair and stale the reviewed cleanup`, async () => {
    const fixture = await makeRepairFixture(host)
    try {
      const { interrupted, reviewed } = await reviewedOrphanRepair(fixture)
      const selector = `foreign-fixture@${targetPaths(interrupted.original.target).marketName}`
      const nativeLog = await fixture.log()
      await addConfiguredForeignConsumer(fixture, selector)
      await expectConfiguredForeignConsumer(fixture, selector)

      const blocked = await fixture.repair(interrupted.originalPath, join(fixture.root, "blocked-cleanup.json"))
      expectUnowned(blocked.planning)
      expect(await fixture.log()).toEqual(nativeLog)

      await expectStaleWithoutMutation(fixture, reviewed.path, nativeLog)
    } finally {
      await fixture.clean()
    }
  }, 240_000)
}

it("claude_code: a project-scope consumer blocks repair of an orphaned user marketplace", async () => {
  const fixture = await makeRepairFixture("claude_code")
  try {
    const { interrupted, reviewed } = await reviewedOrphanRepair(fixture)
    const paths = targetPaths(interrupted.original.target)
    const selector = `${interrupted.original.target.plugin}@${paths.marketName}`
    const nativeLog = await fixture.log()
    const project = join(fixture.root, "project-consumer")
    await mkdir(project)

    await fixture.externalHost(["plugin", "install", selector, "--scope", "project", "--json"], project)
    expect(await fixture.log()).toEqual(nativeLog)
    const listing = await fixture.externalHost(["plugin", "list", "--json"], project)
    const value: unknown = JSON.parse(listing)
    const plugins = Schema.decodeUnknownSync(Schema.Array(Schema.JsonObject))(value)
    const installed = plugins.find((plugin) => plugin["id"] === selector)
    expect(installed).toBeDefined()
    expect(installed?.["scope"]).toBe("project")
    expect(installed?.["projectPath"]).toBe(project)

    const blocked = await fixture.repair(interrupted.originalPath, join(fixture.root, "blocked-project-cleanup.json"))
    expectUnowned(blocked.planning)
    expect(await fixture.log()).toEqual(nativeLog)
    await expectStaleWithoutMutation(fixture, reviewed.path, nativeLog)
  } finally {
    await fixture.clean()
  }
}, 240_000)
