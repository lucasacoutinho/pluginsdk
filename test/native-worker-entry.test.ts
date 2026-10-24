import { fork, spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "@effect/vitest"
import { Fingerprint, PlanId, type RepairPlanBody } from "../contracts/Installer.ts"
import { planId } from "../src/internal/identity.ts"
import type { StoredState } from "../src/installer/lifecycle/records.ts"
import { executionPlan } from "./fixtures/execution-plan.ts"

const entry = fileURLToPath(new URL("../src/installer/execution/native-worker.ts", import.meta.url))
const directories: Array<string> = []

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

const retainedRepair = async () => {
  const directory = await mkdtemp(join(tmpdir(), "pluginsdk-worker-entry-"))
  directories.push(directory)
  const original = executionPlan(directory)
  const body: RepairPlanBody = {
    type: "repair_ready", schema: 1, target: original.target,
    before: {
      interrupted: original.id,
      pending: PlanId.make("d".repeat(64)),
      observed: { fingerprint: Fingerprint.make("c".repeat(64)), residual: "absent" }
    }
  }
  const plan = { ...body, id: planId(body) }
  const record: StoredState = { schema: 1, type: "repair_pending", original, plan, execution: { type: "prepared" } }
  const path = join(directory, "state.json")
  const text = JSON.stringify(record)
  await writeFile(path, text)
  return { path, plan, text }
}

const invoke = (arguments_: ReadonlyArray<string>) => {
  const result = spawnSync(process.execPath, [entry, ...arguments_], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  expect(result.signal, result.stderr).toBeNull()
  return result.status
}

const invokeIpc = (message: object) => new Promise<number | null>((resolve, reject) => {
  const child = fork(entry, [], { execPath: process.execPath, execArgv: [], silent: true })
  const timeout = setTimeout(() => { child.kill(); reject(new Error("Native worker did not exit")) }, 10_000)
  child.once("error", (cause) => { clearTimeout(timeout); reject(cause) })
  child.once("close", (code) => { clearTimeout(timeout); resolve(code) })
  child.send(message)
})

it("executes the exact validated repair through IPC without rewriting its record", async () => {
  const { path, plan, text } = await retainedRepair()
  expect(await invokeIpc({ plan })).toBe(0)
  expect(await readFile(path, "utf8")).toBe(text)
})

it("refuses the retired retained-plan entry without reading or rewriting its record", async () => {
  const { path, plan, text } = await retainedRepair()
  expect(invoke(["--retained-plan", path, plan.id])).toBe(1)
  expect(await readFile(path, "utf8")).toBe(text)
})

it("refuses excess IPC fields and a changed plan commitment", async () => {
  const { plan } = await retainedRepair()
  expect(await invokeIpc({ plan, extra: true })).toBe(1)
  expect(await invokeIpc({ plan: { ...plan, target: { ...plan.target, version: "changed" } } })).toBe(1)
})
