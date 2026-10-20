#!/usr/bin/env node
import { spawn } from "node:child_process"
import { access, appendFile, writeFile } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"

const args = process.argv.slice(2)
const step = args[0] !== "plugin" ? null : args[1] === "marketplace" ? `marketplace.${args[2]}` : `plugin.${args[1]}`
const mutation = ["marketplace.add", "marketplace.remove", "plugin.install", "plugin.uninstall", "plugin.add", "plugin.remove"].includes(step)
if (mutation) await appendFile(process.env.SDK_NATIVE_LOG, `${JSON.stringify(args)}\n`)

const checkpoint = async (timing) => {
  if (step !== process.env.SDK_NATIVE_CHECKPOINT || timing !== process.env.SDK_NATIVE_TIMING) return
  await writeFile(process.env.SDK_CHECKPOINT_FILE, "ready")
  while (true) {
    try { await access(process.env.SDK_RELEASE_FILE); return }
    catch (cause) { if (cause.code !== "ENOENT") throw cause }
    await setTimeout(10)
  }
}

await checkpoint("before")
const child = spawn(process.env.SDK_REAL_HOST, args, { stdio: "inherit" })
child.once("error", (cause) => { throw cause })
const code = await new Promise((resolve) => child.once("exit", (code) => resolve(code ?? 1)))
if (code === 0) await checkpoint("after")
process.exitCode = code
