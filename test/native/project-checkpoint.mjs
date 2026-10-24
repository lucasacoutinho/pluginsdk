import fs from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { dirname, join } from "node:path"
import { setTimeout } from "node:timers/promises"

const worker = /[/\\]native-worker\.(ts|js)$/.test(process.argv[1] ?? "")
const mode = process.env.PSDK_PROJECT_CHECKPOINT
const target = join(process.env.PSDK_PROJECT_ROOT ?? "/unconfigured", ".codex", "config.toml")
const rename = fs.rename.bind(fs)
const link = fs.link.bind(fs)
const open = fs.open.bind(fs)
let activated = false

if (worker && process.env.PSDK_PROJECT_WORKER_LOG !== undefined) {
  await fs.appendFile(process.env.PSDK_PROJECT_WORKER_LOG, `${process.pid}\n`)
}

const checkpoint = async () => {
  await fs.writeFile(process.env.PSDK_PROJECT_CHECKPOINT_FILE, "ready")
  while (true) {
    try { await fs.access(process.env.PSDK_PROJECT_RELEASE_FILE); return }
    catch (cause) { if (cause.code !== "ENOENT") throw cause }
    await setTimeout(10)
  }
}

const activation = async (operation, from, to) => {
  if (!worker || String(to) !== target) return operation(from, to)
  if (mode === "before_activation") await checkpoint()
  const result = await operation(from, to)
  activated = true
  return result
}

fs.rename = (from, to) => activation(rename, from, to)
fs.link = (from, to) => activation(link, from, to)
fs.open = async (...args) => {
  const file = await open(...args)
  const sync = file.sync.bind(file)
  file.sync = async () => {
    await sync()
    if (worker && activated && mode === "after_activation" && String(args[0]) === dirname(target)) await checkpoint()
  }
  return file
}

syncBuiltinESMExports()
