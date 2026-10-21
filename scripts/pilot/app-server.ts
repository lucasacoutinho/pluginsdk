import { spawn } from "node:child_process"
import assert from "node:assert/strict"
import { createInterface } from "node:readline"
import { Schema } from "effect"

const FrameSchema = Schema.Struct({
  jsonrpc: Schema.optionalKey(Schema.Literal("2.0")),
  id: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
  method: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(Schema.Unknown),
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown)
})
const SkillSchema = Schema.Struct({ name: Schema.String, path: Schema.String, enabled: Schema.Boolean, pluginId: Schema.NullOr(Schema.String) })
const SkillsSchema = Schema.Struct({
  data: Schema.Array(Schema.Struct({ cwd: Schema.String, skills: Schema.Array(SkillSchema), errors: Schema.Array(Schema.Unknown) }))
})
export type DiscoveredSkill = typeof SkillSchema.Type
type Pending = { readonly resolve: (value: unknown) => void; readonly reject: (cause: Error) => void; readonly timer: ReturnType<typeof setTimeout> }

const client = (cwd: string, env: NodeJS.ProcessEnv) => {
  const child = spawn("codex", ["app-server", "--stdio"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
  if (child.stdin === null || child.stdout === null || child.stderr === null) throw new Error("Codex app-server stdio was unavailable")
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, Pending>()
  let nextId = 0
  let stderr = ""
  let close = () => {}
  const closed = new Promise<void>((resolve) => { close = resolve })
  const rejectPending = (cause: Error) => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(cause) }
    pending.clear()
  }
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4000) })
  lines.on("line", (line) => {
    try {
      const value: unknown = JSON.parse(line)
      const frame = Schema.decodeUnknownSync(FrameSchema)(value)
      if (typeof frame.id !== "number") return
      const item = pending.get(frame.id)
      if (item === undefined) return
      pending.delete(frame.id)
      clearTimeout(item.timer)
      if (frame.error !== undefined) item.reject(new Error(`Codex app-server error: ${JSON.stringify(frame.error)}`))
      else item.resolve(frame.result)
    } catch (cause) { rejectPending(cause instanceof Error ? cause : new Error(String(cause))) }
  })
  child.once("close", (code, signal) => {
    lines.close()
    rejectPending(new Error(`Codex app-server exited with ${String(code)} (${String(signal)}): ${stderr}`))
    close()
  })
  child.once("error", (cause) => rejectPending(cause))
  const send = (frame: unknown) => child.stdin.write(`${JSON.stringify(frame)}\n`)
  return {
    request(method: string, params: unknown): Promise<unknown> {
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex app-server ${method} timed out: ${stderr}`)) }, 30_000)
        pending.set(id, { resolve, reject, timer })
        try { send({ jsonrpc: "2.0", id, method, params }) } catch (cause) {
          pending.delete(id); clearTimeout(timer); reject(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })
    },
    notify(method: string, params: unknown): void { send({ jsonrpc: "2.0", method, params }) },
    async stop(): Promise<void> {
      if (child.exitCode !== null || child.signalCode !== null) return closed
      child.kill("SIGTERM")
      let timer: ReturnType<typeof setTimeout> | undefined
      const stopped = await Promise.race([closed.then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 1500) })])
      if (timer !== undefined) clearTimeout(timer)
      if (!stopped) { child.kill("SIGKILL"); await closed }
    }
  }
}

export const discoverCodexSkills = async (cwd: string, env: NodeJS.ProcessEnv): Promise<readonly DiscoveredSkill[]> => {
  const app = client(cwd, env)
  try {
    const initialized: unknown = await app.request("initialize", {
      clientInfo: { name: "pluginsdk-lstack-pilot", title: "PluginSDK lstack pilot", version: "1.0.0" },
      capabilities: null
    })
    Schema.decodeUnknownSync(Schema.Struct({ userAgent: Schema.String }))(initialized)
    app.notify("initialized", {})
    const response: unknown = await app.request("skills/list", { cwds: [cwd], forceReload: true })
    const inventory = Schema.decodeUnknownSync(SkillsSchema)(response).data
    assert.equal(inventory.length, 1, "Codex returned an unexpected workspace inventory")
    const workspace = inventory[0]
    assert.ok(workspace)
    assert.equal(workspace.cwd, cwd)
    assert.deepEqual(workspace.errors, [], "Codex reported skill discovery errors")
    return workspace.skills
  } finally { await app.stop() }
}
