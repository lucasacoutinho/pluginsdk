import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Schema } from "effect"
import { BuildRequest, Bundle as BundleSchema, Compiler, type Bundle } from "../../contracts/Compiler.ts"
import { ApplyOutcome, Planning, type ApplyOutcome as ApplyOutcomeValue, type Planning as PlanningValue } from "../../contracts/Installer.ts"
import { PluginId } from "../../contracts/Plugin.ts"
import { CompilerLive } from "../../src/compiler/index.ts"

const codexBinary = "/home/lucas/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin/codex"
const pinnedNode = "/home/lucas/.nvm/versions/node/v24.18.0/bin/node"
const cli = fileURLToPath(new URL(process.env.PSDK_PROJECT_COMPILED === "1" ? "../../dist/src/cli.js" : "../../src/cli.ts", import.meta.url))
const pluginId = Schema.decodeSync(PluginId)("pluginsdk-project-fixture")
const skillName = "project-fixture"
const pluginVersion = "1.0.0"
const compilerLayer = Layer.provideMerge(CompilerLive, NodeServices.layer)

export type ProcessResult = {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly error: string | null
  readonly timedOut: boolean
  readonly outputOverflow: boolean
}
export type RunningProcess = { readonly child: ChildProcess; readonly done: Promise<ProcessResult> }
export type PlanRun = { readonly result: ProcessResult; readonly planning: PlanningValue | null; readonly path: string }
export type ApplyRun = { readonly result: ProcessResult; readonly outcome: ApplyOutcomeValue | null }
export type ProjectServer = {
  readonly request: (method: string, params: Schema.JsonObject) => Promise<unknown>
}
export type ProjectFixture = {
  readonly root: string
  readonly home: string
  readonly source: string
  readonly projectA: string
  readonly projectB: string
  readonly projectConfig: string
  readonly userConfig: string
  readonly pluginId: typeof pluginId
  readonly env: Readonly<Record<string, string>>
  readonly bundle: (label: string, selectedPluginId?: string) => Promise<{ readonly bundle: Bundle; readonly bundlePath: string }>
  readonly plan: (bundlePath: string | null, project?: string, targetHome?: string) => Promise<PlanRun>
  readonly apply: (path: string) => Promise<ApplyRun>
  readonly applyResult: (path: string) => Promise<ProcessResult>
  readonly launch: (args: ReadonlyArray<string>, extraEnv?: Readonly<Record<string, string>>) => RunningProcess
  readonly trackGroup: (group: number) => void
  readonly withServer: <A>(project: string, run: (server: ProjectServer) => Promise<A>) => Promise<A>
  readonly discover: (project?: string) => Promise<ReadonlyArray<typeof SkillMetadata.Type>>
}

const SkillMetadata = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  path: Schema.String,
  scope: Schema.String,
  enabled: Schema.Boolean,
  pluginId: Schema.NullOr(Schema.String)
})
const SkillsResponse = Schema.Struct({
  data: Schema.Array(Schema.Struct({
    cwd: Schema.String,
    skills: Schema.Array(SkillMetadata),
    errors: Schema.Array(Schema.Unknown)
  }))
})
const AppServerFrame = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown)
})
type AppServerFrame = typeof AppServerFrame.Type

const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex")
const pause = (milliseconds: number): Promise<void> => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds))
const isErrno = (cause: unknown, code: string): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === code

const assertRuntime = (): void => {
  const outer = process.env.PSDK_PROJECT_OUTER_NET_NS
  const current = readlinkSync("/proc/self/ns/net")
  if (outer === undefined || outer === current) throw new Error("Project acceptance requires a separate network namespace")
  if (process.execPath !== pinnedNode || process.version !== "v24.18.0") throw new Error("Project acceptance requires pinned Node v24.18.0")
  if (!existsSync(codexBinary)) throw new Error("Pinned Codex 0.163.0 is unavailable")
}

const groupMembers = (group: number): ReadonlyArray<number> => {
  const result: Array<number> = []
  for (const entry of readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue
    try {
      const stat = readFileSync(`/proc/${entry.name}/stat`, "utf8")
      const fields = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/u)
      if (Number(fields[2]) === group && fields[0] !== "Z" && fields[0] !== "X") result.push(Number(entry.name))
    } catch {
      // A process may exit while /proc is being read.
    }
  }
  return result
}

