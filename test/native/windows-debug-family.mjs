import { spawn } from "node:child_process"
import { writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const childEntry = fileURLToPath(import.meta.url)
const child = process.argv[2] === "--child"
const settings = child
  ? { directory: process.argv[3], mode: process.argv[5] }
  : JSON.parse(readFileSync(process.argv[3], "utf8"))
const role = child ? process.argv[4] : "root"
writeFileSync(join(settings.directory, `${process.pid}.started`), JSON.stringify({ pid: process.pid, parent: process.ppid, role }))

const launch = (role, detached) => {
  const process_ = spawn(process.execPath, [childEntry, "--child", settings.directory, role, settings.mode], { detached, stdio: "ignore" })
  process_.on("error", (error) => { console.error(error); process.exitCode = 1 })
  if (detached) process_.unref()
}

if (role === "root" && settings.mode === "nativeDebugBreak") {
  const koffi = (await import("koffi")).default
  const kernel = koffi.load("kernel32.dll")
  kernel.func("uint32_t __stdcall SetErrorMode(uint32_t mode)")(3)
  kernel.func("void __stdcall DebugBreak()")()
  writeFileSync(join(settings.directory, "after-exception"), "unexpected continuation")
} else if (role === "root") {
  launch("ordinary", false)
  launch("detached", true)
} else if (role === "ordinary" || role === "detached") {
  launch(`${role}-leaf`, true)
}

setTimeout(() => {}, role.endsWith("-leaf") ? 80 : 10)
