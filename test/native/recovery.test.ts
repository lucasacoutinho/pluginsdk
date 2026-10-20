import { expect, it } from "vitest"
import { spawn, execFileSync } from "node:child_process"
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { Effect, Schema } from "effect"
import { BuildRequest, Compiler, type Bundle } from "../../contracts/Compiler.ts"
import { ApplyOutcome, Destination, Installer, ReadyPlan, type Host } from "../../contracts/Installer.ts"
import { parseJson } from "../../src/internal/json.ts"
import { StoredState } from "../../src/installer/records.ts"
import { targetPaths } from "../../src/installer/target.ts"
import { PluginSdkLive } from "../../src/node.ts"

const cli = fileURLToPath(new URL("../../src/cli.ts", import.meta.url))
const checkpointModule = fileURLToPath(new URL("./io-checkpoint.mjs", import.meta.url))
const wrapper = fileURLToPath(new URL("./host-wrapper.mjs", import.meta.url))
type QualifiedHost = Extract<Host, "claude_code" | "codex">
type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }

const run = <A, E>(effect: Effect.Effect<A, E, Compiler | Installer>) => Effect.runPromise(effect.pipe(Effect.provide(PluginSdkLive)))

const launch = (args: ReadonlyArray<string>, env: NodeJS.ProcessEnv, instrument = false) => {
  const child = spawn(process.execPath, [...(instrument ? ["--import", checkpointModule] : []), cli, ...args], { env, stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
  const done = new Promise<ProcessResult>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => child.kill("SIGKILL"), 45_000)
    timer.unref()
    child.once("error", reject)
    child.once("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }) })
  })
  return { child, done }
}

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 30_000
  while (true) {
    try { await access(path); return }
    catch (cause) { if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT")) throw cause }
    if (Date.now() > deadline) throw new Error(`Checkpoint was not reached: ${path}`)
    await setTimeout(10)
  }
}

const stopGroup = (group: number): void => {
  try { process.kill(-group, "SIGKILL") }
  catch (cause) { if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ESRCH")) throw cause }
}

const fixture = async (host: QualifiedHost) => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-recovery-"))
  const home = join(root, "home", host === "codex" ? ".codex" : ".claude")
  const source = join(root, "source")
  const bin = join(root, "bin")
  await mkdir(home, { recursive: true })
  await mkdir(join(source, "skills/recover"), { recursive: true })
  await mkdir(bin)
  await writeFile(join(source, "skills/recover/SKILL.md"), "---\nname: recover\ndescription: Recovery fixture.\n---\nReturn fixture.\n")
  const binary = host === "codex" ? "codex" : "claude"
  const realBinary = execFileSync("which", [binary], { encoding: "utf8" }).trim()
  await copyFile(wrapper, join(bin, binary))
  await chmod(join(bin, binary), 0o755)
  const request = Schema.decodeSync(BuildRequest)({ root: source, format: host === "codex" ? "agent_plugins_v1" : "claude_code_v1", plugin: { id: "recovery-fixture", version: "1.0.0", description: "Native recovery fixture", skills: ["skills/recover"], mcp: {} } })
  const destination = Schema.decodeSync(Destination)({ type: "user", host, home })
  const bundle = await run(Compiler.use((compiler) => compiler.build(request)))
  const preview = async (desired: Bundle | null) => {
    const planning = await run(Installer.use((installer) => installer.plan({ destination, intent: desired === null ? { type: "absent", plugin: bundle.plugin } : { type: "present", bundle: desired } })))
    if (planning.type !== "ready") throw new Error(`Expected ready plan, received ${planning.type}`)
    const path = join(root, `${planning.id}.json`)
    await writeFile(path, JSON.stringify(Schema.encodeSync(ReadyPlan)(planning)))
    return { plan: planning, path }
  }
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, SDK_REAL_HOST: realBinary, SDK_NATIVE_LOG: join(root, "native.log"), SDK_CHECKPOINT_FILE: join(root, "checkpoint"), SDK_RELEASE_FILE: join(root, "release") }
  const log = async (): Promise<string[]> => {
    try { return (await readFile(env.SDK_NATIVE_LOG, "utf8")).trim().split("\n").filter(Boolean) }
    catch (cause) { if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return []; throw cause }
  }
  const apply = async (path: string) => {
    const result = await launch(["apply", path, "--json"], env).done
    return Schema.decodeUnknownSync(ApplyOutcome)(parseJson(result.stdout))
  }
  return { root, source, bundle, request, preview, env, apply, log, clean: () => rm(root, { recursive: true, force: true }) }
}

