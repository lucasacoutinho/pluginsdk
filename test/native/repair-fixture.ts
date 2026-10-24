import { execFileSync, spawn } from "node:child_process"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { Effect, Match, Schema } from "effect"
import { expect } from "vitest"
import { BuildRequest, Bundle, Compiler } from "../../contracts/Compiler.ts"
import { ApplyOutcome, Planning, type ApplyOutcome as ApplyOutcomeValue, type Host as HostValue, type Planning as PlanningValue, type ReadyPlan, type Target } from "../../contracts/Installer.ts"
import { StoredState, type Execution } from "../../src/installer/lifecycle/records.ts"
import { targetPaths } from "../../src/installer/target/resolve.ts"
import { PluginSdkLive } from "../../src/node.ts"

export type QualifiedHost = Extract<HostValue, "claude_code" | "codex">
export type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }
export type RunningProcess = ReturnType<typeof launch>
export type PlanningRun = { path: string; result: ProcessResult; planning: PlanningValue }
export type ApplyRun = { result: ProcessResult; outcome: ApplyOutcomeValue }
export type InterruptedReplacement = { readonly original: ReadyPlan; readonly originalPath: string }

type Environment = NodeJS.ProcessEnv & {
  PATH: string
  SDK_REAL_HOST: string
  SDK_NATIVE_LOG: string
  SDK_CHECKPOINT_FILE: string
  SDK_RELEASE_FILE: string
}

export type RepairFixture = {
  readonly root: string
  readonly host: QualifiedHost
  readonly home: string
  readonly settings: string
  readonly initialBundle: string
  readonly desiredBundle: string
  readonly env: Environment
  readonly planBundle: (bundle: string, output: string) => Promise<PlanningRun>
  readonly remove: (plugin: string, output: string) => Promise<PlanningRun>
  readonly repair: (reviewedPlan: string, output: string) => Promise<PlanningRun>
  readonly apply: (plan: string) => Promise<ApplyRun>
  readonly launch: (args: ReadonlyArray<string>, env: NodeJS.ProcessEnv, instrument?: boolean, timeoutMs?: number) => RunningProcess
  readonly resetCheckpoint: () => Promise<void>
  readonly externalHost: (args: ReadonlyArray<string>, cwd?: string) => Promise<string>
  readonly log: () => Promise<string[]>
  readonly clean: () => Promise<void>
}

const cli = fileURLToPath(new URL("../../src/cli.ts", import.meta.url))
const checkpointModule = fileURLToPath(new URL("./io-checkpoint.mjs", import.meta.url))
const wrapper = fileURLToPath(new URL("./host-wrapper.mjs", import.meta.url))

const run = <A, E>(effect: Effect.Effect<A, E, Compiler>) =>
  Effect.runPromise(effect.pipe(Effect.provide(PluginSdkLive)))

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"

const decodeStdout = (result: ProcessResult, operation: string): unknown => {
  if (result.stdout.trim() === "") {
    throw new Error(`${operation} returned no JSON (exit ${String(result.code)}, signal ${String(result.signal)}): ${result.stderr}`)
  }
  try {
    const value: unknown = JSON.parse(result.stdout)
    return value
  } catch (cause) {
    throw new Error(`${operation} returned invalid JSON (exit ${String(result.code)}, signal ${String(result.signal)}): ${result.stderr}`, { cause })
  }
}

export const requireReady = (planning: PlanningValue): ReadyPlan => Match.value(planning).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan) => plan,
    repair_ready: () => { throw new Error("Expected an ordinary ready plan") },
    unchanged: () => { throw new Error("Expected a ready plan, received unchanged") },
    blocked: ({ reason }) => { throw new Error(`Expected a ready plan, received blocked: ${reason}`) },
    pending: () => { throw new Error("Expected a ready plan, received pending") }
  })
)

const launch = (args: ReadonlyArray<string>, env: NodeJS.ProcessEnv, instrument = false, timeoutMs = 45_000) => {
  const child = spawn(process.execPath, [...(instrument ? ["--import", checkpointModule] : []), cli, ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
  const done = new Promise<ProcessResult>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => child.kill("SIGKILL"), timeoutMs)
    timer.unref()
    child.once("error", reject)
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr })
    })
  })
  return { child, done }
}

const processGroup = (execution: Execution): number => Match.value(execution).pipe(
  Match.discriminatorsExhaustive("type")({
    prepared: () => { throw new Error("Expected the native worker to retain its process group") },
    running: (value) => value.group,
    windows_running: () => { throw new Error("Linux repair acceptance cannot inspect a Windows job witness") }
  })
)

