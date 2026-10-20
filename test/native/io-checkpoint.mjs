import fs from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { basename, dirname } from "node:path"

const open = fs.open.bind(fs)
const rename = fs.rename.bind(fs)
const mode = process.env.SDK_IO_CHECKPOINT
let committedDirectory

const checkpoint = async () => {
  await fs.writeFile(process.env.SDK_CHECKPOINT_FILE, "ready")
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}

fs.rename = async (from, to) => {
  if (basename(String(to)) !== "state.json") return rename(from, to)
  const value = JSON.parse(await fs.readFile(from, "utf8"))
  const prepared = value.type === "pending" && value.execution.type === "prepared"
  const running = value.type === "pending" && value.execution.type === "running"
  const completed = value.type === "idle"
  if ((mode === "before_pending" && prepared) || (mode === "before_complete" && completed)) await checkpoint()
  await rename(from, to)
  if ((mode === "after_pending" && prepared) || (mode === "after_token" && running) || (mode === "after_complete" && completed)) committedDirectory = dirname(String(to))
}

fs.open = async (...args) => {
  const file = await open(...args)
  const sync = file.sync.bind(file)
  file.sync = async () => {
    await sync()
    if (committedDirectory === String(args[0])) await checkpoint()
  }
  return file
}

syncBuiltinESMExports()
