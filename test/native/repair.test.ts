import { expect, it } from "vitest"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Match, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import { ApplyOutcome, Planning, type ApplyOutcome as ApplyOutcomeValue, type Planning as PlanningValue, type ReadyPlan, type RepairPlan as RepairPlanValue, type Target } from "../../contracts/Installer.ts"
import { targetPaths } from "../../src/installer/target/resolve.ts"
import {
  catalogPath,
  executionGroupAt,
  killProcess,
  makeRepairFixture,
  pausedApply,
  prepareInterruptedReplacement,
  processGroupAlive,
  requireReady,
  stopGroup,
  waitForProcessExit,
  waitForCheckpoint,
  type QualifiedHost,
  type RepairFixture,
  type RunningProcess
} from "./repair-fixture.ts"

type MutationCommands = {
  readonly marketplaceAdd: ReadonlyArray<string>
  readonly pluginInstall: ReadonlyArray<string>
  readonly pluginRemove: ReadonlyArray<string>
  readonly marketplaceRemove: ReadonlyArray<string>
}

const hosts: ReadonlyArray<QualifiedHost> = ["claude_code", "codex"]

const jsonValue = (text: string): unknown => {
  const value: unknown = JSON.parse(text)
  return value
}

const requireRepair = (planning: PlanningValue): RepairPlanValue => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: () => { throw new Error("Expected a repair plan") },
    repair_ready: (plan) => plan,
    unchanged: () => { throw new Error("Expected a repair plan, received unchanged") },
    blocked: ({ reason }) => { throw new Error(`Expected a repair plan, received blocked: ${reason}`) },
    pending: () => { throw new Error("Expected a repair plan, received pending") }
  })
)

const requireBlocked = (planning: PlanningValue): Extract<PlanningValue, { type: "blocked" }> => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: () => { throw new Error("Expected a blocked repair plan") },
    repair_ready: () => { throw new Error("Expected a blocked repair plan") },
    unchanged: () => { throw new Error("Expected a blocked repair plan") },
    blocked: (value) => value,
    pending: () => { throw new Error("Expected a blocked repair plan") }
  })
)

const commandsFor = (host: QualifiedHost, plan: ReadyPlan): MutationCommands => {
  const paths = targetPaths(plan.target)
  const selector = `${plan.target.plugin}@${paths.marketName}`
  const scope = plan.target.destination.type
  return Match.value(host).pipe(
    Match.when("claude_code", () => ({
      marketplaceAdd: ["plugin", "marketplace", "add", paths.market, "--scope", scope, "--json"],
      pluginInstall: ["plugin", "install", selector, "--scope", scope, "--json"],
      pluginRemove: ["plugin", "uninstall", selector, "--scope", scope, "--keep-data", "--json"],
      marketplaceRemove: ["plugin", "marketplace", "remove", paths.marketName, "--scope", scope, "--json"]
    })),
    Match.when("codex", () => ({
      marketplaceAdd: ["plugin", "marketplace", "add", paths.market, "--json"],
      pluginInstall: ["plugin", "add", selector, "--json"],
      pluginRemove: ["plugin", "remove", selector, "--json"],
      marketplaceRemove: ["plugin", "marketplace", "remove", paths.marketName, "--json"]
    })),
    Match.exhaustive
  )
}

const encodedCommands = (...commands: ReadonlyArray<ReadonlyArray<string>>): string[] =>
  commands.map((command) => JSON.stringify(command))

const assertSentinel = async (fixture: RepairFixture): Promise<void> => {
  const text = await readFile(fixture.settings, "utf8")
  Match.value(fixture.host).pipe(
    Match.when("claude_code", () => {
      const value = jsonValue(text)
      const settings = Schema.decodeUnknownSync(Schema.JsonObject)(value)
      expect(settings["theme"]).toBe("dark")
    }),
    Match.when("codex", () => {
      const settings = parseToml(text)
      expect(settings.model).toBe("gpt-5.1-codex")
    }),
    Match.exhaustive
  )
}

