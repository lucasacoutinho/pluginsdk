import { access, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { Match, Schema } from "effect"
import { expect, it } from "vitest"
import { ApplyOutcome, ReviewedPlan, type Planning, type ReadyPlan } from "../../contracts/Installer.ts"
import { parseJson } from "../../src/internal/json.ts"
import { StoredState } from "../../src/installer/lifecycle/records.ts"
import { targetPaths } from "../../src/installer/target/resolve.ts"
import { withProjectFixture, type ProjectFixture, type RunningProcess } from "./project-fixture.ts"

const checkpointModule = fileURLToPath(new URL("./project-checkpoint.mjs", import.meta.url))

const requireReady = (planning: Planning | null): ReadyPlan => {
  if (planning === null) throw new Error("Expected a ready project plan, received no planning output")
  return Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
    ready: (plan) => plan,
    repair_ready: () => { throw new Error("Unexpected repair plan") },
    unchanged: () => { throw new Error("Unexpected unchanged project state") },
    blocked: ({ reason }) => { throw new Error(`Unexpected blocked project state: ${reason}`) },
    pending: () => { throw new Error("Unexpected pending project state") }
  }))
}

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 30_000
  while (true) {
    try { await access(path); return }
    catch (cause) {
      if (typeof cause !== "object" || cause === null || !("code" in cause) || cause.code !== "ENOENT") throw cause
    }
    if (Date.now() >= deadline) throw new Error("Project worker did not reach its checkpoint")
    await setTimeout(10)
  }
}

const pendingGroup = async (fixture: ProjectFixture, plan: ReadyPlan): Promise<number> => {
  const state = Schema.decodeUnknownSync(StoredState)(parseJson(await readFile(targetPaths(plan.target).state, "utf8")))
  if (state.type !== "pending" || state.execution.type !== "running") throw new Error("Expected a retained running project worker")
  fixture.trackGroup(state.execution.group)
  return state.execution.group
}

const stopGroup = (group: number): void => {
  try { process.kill(-group, "SIGKILL") }
  catch (cause) {
    if (typeof cause !== "object" || cause === null || !("code" in cause) || cause.code !== "ESRCH") throw cause
  }
}

const openPaths = async (pid: number): Promise<ReadonlyArray<string>> => {
  const directory = `/proc/${pid}/fd`
  return Promise.all((await readdir(directory)).map(async (fd) => {
    try { return await readlink(join(directory, fd)) }
    catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return ""
      throw cause
    }
  }))
}

const waitForOpenLock = async (running: RunningProcess, path: string): Promise<void> => {
  const pid = running.child.pid
  if (pid === undefined) throw new Error("Contending SDK process did not start")
  const deadline = Date.now() + 10_000
  while (!(await openPaths(pid)).includes(path)) {
    if (Date.now() >= deadline) throw new Error("Contending SDK process did not reach its writer lock")
    await setTimeout(10)
  }
}

const instrumentation = (fixture: ProjectFixture) => ({
  NODE_OPTIONS: `--import=${checkpointModule}`,
  PSDK_PROJECT_ROOT: fixture.projectA,
  PSDK_PROJECT_CHECKPOINT_FILE: join(fixture.root, "checkpoint"),
  PSDK_PROJECT_RELEASE_FILE: join(fixture.root, "release"),
  PSDK_PROJECT_WORKER_LOG: join(fixture.root, "workers.log")
})

const operations: ReadonlyArray<"install" | "replace" | "remove"> = ["install", "replace", "remove"]
const scenarios = operations.flatMap((operation) =>
  ["before_activation", "after_activation"].map((timing) => ({ operation, timing })))
