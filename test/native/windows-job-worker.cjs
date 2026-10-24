"use strict"
const { fork } = require("node:child_process")
const assert = require("node:assert/strict")
const { pathToFileURL } = require("node:url")
const role = process.argv[2]
const heartbeat = setInterval(() => {}, 1000)
const send = (message) => new Promise((resolve, reject) => process.send(message, (error) => error ? reject(error) : resolve()))

if (role === "leaf") {
  process.on("message", (message) => {
    assert.equal(message, "finish")
    clearInterval(heartbeat)
    process.disconnect()
  })
  void send({ type: "ready", pid: process.pid })
} else if (role === "gated") {
  let started = false
  let child
  process.on("disconnect", () => { if (!started) process.exit(0) })
  process.on("message", (message) => {
    if (message === "finish") {
      assert.ok(started && child)
      child.send("finish")
      child.once("exit", () => { clearInterval(heartbeat); process.disconnect() })
      return
    }
    assert.equal(message, "go")
    assert.equal(started, false)
    started = true
    child = fork(__filename, ["leaf"], { execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"] })
    child.once("message", (ready) => {
      assert.equal(ready.type, "ready")
      assert.equal(ready.pid, child.pid)
      void send({ type: "family", pid: process.pid, descendant: child.pid })
    })
  })
  void send({ type: "ready", pid: process.pid })
} else if (role === "owner") {
  void (async () => {
    const { Effect, Schema } = await import("effect")
    const root = pathToFileURL(process.cwd() + "/")
    const { WindowsJobs, WindowsJobsLive } = await import(new URL("src/installer/windows/process/jobs.ts", root))
    const { ProcessId } = await import(new URL("contracts/Execution.ts", root))
    const readySchema = Schema.Struct({ type: Schema.Literal("ready"), pid: ProcessId })
    const familySchema = Schema.Struct({ type: Schema.Literal("family"), pid: ProcessId, descendant: ProcessId })
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const jobs = yield* WindowsJobs
      const job = yield* jobs.create
      const child = fork(__filename, ["gated"], { execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"] })
      const first = yield* Effect.promise(() => new Promise((resolve) => child.once("message", resolve)))
      const ready = Schema.decodeUnknownSync(readySchema, { onExcessProperty: "error" })(first)
      assert.equal(ready.pid, child.pid)
      yield* job.assign(ready.pid)
      const family = new Promise((resolve) => child.once("message", resolve))
      child.send("go")
      const message = Schema.decodeUnknownSync(familySchema, { onExcessProperty: "error" })(yield* Effect.promise(() => family))
      yield* Effect.promise(() => send({ type: "owned", pid: process.pid, child: message.pid, descendant: message.descendant, name: job.domain.name }))
      yield* Effect.never
    })).pipe(Effect.provide(WindowsJobsLive)))
  })().catch((error) => { console.error(error); process.exit(1) })
} else {
  throw new Error("Unknown owned probe role")
}