const assertRemoved = (outcome: ApplyOutcomeValue): void => {
  expect(outcome).toMatchObject({ type: "completed", result: { type: "removed" } })
}

const cleanup = async (
  fixture: RepairFixture,
  running: RunningProcess | undefined,
  group: number | undefined,
  target: Target | undefined
): Promise<void> => {
  let processGroup = group
  if (processGroup === undefined && target !== undefined) {
    try { processGroup = await executionGroupAt(target) }
    catch { processGroup = undefined }
  }
  if (processGroup !== undefined) stopGroup(processGroup)
  await writeFile(fixture.env.SDK_RELEASE_FILE, "release")
  if (running !== undefined) {
    running.child.kill("SIGKILL")
    await running.done
  }
  await fixture.clean()
}

for (const host of hosts) {
  it(`${host}: repairs an orphaned marketplace once, then installs and removes the retained bundle`, async () => {
    const fixture = await makeRepairFixture(host)
    let running: RunningProcess | undefined
    let group: number | undefined
    let target: Target | undefined
    try {
      const interrupted = await prepareInterruptedReplacement(fixture)
      target = interrupted.original.target
      running = await pausedApply(fixture, interrupted.originalPath)
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(interrupted.original.target)
      stopGroup(group)
      const stopped = await running.done
      running = undefined
      expect(stopped.stdout).not.toBe("")
      const interruptedOutcome = Schema.decodeUnknownSync(ApplyOutcome)(jsonValue(stopped.stdout))
      expect(interruptedOutcome).toMatchObject({ type: "uncertain" })

      const commands = commandsFor(host, interrupted.original)
      const orphanLog = encodedCommands(commands.marketplaceAdd, commands.pluginInstall, commands.pluginRemove)
      expect(await fixture.log()).toEqual(orphanLog)
      const retry = await fixture.apply(interrupted.originalPath)
      expect(retry.outcome).toMatchObject({ type: "uncertain" })
      expect(await fixture.log()).toEqual(orphanLog)

      const reviewed = await fixture.repair(interrupted.originalPath, join(fixture.root, "cleanup-plan.json"))
      expect(reviewed.result.code).toBe(0)
      const cleanupPlan = requireRepair(reviewed.planning)
      expect(cleanupPlan.before).toMatchObject({
        interrupted: interrupted.original.id,
        pending: interrupted.original.id,
        observed: { residual: "marketplace" }
      })
      const removed = await fixture.apply(reviewed.path)
      assertRemoved(removed.outcome)
      const afterCleanup = [...orphanLog, JSON.stringify(commands.marketplaceRemove)]
      expect(await fixture.log()).toEqual(afterCleanup)
      const replay = await fixture.apply(reviewed.path)
      expect(replay.outcome).toEqual(removed.outcome)
      expect(await fixture.log()).toEqual(afterCleanup)

      const desiredInstall = await fixture.planBundle(fixture.desiredBundle, join(fixture.root, "desired-install.json"))
      expect(desiredInstall.result.code).toBe(0)
      const desiredPlan = requireReady(desiredInstall.planning)
      expect(desiredPlan.change.type).toBe("install")
      expect(desiredPlan.before.revision).toBe(cleanupPlan.id)
      expect(desiredPlan.id).not.toBe(interrupted.original.id)
      const installed = await fixture.apply(desiredInstall.path)
      expect(installed.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
      const observed = await fixture.planBundle(fixture.desiredBundle, join(fixture.root, "desired-observed.json"))
      expect(observed.planning.type).toBe("unchanged")
      const removal = await fixture.remove("repair-fixture", join(fixture.root, "final-removal.json"))
      expect(removal.result.code).toBe(0)
      expect(requireReady(removal.planning).change.type).toBe("remove")
      const finalRemoval = await fixture.apply(removal.path)
      assertRemoved(finalRemoval.outcome)
      expect(await fixture.log()).toEqual(encodedCommands(
        commands.marketplaceAdd,
        commands.pluginInstall,
        commands.pluginRemove,
        commands.marketplaceRemove,
        commands.marketplaceAdd,
        commands.pluginInstall,
        commands.pluginRemove,
        commands.marketplaceRemove
      ))
      await assertSentinel(fixture)
    } finally {
      await cleanup(fixture, running, group, target)
    }
  }, 240_000)

  it(`${host}: repairs an interrupted ordinary removal from its saved plan`, async () => {
    const fixture = await makeRepairFixture(host)
    let running: RunningProcess | undefined
    let group: number | undefined
    let target: Target | undefined
    try {
      const initial = await fixture.planBundle(fixture.initialBundle, join(fixture.root, "initial-plan.json"))
      expect(initial.result.code).toBe(0)
      const initialPlan = requireReady(initial.planning)
      const installed = await fixture.apply(initial.path)
      expect(installed.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })

      const removal = await fixture.remove("repair-fixture", join(fixture.root, "removal-plan.json"))
      expect(removal.result.code).toBe(0)
      const removalPlan = requireReady(removal.planning)
      expect(removalPlan.change.type).toBe("remove")
      expect(removalPlan.id).not.toBe(initialPlan.id)
      target = removalPlan.target

      running = await pausedApply(fixture, removal.path)
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(removalPlan.target)
      stopGroup(group)
      const stopped = await running.done
      running = undefined
      expect(Schema.decodeUnknownSync(ApplyOutcome)(jsonValue(stopped.stdout))).toMatchObject({ type: "uncertain" })

      const commands = commandsFor(host, removalPlan)
      const interruptedLog = encodedCommands(commands.marketplaceAdd, commands.pluginInstall, commands.pluginRemove)
      expect(await fixture.log()).toEqual(interruptedLog)

      const reviewed = await fixture.repair(removal.path, join(fixture.root, "removal-cleanup.json"))
      expect(reviewed.result.code).toBe(0)
      const cleanupPlan = requireRepair(reviewed.planning)
      expect(cleanupPlan.before).toMatchObject({
        interrupted: removalPlan.id,
        pending: removalPlan.id,
        observed: { residual: "marketplace" }
      })
      const completed = await fixture.apply(reviewed.path)
      assertRemoved(completed.outcome)
      const cleanedLog = [...interruptedLog, JSON.stringify(commands.marketplaceRemove)]
      expect(await fixture.log()).toEqual(cleanedLog)
      const replay = await fixture.apply(reviewed.path)
      expect(replay.outcome).toEqual(completed.outcome)
      expect(await fixture.log()).toEqual(cleanedLog)
      await assertSentinel(fixture)
    } finally {
      await cleanup(fixture, running, group, target)
    }
  }, 240_000)

  it(`${host}: rejects a stale catalog plan and completes a fresh absence repair without mutation`, async () => {
    const fixture = await makeRepairFixture(host)
    let running: RunningProcess | undefined
    let group: number | undefined
    let target: Target | undefined
    try {
      const interrupted = await prepareInterruptedReplacement(fixture)
      target = interrupted.original.target
      running = await pausedApply(fixture, interrupted.originalPath)
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(interrupted.original.target)
      stopGroup(group)
      const stopped = await running.done
      running = undefined
      expect(Schema.decodeUnknownSync(ApplyOutcome)(jsonValue(stopped.stdout))).toMatchObject({ type: "uncertain" })

      const commands = commandsFor(host, interrupted.original)
      const orphanLog = encodedCommands(commands.marketplaceAdd, commands.pluginInstall, commands.pluginRemove)
      const reviewed = await fixture.repair(interrupted.originalPath, join(fixture.root, "stale-cleanup.json"))
      const cleanupPlan = requireRepair(reviewed.planning)
      expect(cleanupPlan.before.observed.residual).toBe("marketplace")
      const catalog = catalogPath(host, targetPaths(cleanupPlan.target).market)
      const originalCatalog = await readFile(catalog, "utf8")
      const originalValue = jsonValue(originalCatalog)
      const catalogValue = Schema.decodeUnknownSync(Schema.JsonObject)(originalValue)
      await writeFile(catalog, JSON.stringify({ ...catalogValue, reviewer_note: "changed after review" }))

      const stale = await fixture.launch(["apply", reviewed.path, "--json"], fixture.env).done
      expect(stale.code).not.toBe(0)
      expect(stale.stdout).toBe("")
      expect(stale.stderr).toContain("Plan rejected: stale_plan")
      expect(await fixture.log()).toEqual(orphanLog)

      await writeFile(catalog, originalCatalog)
      await fixture.externalHost(commands.marketplaceRemove)
      expect(await fixture.log()).toEqual(orphanLog)
      const absence = await fixture.repair(interrupted.originalPath, join(fixture.root, "absence-cleanup.json"))
      expect(absence.result.code, JSON.stringify({ planning: absence.planning, stderr: absence.result.stderr })).toBe(0)
      const absencePlan = requireRepair(absence.planning)
      expect(absencePlan.before).toMatchObject({
        interrupted: interrupted.original.id,
        pending: interrupted.original.id,
        observed: { residual: "absent" }
      })
      const completed = await fixture.apply(absence.path)
      assertRemoved(completed.outcome)
      expect(await fixture.log()).toEqual(orphanLog)
      const replay = await fixture.apply(absence.path)
      expect(replay.outcome).toEqual(completed.outcome)
      expect(await fixture.log()).toEqual(orphanLog)
      await assertSentinel(fixture)
    } finally {
      await cleanup(fixture, running, group, target)
    }
  }, 240_000)

  it(`${host}: blocks repair as unknown while an orphaned native descendant remains alive`, async () => {
    const fixture = await makeRepairFixture(host)
    let running: RunningProcess | undefined
    let group: number | undefined
    let target: Target | undefined
    try {
      const interrupted = await prepareInterruptedReplacement(fixture)
      target = interrupted.original.target
      running = await pausedApply(fixture, interrupted.originalPath)
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(interrupted.original.target)

      running.child.kill("SIGKILL")
      const caller = await running.done
      expect(caller.signal).toBe("SIGKILL")
      killProcess(group)
      await waitForProcessExit(group)
      running = undefined
      expect(processGroupAlive(group)).toBe(true)

      const command = fixture.launch(
        ["repair", interrupted.originalPath, "--out", join(fixture.root, "blocked-cleanup.json"), "--json"],
        fixture.env,
        false,
        10_000
      )
      const blockedRun = await command.done
      expect(blockedRun.signal).toBeNull()
      const blocked = Schema.decodeUnknownSync(Planning)(jsonValue(blockedRun.stdout))
      const decision = requireBlocked(blocked)
      expect(decision.reason).toBe("unknown")
      const commands = commandsFor(host, interrupted.original)
      expect(await fixture.log()).toEqual(encodedCommands(commands.marketplaceAdd, commands.pluginInstall, commands.pluginRemove))
    } finally {
      await cleanup(fixture, running, group, target)
    }
  }, 120_000)

  it(`${host}: never replays a cleanup interrupted after its execution token`, async () => {
    const fixture = await makeRepairFixture(host)
    let running: RunningProcess | undefined
    let group: number | undefined
    let target: Target | undefined
    try {
      const interrupted = await prepareInterruptedReplacement(fixture)
      target = interrupted.original.target
      const originalRun = await pausedApply(fixture, interrupted.originalPath)
      running = originalRun
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(interrupted.original.target)
      stopGroup(group)
      const originalResult = await originalRun.done
      running = undefined
      expect(Schema.decodeUnknownSync(ApplyOutcome)(jsonValue(originalResult.stdout))).toMatchObject({ type: "uncertain" })

      const cleanupRun = await fixture.repair(interrupted.originalPath, join(fixture.root, "cleanup-plan.json"))
      const cleanupPlan = requireRepair(cleanupRun.planning)
      expect(cleanupPlan.before.observed.residual).toBe("marketplace")
      const originalLog = await fixture.log()
      await fixture.resetCheckpoint()
      const apply = fixture.launch(
        ["apply", cleanupRun.path, "--json"],
        { ...fixture.env, SDK_IO_CHECKPOINT: "after_token" },
        true
      )
      running = apply
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(cleanupPlan.target)
      running.child.kill("SIGKILL")
      const killed = await running.done
      running = undefined
      expect(killed.signal).toBe("SIGKILL")
      stopGroup(group)

      const retry = await fixture.apply(cleanupRun.path)
      expect(retry.outcome).toMatchObject({ type: "uncertain" })
      expect(await fixture.log()).toEqual(originalLog)
      const fresh = await fixture.repair(cleanupRun.path, join(fixture.root, "fresh-cleanup.json"))
      const freshPlan = requireRepair(fresh.planning)
      expect(freshPlan.before).toMatchObject({
        interrupted: interrupted.original.id,
        pending: cleanupPlan.id,
        observed: { residual: "marketplace" }
      })
      expect(freshPlan.id).not.toBe(cleanupPlan.id)
      expect(freshPlan.id).not.toBe(interrupted.original.id)
      assertRemoved((await fixture.apply(fresh.path)).outcome)
      const commands = commandsFor(host, interrupted.original)
      expect(await fixture.log()).toEqual([...originalLog, JSON.stringify(commands.marketplaceRemove)])
      const replay = await fixture.apply(fresh.path)
      expect(replay.outcome).toMatchObject({ type: "completed", result: { type: "removed" } })
      expect(await fixture.log()).toEqual([...originalLog, JSON.stringify(commands.marketplaceRemove)])
    } finally {
      await cleanup(fixture, running, group, target)
    }
  }, 240_000)

  it(`${host}: settles cleanup interrupted after native marketplace removal without another mutation`, async () => {
    const fixture = await makeRepairFixture(host)
    let running: RunningProcess | undefined
    let group: number | undefined
    let target: Target | undefined
    try {
      const interrupted = await prepareInterruptedReplacement(fixture)
      target = interrupted.original.target
      const originalRun = await pausedApply(fixture, interrupted.originalPath)
      running = originalRun
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(interrupted.original.target)
      stopGroup(group)
      const originalResult = await originalRun.done
      running = undefined
      expect(Schema.decodeUnknownSync(ApplyOutcome)(jsonValue(originalResult.stdout))).toMatchObject({ type: "uncertain" })

      const cleanupRun = await fixture.repair(interrupted.originalPath, join(fixture.root, "cleanup-plan.json"))
      const cleanupPlan = requireRepair(cleanupRun.planning)
      const beforeCleanupLog = await fixture.log()
      await fixture.resetCheckpoint()
      const apply = fixture.launch(
        ["apply", cleanupRun.path, "--json"],
        { ...fixture.env, SDK_IO_CHECKPOINT: "before_complete" },
        true
      )
      running = apply
      await waitForCheckpoint(fixture)
      group = await executionGroupAt(cleanupPlan.target)
      expect(await fixture.log()).toEqual([...beforeCleanupLog, JSON.stringify(commandsFor(host, interrupted.original).marketplaceRemove)])
      running.child.kill("SIGKILL")
      const killed = await running.done
      running = undefined
      expect(killed.signal).toBe("SIGKILL")
      stopGroup(group)

      const recovered = await fixture.apply(cleanupRun.path)
      assertRemoved(recovered.outcome)
      expect(await fixture.log()).toEqual([...beforeCleanupLog, JSON.stringify(commandsFor(host, interrupted.original).marketplaceRemove)])
      const replay = await fixture.apply(cleanupRun.path)
      expect(replay.outcome).toEqual(recovered.outcome)
      expect(await fixture.log()).toEqual([...beforeCleanupLog, JSON.stringify(commandsFor(host, interrupted.original).marketplaceRemove)])
    } finally {
      await cleanup(fixture, running, group, target)
    }
  }, 240_000)
}