export const executionGroupAt = async (target: Target): Promise<number> => {
  const path = targetPaths(target).state
  const value: unknown = JSON.parse(await readFile(path, "utf8"))
  const state = Schema.decodeUnknownSync(StoredState)(value, { onExcessProperty: "error" })
  return Match.value(state).pipe(Match.discriminatorsExhaustive("type")({
    idle: () => { throw new Error("Expected a retained operation while waiting at a native checkpoint") },
    pending: (pending) => processGroup(pending.execution),
    repair_pending: (pending) => processGroup(pending.execution)
  }))
}

const formatFor = (host: QualifiedHost): "claude_code_v1" | "agent_plugins_v1" => Match.value(host).pipe(
  Match.when("claude_code", (): "claude_code_v1" => "claude_code_v1"),
  Match.when("codex", (): "agent_plugins_v1" => "agent_plugins_v1"),
  Match.exhaustive
)

const settingsPath = (host: QualifiedHost, home: string): string => Match.value(host).pipe(
  Match.when("claude_code", () => join(home, "settings.json")),
  Match.when("codex", () => join(home, "config.toml")),
  Match.exhaustive
)

export const catalogPath = (host: QualifiedHost, market: string): string => Match.value(host).pipe(
  Match.when("claude_code", () => join(market, ".claude-plugin", "marketplace.json")),
  Match.when("codex", () => join(market, ".agents", "plugins", "marketplace.json")),
  Match.exhaustive
)

export const stopGroup = (group: number): void => {
  try { process.kill(-group, "SIGKILL") }
  catch (cause) {
    if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ESRCH")) throw cause
  }
}

export const killProcess = (pid: number): void => {
  try { process.kill(pid, "SIGKILL") }
  catch (cause) {
    if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ESRCH")) throw cause
  }
}

export const waitForProcessExit = async (pid: number): Promise<void> => {
  const deadline = Date.now() + 10_000
  while (true) {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8")
      const commandEnd = stat.lastIndexOf(")")
      const state = stat[commandEnd + 2]
      if (state === "Z" || state === "X") return
    }
    catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ESRCH") return
      if (isMissing(cause)) return
      throw cause
    }
    if (Date.now() > deadline) throw new Error(`Process did not exit: ${pid}`)
    await sleep(10)
  }
}

export const processGroupAlive = (group: number): boolean => {
  try { process.kill(-group, 0); return true }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ESRCH") return false
    throw cause
  }
}