const signalGroup = (group: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-group, signal)
  } catch (cause) {
    if (!isErrno(cause, "ESRCH")) throw cause
  }
}

const quiesceGroup = async (group: number): Promise<void> => {
  const wait = async (milliseconds: number): Promise<boolean> => {
    const until = Date.now() + milliseconds
    while (Date.now() < until) {
      if (groupMembers(group).length === 0) return true
      await pause(50)
    }
    return groupMembers(group).length === 0
  }
  signalGroup(group, "SIGTERM")
  if (!await wait(1_200)) signalGroup(group, "SIGKILL")
  if (!await wait(2_000)) throw new Error(`Process group ${group} did not quiesce`)
}

const launchProcess = (
  groups: Set<number>, executable: string, args: ReadonlyArray<string>, cwd: string,
  env: Readonly<Record<string, string>>, pipes = false, timeoutMs = 45_000
): RunningProcess => {
  const child = spawn(executable, [...args], {
    cwd, env, detached: true, shell: false,
    stdio: pipes ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
  })
  const addGroup = (): void => { if (typeof child.pid === "number") groups.add(child.pid) }
  child.once("spawn", addGroup)
  addGroup()
  let stdout = ""
  let stderr = ""
  let error: string | null = null
  let timedOut = false
  let outputOverflow = false
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", (chunk: string) => {
    if (stdout.length + chunk.length > 16 * 1024 * 1024) outputOverflow = true
    else stdout += chunk
  })
  child.stderr?.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000) })
  child.once("error", (cause) => { error = cause.message })
  const timer = setTimeout(() => {
    timedOut = true
    if (typeof child.pid === "number") signalGroup(child.pid, "SIGKILL")
    else child.kill("SIGKILL")
  }, timeoutMs)
  timer.unref()
  const done = new Promise<ProcessResult>((resolveResult) => child.once("close", (code, signal) => {
    clearTimeout(timer)
    if (typeof child.pid === "number" && groupMembers(child.pid).length === 0) groups.delete(child.pid)
    resolveResult({ code, signal, stdout, stderr, error, timedOut, outputOverflow })
  }))
  return { child, done }
}

const parseSchemaOutput = <S extends Schema.ConstraintDecoder<unknown>>(
  text: string, schema: S, operation: string
): S["Type"] | null => {
  if (text.trim() === "") return null
  try {
    const value: unknown = JSON.parse(text)
    return Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`${operation} stdout schema decoding failed: ${detail}`)
  }
}