for (const { operation, timing } of scenarios) {
  it(`settles ${operation} after caller and worker termination ${timing} without repeating execution`, async () => {
    await withProjectFixture(async (fixture) => {
      const previous = operation === "install" ? null : await fixture.bundle("previous revision")
      if (previous !== null) {
        const initial = await fixture.plan(previous.bundlePath)
        requireReady(initial.planning)
        expect((await fixture.apply(initial.path)).outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
      }
      const built = await fixture.bundle(`${operation} ${timing}`)
      const desired = Match.value(operation).pipe(
        Match.when("install", () => built),
        Match.when("replace", () => built),
        Match.when("remove", () => null),
        Match.exhaustive
      )
      const saved = await fixture.plan(desired?.bundlePath ?? null)
      const plan = requireReady(saved.planning)
      const userBefore = await readFile(fixture.userConfig)
      const configBefore = await readFile(fixture.projectConfig)
      const env = instrumentation(fixture)
      const running = fixture.launch(["apply", saved.path, "--json"], { ...env, PSDK_PROJECT_CHECKPOINT: timing })
      let group: number | undefined
      try {
        await waitForFile(env.PSDK_PROJECT_CHECKPOINT_FILE)
        group = await pendingGroup(fixture, plan)
        running.child.kill("SIGKILL")
        await running.done
        stopGroup(group)
        const retried = await fixture.launch(["apply", saved.path, "--json"], env).done
        expect(retried.code, retried.stderr).toBe(timing === "before_activation" ? 1 : 0)
        const outcome = Schema.decodeUnknownSync(ApplyOutcome)(parseJson(retried.stdout))
        expect(outcome).toMatchObject({ type: "completed", result: { type: timing === "before_activation" ? "not_applied" : desired === null ? "removed" : "installed" } })
        const replayed = await fixture.launch(["apply", saved.path, "--json"], env).done
        expect(replayed.code, replayed.stderr).toBe(timing === "before_activation" ? 1 : 0)
        expect(parseJson(replayed.stdout)).toEqual(parseJson(retried.stdout))
        expect((await readFile(env.PSDK_PROJECT_WORKER_LOG, "utf8")).trim().split("\n")).toHaveLength(1)
        expect(await readFile(fixture.userConfig)).toEqual(userBefore)
        if (timing === "before_activation") expect(await readFile(fixture.projectConfig)).toEqual(configBefore)
        const active = (await fixture.discover()).filter((skill) => skill.pluginId?.startsWith(`${fixture.pluginId}@`))
        const expected = timing === "before_activation" ? previous : desired
        expect(active).toHaveLength(expected === null ? 0 : 1)
        if (expected !== null) {
          const row = active[0]
          if (row === undefined) throw new Error("Fresh Codex session omitted the active plugin")
          const skill = expected.bundle.files.find((file) => file.path.endsWith("/SKILL.md"))
          if (skill === undefined) throw new Error("Expected package omitted its skill")
          expect(await readFile(row.path)).toEqual(Buffer.from(skill.content))
        }
      } finally {
        await writeFile(env.PSDK_PROJECT_RELEASE_FILE, "release")
        running.child.kill("SIGKILL")
        await running.done
        if (group !== undefined) stopGroup(group)
      }
    })
  })
}

it("retains both home and project locks in the worker after its caller dies", async () => {
  await withProjectFixture(async (fixture) => {
    const built = await fixture.bundle("leased activation")
    const saved = await fixture.plan(built.bundlePath)
    const plan = requireReady(saved.planning)
    const env = instrumentation(fixture)
    const otherHome = join(fixture.root, "other-codex-home")
    await mkdir(otherHome)
    await writeFile(join(otherHome, "config.toml"), `[projects.${JSON.stringify(fixture.projectA)}]\ntrust_level = "trusted"\n`)
    const otherConfigBefore = await readFile(join(otherHome, "config.toml"))
    const running = fixture.launch(["apply", saved.path, "--json"], { ...env, PSDK_PROJECT_CHECKPOINT: "before_activation" })
    const contenders: RunningProcess[] = []
    let group: number | undefined
    try {
      await waitForFile(env.PSDK_PROJECT_CHECKPOINT_FILE)
      group = await pendingGroup(fixture, plan)
      running.child.kill("SIGKILL")
      await running.done
      const homeLock = join(fixture.home, ".pluginsdk", "writer.lock")
      const projectLock = join(fixture.projectA, ".pluginsdk", "installer", "writer.lock")
      const inherited = await openPaths(group)
      expect(inherited).toContain(homeLock)
      expect(inherited).toContain(projectLock)
      const projectWriter = fixture.launch(["plan", built.bundlePath, "--host", "codex", "--home", otherHome, "--project", fixture.projectA, "--out", join(fixture.root, "other-home.plan.json"), "--json"])
      const homeWriter = fixture.launch(["plan", built.bundlePath, "--host", "codex", "--home", fixture.home, "--project", fixture.projectB, "--out", join(fixture.root, "other-project.plan.json"), "--json"])
      contenders.push(projectWriter, homeWriter)
      let projectFinished = false
      let homeFinished = false
      void projectWriter.done.then(() => { projectFinished = true })
      void homeWriter.done.then(() => { homeFinished = true })
      await Promise.all([waitForOpenLock(projectWriter, projectLock), waitForOpenLock(homeWriter, homeLock)])
      await setTimeout(500)
      expect(projectFinished).toBe(false)
      expect(homeFinished).toBe(false)
      expect(await readFile(join(otherHome, "config.toml"))).toEqual(otherConfigBefore)
      await writeFile(env.PSDK_PROJECT_RELEASE_FILE, "release")
      const [projectResult, homeResult] = await Promise.all([projectWriter.done, homeWriter.done])
      expect(parseJson(projectResult.stdout)).toMatchObject({ type: "blocked", reason: "unowned" })
      expect(homeResult.code, homeResult.stderr).toBe(0)
      expect(parseJson(homeResult.stdout)).toMatchObject({ type: "ready" })
      const resumed = await fixture.apply(saved.path)
      expect(resumed.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
      expect((await fixture.discover(fixture.projectB)).filter((skill) => skill.pluginId?.startsWith(`${fixture.pluginId}@`))).toEqual([])
      expect((await readFile(env.PSDK_PROJECT_WORKER_LOG, "utf8")).trim().split("\n")).toHaveLength(1)
    } finally {
      await writeFile(env.PSDK_PROJECT_RELEASE_FILE, "release")
      running.child.kill("SIGKILL")
      await running.done
      for (const contender of contenders) { contender.child.kill("SIGKILL"); await contender.done }
      if (group !== undefined) stopGroup(group)
    }
  })
})

it("rejects the second concurrent review instead of overwriting another plugin's project block", async () => {
  await withProjectFixture(async (fixture) => {
    const first = await fixture.bundle("first writer", "project-writer-one")
    const second = await fixture.bundle("second writer", "project-writer-two")
    const a = await fixture.plan(first.bundlePath)
    const b = await fixture.plan(second.bundlePath)
    requireReady(a.planning)
    requireReady(b.planning)
    const results = await Promise.all([fixture.applyResult(a.path), fixture.applyResult(b.path)])
    expect(results.filter((result) => result.code === 0)).toHaveLength(1)
    expect(results.filter((result) => result.stderr.includes("stale_plan"))).toHaveLength(1)
    const planning = results[0]?.code === 0 ? await fixture.plan(second.bundlePath) : await fixture.plan(first.bundlePath)
    requireReady(planning.planning)
    expect((await fixture.apply(planning.path)).outcome).toMatchObject({ type: "completed", result: { type: "installed" } })
    const active = (await fixture.discover()).filter((skill) => skill.pluginId?.startsWith("project-writer-"))
    expect(active).toHaveLength(2)
    expect((await readFile(fixture.projectConfig, "utf8")).match(/# pluginsdk:[a-f0-9]{64}:begin/g)).toHaveLength(2)
  })
})

it("repairs an interrupted inactive project operation without another activation", async () => {
  await withProjectFixture(async (fixture) => {
    const built = await fixture.bundle("inactive operation")
    const saved = await fixture.plan(built.bundlePath)
    const plan = requireReady(saved.planning)
    const userBefore = await readFile(fixture.userConfig)
    const configBefore = await readFile(fixture.projectConfig)
    const env = instrumentation(fixture)
    const running = fixture.launch(["apply", saved.path, "--json"], { ...env, PSDK_PROJECT_CHECKPOINT: "before_activation" })
    let group: number | undefined
    try {
      await waitForFile(env.PSDK_PROJECT_CHECKPOINT_FILE)
      group = await pendingGroup(fixture, plan)
      running.child.kill("SIGKILL")
      await running.done
      stopGroup(group)
      const repairPath = join(fixture.root, "repair.plan.json")
      const reviewed = await fixture.launch(["repair", saved.path, "--out", repairPath, "--json"]).done
      expect(reviewed.code, reviewed.stderr).toBe(0)
      const repair = Schema.decodeUnknownSync(ReviewedPlan)(parseJson(reviewed.stdout))
      expect(repair).toMatchObject({ type: "repair_ready", before: { observed: { residual: "absent" } } })
      const applied = await fixture.launch(["apply", repairPath, "--json"], env).done
      expect(applied.code, applied.stderr).toBe(0)
      expect(parseJson(applied.stdout)).toEqual({ type: "completed", result: { type: "removed" } })
      const replayed = await fixture.launch(["apply", repairPath, "--json"], env).done
      expect(replayed.code, replayed.stderr).toBe(0)
      expect(parseJson(replayed.stdout)).toEqual(parseJson(applied.stdout))
      expect((await readFile(env.PSDK_PROJECT_WORKER_LOG, "utf8")).trim().split("\n")).toHaveLength(1)
      expect(await readFile(fixture.projectConfig)).toEqual(configBefore)
      expect(await readFile(fixture.userConfig)).toEqual(userBefore)
      expect((await fixture.discover()).filter((skill) => skill.pluginId?.startsWith(`${fixture.pluginId}@`))).toEqual([])
    } finally {
      await writeFile(env.PSDK_PROJECT_RELEASE_FILE, "release")
      running.child.kill("SIGKILL")
      await running.done
      if (group !== undefined) stopGroup(group)
    }
  })
})