export const makeRepairFixture = async (host: QualifiedHost): Promise<RepairFixture> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-repair-"))
  try {
    const processHome = join(root, "home")
    const homeDirectory = Match.value(host).pipe(
      Match.when("claude_code", () => ".claude"),
      Match.when("codex", () => ".codex"),
      Match.exhaustive
    )
    const home = join(processHome, homeDirectory)
    const source = join(root, "source")
    const bin = join(root, "bin")
    const binary = Match.value(host).pipe(
      Match.when("claude_code", () => "claude"),
      Match.when("codex", () => "codex"),
      Match.exhaustive
    )
    const realBinary = execFileSync("which", [binary], { encoding: "utf8" }).trim()
    await mkdir(home, { recursive: true })
    await mkdir(join(source, "skills", "repair"), { recursive: true })
    await mkdir(bin)
    await copyFile(wrapper, join(bin, binary))
    await chmod(join(bin, binary), 0o755)

    const sentinelPath = settingsPath(host, home)
    const sentinel = Match.value(host).pipe(
      Match.when("claude_code", () => JSON.stringify({ theme: "dark" })),
      Match.when("codex", () => 'model = "gpt-5.1-codex"\n'),
      Match.exhaustive
    )
    await writeFile(sentinelPath, sentinel)

    const skillPath = join(source, "skills", "repair", "SKILL.md")
    const request = Schema.decodeSync(BuildRequest)({
      root: source,
      format: formatFor(host),
      plugin: {
        id: "repair-fixture",
        version: "1.0.0",
        description: "Native repair fixture",
        skills: ["skills/repair"],
        mcp: {}
      }
    })
    const build = async (body: string, name: string): Promise<string> => {
      await writeFile(skillPath, `---\nname: repair\ndescription: Native repair fixture.\n---\n${body}\n`)
      const bundle = await run(Compiler.use((compiler) => compiler.build(request)))
      const path = join(root, name)
      await writeFile(path, JSON.stringify(Schema.encodeSync(Bundle)(bundle)))
      return path
    }
    const initialBundle = await build("Initial payload.", "initial-bundle.json")
    const desiredBundle = await build("Desired replacement payload.", "desired-bundle.json")

    const env: Environment = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      SDK_REAL_HOST: realBinary,
      SDK_NATIVE_LOG: join(root, "native.log"),
      SDK_CHECKPOINT_FILE: join(root, "checkpoint"),
      SDK_RELEASE_FILE: join(root, "release")
    }
    const resetCheckpoint = async (): Promise<void> => {
      await Promise.all([
        rm(env.SDK_CHECKPOINT_FILE, { force: true }),
        rm(env.SDK_RELEASE_FILE, { force: true })
      ])
    }
    const decodedPlanning = (result: ProcessResult): PlanningValue =>
      Schema.decodeUnknownSync(Planning)(decodeStdout(result, "CLI planning"), { onExcessProperty: "error" })
    const planBundle = async (bundle: string, output: string): Promise<PlanningRun> => {
      const result = await launch([
        "plan", bundle, "--host", host, "--home", home, "--out", output, "--json"
      ], env).done
      return { path: output, result, planning: decodedPlanning(result) }
    }
    const remove = async (plugin: string, output: string): Promise<PlanningRun> => {
      const result = await launch([
        "remove", plugin, "--host", host, "--home", home, "--out", output, "--json"
      ], env).done
      return { path: output, result, planning: decodedPlanning(result) }
    }
    const repair = async (reviewedPlan: string, output: string): Promise<PlanningRun> => {
      const result = await launch(["repair", reviewedPlan, "--out", output, "--json"], env).done
      return { path: output, result, planning: decodedPlanning(result) }
    }
    const apply = async (plan: string): Promise<ApplyRun> => {
      const result = await launch(["apply", plan, "--json"], env).done
      return {
        result,
        outcome: Schema.decodeUnknownSync(ApplyOutcome)(decodeStdout(result, "CLI apply"), { onExcessProperty: "error" })
      }
    }
    const externalHost = async (args: ReadonlyArray<string>, cwd = home): Promise<string> => {
      const hostEnv = {
        ...env,
        HOME: processHome,
        CLAUDE_CONFIG_DIR: home,
        CODEX_HOME: home,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
      }
      return new Promise((resolve, reject) => {
        const child = spawn(realBinary, [...args], { cwd, env: hostEnv, stdio: ["ignore", "pipe", "pipe"] })
        let stdout = ""
        let stderr = ""
        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
        child.once("error", reject)
        child.once("close", (code) => {
          if (code === 0) resolve(stdout)
          else reject(new Error(`${binary} exited with code ${String(code)}: ${stderr}`))
        })
      })
    }
    const log = async (): Promise<string[]> => {
      try { return (await readFile(env.SDK_NATIVE_LOG, "utf8")).trim().split("\n").filter(Boolean) }
      catch (cause) { if (isMissing(cause)) return []; throw cause }
    }
    return {
      root,
      host,
      home,
      settings: sentinelPath,
      initialBundle,
      desiredBundle,
      env,
      planBundle,
      remove,
      repair,
      apply,
      launch,
      resetCheckpoint,
      externalHost,
      log,
      clean: () => rm(root, { recursive: true, force: true })
    }
  } catch (cause) {
    await rm(root, { recursive: true, force: true })
    throw cause
  }
}

export const prepareInterruptedReplacement = async (fixture: RepairFixture): Promise<InterruptedReplacement> => {
  const initial = await fixture.planBundle(fixture.initialBundle, join(fixture.root, "initial-plan.json"))
  expect(initial.result.code).toBe(0)
  const initialPlan = requireReady(initial.planning)
  const installed = await fixture.apply(initial.path)
  expect(installed.outcome).toMatchObject({ type: "completed", result: { type: "installed" } })

  const replacement = await fixture.planBundle(fixture.desiredBundle, join(fixture.root, "replacement-plan.json"))
  expect(replacement.result.code).toBe(0)
  const replacementPlan = requireReady(replacement.planning)
  expect(replacementPlan.change.type).toBe("replace")
  expect(replacementPlan.id).not.toBe(initialPlan.id)
  return { original: replacementPlan, originalPath: replacement.path }
}

export const pausedApply = async (
  fixture: RepairFixture,
  planPath: string
): Promise<RunningProcess> => {
  const step = Match.value(fixture.host).pipe(
    Match.when("claude_code", () => "plugin.uninstall"),
    Match.when("codex", () => "plugin.remove"),
    Match.exhaustive
  )
  await fixture.resetCheckpoint()
  return fixture.launch(
    ["apply", planPath, "--json"],
    { ...fixture.env, SDK_NATIVE_CHECKPOINT: step, SDK_NATIVE_TIMING: "after" }
  )
}

export const waitForCheckpoint = async (fixture: RepairFixture): Promise<void> => {
  const deadline = Date.now() + 30_000
  while (true) {
    try { await readFile(fixture.env.SDK_CHECKPOINT_FILE); return }
    catch (cause) {
      if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT")) throw cause
    }
    if (Date.now() > deadline) throw new Error("Native checkpoint was not reached")
    await sleep(10)
  }
}
