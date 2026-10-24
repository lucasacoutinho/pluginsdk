"use strict"
const { fork } = require("node:child_process")
const { join } = require("node:path")
process.once("message", (request) => {
  const child = fork(join(__dirname, "installer-worker.ts"), [], { execArgv: [], detached: true, stdio: ["ignore", "ignore", "inherit", "ipc"] })
  child.on("error", (error) => { console.error(error); process.exitCode = 1 })
  child.send(request, (error) => {
    if (error) throw error
    process.send({ pid: child.pid })
  })
})