for (const host of ["claude_code", "codex"] satisfies QualifiedHost[]) {
  for (const point of ["before_pending", "after_pending", "after_token", "before_complete", "after_complete"]) {
    it(`${host}: recovers a caller killed at ${point} without replaying native changes`, async () => {
      const setup = await fixture(host)
      const saved = await setup.preview(setup.bundle)
      const running = launch(["apply", saved.path, "--json"], { ...setup.env, SDK_IO_CHECKPOINT: point }, true)
      try {
        await waitForFile(setup.env.SDK_CHECKPOINT_FILE)
        running.child.kill("SIGKILL")
        expect((await running.done).signal).toBe("SIGKILL")
        const recovered = await setup.apply(saved.path)
        const expected = point === "after_pending" || point === "after_token" ? "not_applied" : "installed"
        expect(recovered).toMatchObject({ type: "completed", result: { type: expected } })
        const firstLog = await setup.log()
        expect(firstLog).toHaveLength(expected === "installed" ? 2 : 0)
        expect(await setup.apply(saved.path)).toEqual(recovered)
        expect(await setup.log()).toEqual(firstLog)
        const state = Schema.decodeUnknownSync(StoredState)(parseJson(await readFile(targetPaths(saved.plan.target).state, "utf8")))
        expect(state.type).toBe("idle")
        if (expected === "not_applied") {
          const fresh = await setup.preview(setup.bundle)
          expect(fresh.plan.id).not.toBe(saved.plan.id)
          expect(await setup.apply(fresh.path)).toMatchObject({ type: "completed", result: { type: "installed" } })
          expect(await setup.log()).toHaveLength(2)
        }
      } finally {
        running.child.kill("SIGKILL")
        await running.done
        await setup.clean()
      }
    })
  }

  it(`${host}: retains the write lock after caller death until the native worker finishes`, async () => {
    const setup = await fixture(host)
    const saved = await setup.preview(setup.bundle)
    const running = launch(["apply", saved.path, "--json"], { ...setup.env, SDK_NATIVE_CHECKPOINT: host === "codex" ? "plugin.add" : "plugin.install", SDK_NATIVE_TIMING: "before" })
    let retry: ReturnType<typeof launch> | undefined
    try {
      await waitForFile(setup.env.SDK_CHECKPOINT_FILE)
      running.child.kill("SIGKILL")
      await running.done
      retry = launch(["apply", saved.path, "--json"], setup.env)
      let finished = false
      void retry.done.then(() => { finished = true })
      await setTimeout(200)
      expect(finished).toBe(false)
      expect(await setup.log()).toHaveLength(2)
      await writeFile(setup.env.SDK_RELEASE_FILE, "release")
      const result = await retry.done
      expect(Schema.decodeUnknownSync(ApplyOutcome)(parseJson(result.stdout))).toMatchObject({ type: "completed", result: { type: "installed" } })
      expect(await setup.log()).toHaveLength(2)
    } finally {
      await writeFile(setup.env.SDK_RELEASE_FILE, "release")
      running.child.kill("SIGKILL")
      await running.done
      if (retry !== undefined) { retry.child.kill("SIGKILL"); await retry.done }
      await setup.clean()
    }
  })

  it(`${host}: settles removal after native completion and before journal acknowledgement`, async () => {
    const setup = await fixture(host)
    let running: ReturnType<typeof launch> | undefined
    try {
      const installed = await setup.preview(setup.bundle)
      expect(await setup.apply(installed.path)).toMatchObject({ type: "completed", result: { type: "installed" } })
      const removal = await setup.preview(null)
      running = launch(["apply", removal.path, "--json"], { ...setup.env, SDK_IO_CHECKPOINT: "before_complete" }, true)
      await waitForFile(setup.env.SDK_CHECKPOINT_FILE)
      running.child.kill("SIGKILL")
      await running.done
      const recovered = await setup.apply(removal.path)
      expect(recovered).toEqual({ type: "completed", result: { type: "removed" } })
      const log = await setup.log()
      expect(log).toHaveLength(4)
      expect(await setup.apply(removal.path)).toEqual(recovered)
      expect(await setup.log()).toEqual(log)
    } finally {
      if (running !== undefined) { running.child.kill("SIGKILL"); await running.done }
      await setup.clean()
    }
  })

  it(`${host}: leaves an interrupted replacement pending and never resumes its native recipe`, async () => {
    const setup = await fixture(host)
    let running: ReturnType<typeof launch> | undefined
    let group: number | undefined
    try {
      const initial = await setup.preview(setup.bundle)
      expect(await setup.apply(initial.path)).toMatchObject({ type: "completed", result: { type: "installed" } })
      await writeFile(join(setup.source, "skills/recover/changed.txt"), "replacement")
      const bundle = await run(Compiler.use((compiler) => compiler.build(setup.request)))
      const replacement = await setup.preview(bundle)
      expect(replacement.plan.change.type).toBe("replace")
      running = launch(["apply", replacement.path, "--json"], { ...setup.env, SDK_NATIVE_CHECKPOINT: host === "codex" ? "plugin.remove" : "plugin.uninstall", SDK_NATIVE_TIMING: "after" })
      await waitForFile(setup.env.SDK_CHECKPOINT_FILE)
      const state = Schema.decodeUnknownSync(StoredState)(parseJson(await readFile(targetPaths(replacement.plan.target).state, "utf8")))
      if (state.type !== "pending" || state.execution.type !== "running") throw new Error("Expected retained native execution token")
      group = state.execution.group
      process.kill(-group, "SIGKILL")
      const result = await running.done
      expect(Schema.decodeUnknownSync(ApplyOutcome)(parseJson(result.stdout)).type).toBe("uncertain")
      const nativeLog = await setup.log()
      expect(nativeLog).toHaveLength(3)
      expect((await setup.apply(replacement.path)).type).toBe("uncertain")
      expect(await setup.log()).toEqual(nativeLog)
    } finally {
      if (group !== undefined) stopGroup(group)
      if (running !== undefined) { running.child.kill("SIGKILL"); await running.done }
      await setup.clean()
    }
  })
}