it("claude_code: repairs an interrupted project replacement at project scope", async () => {
  const fixture = await makeRepairFixture("claude_code")
  let running: RunningProcess | undefined
  let group: number | undefined
  let target: Target | undefined
  try {
    const project = join(fixture.root, "project")
    await mkdir(join(project, ".claude"), { recursive: true })
    const projectSettings = join(project, ".claude", "settings.json")
    await writeFile(projectSettings, JSON.stringify({ theme: "light" }))

    const planProject = async (args: ReadonlyArray<string>, name: string) => {
      const path = join(fixture.root, name)
      const result = await fixture.launch([
        ...args,
        "--host", "claude_code",
        "--home", fixture.home,
        "--project", project,
        "--out", path,
        "--json"
      ], fixture.env).done
      expect(result.code).toBe(0)
      return {
        path,
        planning: Schema.decodeUnknownSync(Planning)(jsonValue(result.stdout), { onExcessProperty: "error" })
      }
    }

    const initial = await planProject(["plan", fixture.initialBundle], "project-initial-plan.json")
    const initialPlan = requireReady(initial.planning)
    expect(initialPlan.change.type).toBe("install")
    expect(initialPlan.target.destination).toMatchObject({ type: "project", root: project })
    const installed = await fixture.apply(initial.path)
    expect(installed.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })

    const replacement = await planProject(["plan", fixture.desiredBundle], "project-replacement-plan.json")
    const replacementPlan = requireReady(replacement.planning)
    expect(replacementPlan.change.type).toBe("replace")
    expect(replacementPlan.target.destination).toMatchObject({ type: "project", root: project })
    target = replacementPlan.target

    running = await pausedApply(fixture, replacement.path)
    await waitForCheckpoint(fixture)
    group = await executionGroupAt(replacementPlan.target)
    stopGroup(group)
    const stopped = await running.done
    running = undefined
    expect(Schema.decodeUnknownSync(ApplyOutcome)(jsonValue(stopped.stdout))).toMatchObject({ type: "uncertain" })

    const commands = commandsFor("claude_code", replacementPlan)
    const orphanLog = encodedCommands(commands.marketplaceAdd, commands.pluginInstall, commands.pluginRemove)
    expect(await fixture.log()).toEqual(orphanLog)

    const reviewed = await fixture.repair(replacement.path, join(fixture.root, "project-cleanup-plan.json"))
    expect(reviewed.result.code).toBe(0)
    const cleanupPlan = requireRepair(reviewed.planning)
    expect(cleanupPlan.target.destination).toMatchObject({ type: "project", root: project })
    expect(cleanupPlan.before.observed.residual).toBe("marketplace")
    const completed = await fixture.apply(reviewed.path)
    assertRemoved(completed.outcome)
    const cleanedLog = [...orphanLog, JSON.stringify(commands.marketplaceRemove)]
    expect(await fixture.log()).toEqual(cleanedLog)
    const replay = await fixture.apply(reviewed.path)
    expect(replay.outcome).toEqual(completed.outcome)
    expect(await fixture.log()).toEqual(cleanedLog)

    const desired = await planProject(["plan", fixture.desiredBundle], "project-desired-plan.json")
    const desiredPlan = requireReady(desired.planning)
    expect(desiredPlan.change.type).toBe("install")
    expect(desiredPlan.before.revision).toBe(cleanupPlan.id)
    expect(desiredPlan.target.destination).toMatchObject({ type: "project", root: project })
    const desiredInstalled = await fixture.apply(desired.path)
    expect(desiredInstalled.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })

    const removal = await planProject(["remove", "repair-fixture"], "project-removal-plan.json")
    const removalPlan = requireReady(removal.planning)
    expect(removalPlan.change.type).toBe("remove")
    const removed = await fixture.apply(removal.path)
    assertRemoved(removed.outcome)
    expect(await fixture.log()).toEqual(encodedCommands(
      commands.marketplaceAdd,
      commands.pluginInstall,
      commands.pluginRemove,
      commands.marketplaceRemove,
      commands.marketplaceAdd,
      commands.pluginInstall,
      commands.pluginRemove,
      commands.marketplaceRemove
    ))

    await assertSentinel(fixture)
    const projectSettingsValue = jsonValue(await readFile(projectSettings, "utf8"))
    const projectConfig = Schema.decodeUnknownSync(Schema.JsonObject)(projectSettingsValue)
    expect(projectConfig["theme"]).toBe("light")
  } finally {
    await cleanup(fixture, running, group, target)
  }
}, 240_000)