const makeAppServer = (groups: Set<number>, env: Readonly<Record<string, string>>, project: string) => {
  const { child, done } = launchProcess(groups, codexBinary, ["app-server", "--stdio"], project, env, true)
  if (child.stdin === null || child.stdout === null || child.stderr === null) {
    if (typeof child.pid === "number") signalGroup(child.pid, "SIGKILL")
    throw new Error("Codex app-server did not expose all stdio streams")
  }
  const lines = createInterface({ input: child.stdout })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000) })
  const buffered: string[] = []
  let waiting: ((line: string) => void) | undefined
  let closed: Error | undefined
  lines.on("line", (line) => {
    if (waiting === undefined) buffered.push(line)
    else waiting(line)
  })
  child.once("close", (code, signal) => {
    closed = new Error(`Codex app-server exited with ${String(code)} (${String(signal)}): ${stderr}`)
  })
  const nextLine = (): Promise<string> => {
    const line = buffered.shift()
    if (line !== undefined) return Promise.resolve(line)
    if (closed !== undefined) return Promise.reject(closed)
    return new Promise((resolveLine, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        waiting = undefined
        child.off("close", onClose)
      }
      const onLine = (line: string): void => { cleanup(); resolveLine(line) }
      const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
        cleanup()
        reject(new Error(`Codex app-server exited with ${String(code)} (${String(signal)}): ${stderr}`))
      }
      const timer = setTimeout(() => { cleanup(); reject(new Error("Codex app-server response timed out")) }, 30_000)
      timer.unref()
      waiting = onLine
      child.once("close", onClose)
    })
  }
  let nextId = 1
  const notify = (method: string, params: Schema.JsonObject): void => {
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`)
  }
  const request = async (method: string, params: Schema.JsonObject): Promise<unknown> => {
    const id = nextId
    nextId += 1
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
    while (true) {
      const line = await nextLine()
      let input: unknown
      try {
        input = JSON.parse(line)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`Codex app-server stdout was not JSON: ${detail}`)
      }
      const frame: AppServerFrame = Schema.decodeUnknownSync(AppServerFrame)(input)
      if (frame.id !== id) continue
      if (frame.error !== undefined) throw new Error(`Codex app-server returned an RPC error for ${method}`)
      return frame.result
    }
  }
  const stop = async (): Promise<void> => {
    if (typeof child.pid === "number") {
      await quiesceGroup(child.pid)
      groups.delete(child.pid)
    }
    await done
  }
  return { request, notify, stop }
}

const createEnvironment = (root: string, home: string) => ({
  PATH: `${dirname(pinnedNode)}:${dirname(codexBinary)}:/usr/bin:/bin`,
  HOME: join(root, "os-home"),
  CODEX_HOME: home,
  XDG_CONFIG_HOME: join(root, "xdg", "config"),
  XDG_CACHE_HOME: join(root, "xdg", "cache"),
  XDG_DATA_HOME: join(root, "xdg", "data"),
  TMPDIR: join(root, "tmp"),
  TMP: join(root, "tmp"),
  TEMP: join(root, "tmp"),
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  TZ: "UTC",
  CI: "1",
  NO_COLOR: "1",
  TERM: "dumb",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: join(root, "empty.gitconfig"),
  GIT_TERMINAL_PROMPT: "0"
})

const initProject = async (groups: Set<number>, env: Readonly<Record<string, string>>, project: string): Promise<void> => {
  const process = launchProcess(groups, "/usr/bin/git", ["init", "--quiet", "--initial-branch=main"], project, env)
  const result = await process.done
  if (result.error !== null || result.code !== 0 || result.timedOut) throw new Error("Git project initialization failed")
  const dotCodex = join(project, ".codex")
  await mkdir(dotCodex, { recursive: true })
  await writeFile(join(dotCodex, "config.toml"), "# Trusted project configuration.\n", { mode: 0o644 })
}

const createFixture = async (root: string, groups: Set<number>): Promise<ProjectFixture> => {
  const home = join(root, "codex-home")
  const source = join(root, "source")
  const projectA = join(root, "projects", "A")
  const projectB = join(root, "projects", "B")
  const projectConfig = join(projectA, ".codex", "config.toml")
  const userConfig = join(home, "config.toml")
  const env = createEnvironment(root, home)
  for (const path of [home, source, projectA, projectB, join(root, "os-home"), join(root, "tmp"),
    join(root, "xdg", "config"), join(root, "xdg", "cache"), join(root, "xdg", "data")]) {
    await mkdir(path, { recursive: true })
  }
  await writeFile(join(root, "empty.gitconfig"), "")
  await initProject(groups, env, projectA)
  await initProject(groups, env, projectB)
  const trust = [projectA, projectB].map((path) => `[projects.${JSON.stringify(path)}]\ntrust_level = "trusted"\n`).join("\n")
  await writeFile(userConfig, `[features]\nplugins = true\n\n${trust}`, { mode: 0o600 })
  let planCounter = 0
  const bundle = async (label: string, selectedPluginId = String(pluginId)) => {
    const sourceRoot = join(source, sha256(`${selectedPluginId}\0codex\0${label}`).slice(0, 20))
    const skillRoot = join(sourceRoot, "skills", skillName)
    await mkdir(skillRoot, { recursive: true })
    const skillText = [
      "---", `name: ${skillName}`, "description: Verify project scoped Codex plugin lifecycle.", "---",
      `# ${skillName}`, "", "Read `reference.md` for this revision.", label, ""
    ].join("\n")
    await writeFile(join(skillRoot, "SKILL.md"), skillText)
    const reference = join(skillRoot, "reference.md")
    const asset = join(sourceRoot, "tools", "run.sh")
    await mkdir(dirname(asset), { recursive: true })
    await writeFile(reference, `reference bytes for ${label}\n`)
    await writeFile(asset, `#!/bin/sh\nprintf '%s\\n' '${label}'\n`)
    await chmod(asset, 0o755)
    const request = Schema.decodeSync(BuildRequest)({
      root: sourceRoot,
      format: "codex",
      plugin: {
        id: selectedPluginId,
        version: pluginVersion,
        description: "Project native lifecycle fixture.",
        skills: [`skills/${skillName}`],
        assets: ["tools/run.sh"],
        mcp: {}
      }
    })
    const bundle = await Effect.runPromise(Compiler.use((compiler) => compiler.build(request)).pipe(Effect.provide(compilerLayer)))
    const bundlePath = join(root, "bundles", `${bundle.digest}.json`)
    await mkdir(dirname(bundlePath), { recursive: true })
    await writeFile(bundlePath, JSON.stringify(Schema.encodeSync(BundleSchema)(bundle)))
    return { bundle, bundlePath }
  }
  const launch = (args: ReadonlyArray<string>, extraEnv: Readonly<Record<string, string>> = {}) =>
    launchProcess(groups, pinnedNode, [cli, ...args], projectA, { ...env, ...extraEnv })
  const plan = async (bundlePath: string | null, project = projectA, targetHome = home): Promise<PlanRun> => {
      planCounter += 1
      const path = join(root, `plan-${String(planCounter).padStart(4, "0")}.json`)
      const args = bundlePath === null
        ? ["remove", String(pluginId), "--host", "codex", "--home", targetHome, "--project", project, "--out", path, "--json"]
        : ["plan", bundlePath, "--host", "codex", "--home", targetHome, "--project", project, "--out", path, "--json"]
      const result = await launch(args).done
      if (result.error !== null) throw new Error(`Project planning subprocess could not start: ${result.error}`)
      if (result.timedOut || result.outputOverflow) throw new Error("Project planning subprocess exceeded its limit")
      return { result, planning: parseSchemaOutput(result.stdout, Planning, "Project planning"), path }
  }
  const applyResult = async (path: string): Promise<ProcessResult> => {
      const result = await launch(["apply", path, "--json"]).done
      if (result.error !== null) throw new Error(`Project apply subprocess could not start: ${result.error}`)
      if (result.timedOut || result.outputOverflow) throw new Error("Project apply subprocess exceeded its limit")
      return result
  }
  const apply = async (path: string): Promise<ApplyRun> => {
    const result = await applyResult(path)
    return { result, outcome: parseSchemaOutput(result.stdout, ApplyOutcome, "Project apply") }
  }
  const withServer = async <A>(project: string, run: (server: ProjectServer) => Promise<A>): Promise<A> => {
      const server = makeAppServer(groups, env, project)
      try {
        await server.request("initialize", {
          clientInfo: { name: "pluginsdk-project-lifecycle", title: "Plugin SDK project lifecycle", version: "1" },
          capabilities: { experimentalApi: true }
        })
        server.notify("initialized", {})
        return await run(server)
      } finally {
        await server.stop()
      }
  }
  const discover = (project = projectA) => withServer(project, async (server) => {
      const result = await server.request("skills/list", { cwds: [project], forceReload: true })
      const response = Schema.decodeUnknownSync(SkillsResponse)(result)
      return response.data.flatMap((entry) => entry.skills)
  })
  const fixture: ProjectFixture = {
    root, home, source, projectA, projectB, projectConfig, userConfig, pluginId, env,
    bundle, plan, apply, applyResult, launch,
    trackGroup: (group) => groups.add(group), withServer, discover
  }
  return fixture
}

export const withProjectFixture = async <A>(run: (fixture: ProjectFixture) => Promise<A>): Promise<A> => {
  assertRuntime()
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-project-native-"))
  const groups = new Set<number>()
  try {
    return await run(await createFixture(root, groups))
  } finally {
    for (const group of [...groups].reverse()) await quiesceGroup(group)
    await rm(root, { recursive: true, force: true })
  }
}
