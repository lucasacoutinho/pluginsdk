import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { Effect, Result, Schema } from "effect"
import { Installer, HostUnavailable } from "../../contracts/Installer.ts"
import { Directory, PackagePath, PluginId } from "../../contracts/Plugin.ts"
import { BundleDigest } from "../../contracts/Compiler.ts"
import { ProcessId } from "../../contracts/Execution.ts"
import { WorkerRequest, PlanReply, ApplyReply } from "../../src/installer/execution/protocol.ts"
import { InstallerWorkerLive } from "../../src/installer/execution/client.ts"

const root = await mkdtemp(join(tmpdir(), "pluginsdk-worker-"))
const processes = []
const detached = []
const checks = []
const check = (name, condition) => { assert.ok(condition, name); checks.push(name) }
const exists = (path) => stat(path).then(() => true, (cause) => {
  if (cause.code === "ENOENT") return false
  throw cause
})
const waitUntil = async (condition, name) => {
  const deadline = Date.now() + 10_000
  while (!(await condition())) {
    if (Date.now() >= deadline) throw new Error(`Timeout: ${name}`)
    await setTimeout(20)
  }
}
const launch = (file = new URL("../fixtures/installer-worker.ts", import.meta.url)) => {
  const child = fork(file, [], { execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] })
  processes.push(child)
  let stderr = ""
  child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-8192) })
  const replies = []
  child.on("message", (value) => replies.push(value))
  const done = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal, stderr }))
  })
  return { child, done, replies }
}
const request = (directory) => WorkerRequest.make({
  schema: 1, type: "plan", input: {
    destination: { type: "user", host: "grok_bot", home: Directory.make(directory) },
    intent: { type: "absent", plugin: PluginId.make("worker-fixture") }
  }
})
const send = (process, value) => new Promise((resolve, reject) => process.child.send(value, (cause) => cause ? reject(cause) : resolve()))
const release = (directory, process) => writeFile(join(directory, `release-${process.child.pid}`), "release\n")
const entered = (directory, process) => exists(join(directory, `entered-${process.child.pid}`))
const completed = (directory, process) => exists(join(directory, `completed-${process.child.pid}`))
const successfulFixtureReply = (process) => {
  assert.equal(process.replies.length, 1)
  const reply = Schema.decodeUnknownSync(PlanReply, { onExcessProperty: "error" })(process.replies[0])
  return reply.result._tag === "Failure" && reply.result.failure._tag === "DestinationUnsupported" && reply.result.failure.detail === "fixture operation completed"
}

try {
  const bytes = Uint8Array.of(0, 255, 128, 10, 65)
  const body = request(root)
  const binary = { ...body, input: { ...body.input, intent: { type: "present", bundle: {
    schema: 1, plugin: PluginId.make("worker-fixture"), format: "codex",
    digest: BundleDigest.make("a".repeat(64)), files: [{ path: PackagePath.make("binary.dat"), content: bytes, executable: false }]
  } } } }
  const roundTrip = Schema.decodeUnknownSync(WorkerRequest)(JSON.parse(JSON.stringify(Schema.encodeSync(WorkerRequest)(binary))))
  check("wire_retains_captured_binary_bytes", Buffer.from(roundTrip.input.intent.bundle.files[0].content).equals(Buffer.from(bytes)))
  const error = Result.fail(new HostUnavailable({ host: "grok_bot", cause: new Error("fixture cause") }))
  const decoded = Schema.decodeUnknownSync(PlanReply)(JSON.parse(JSON.stringify(Schema.encodeSync(PlanReply)({ schema: 1, type: "plan", result: error }))))
  check("wire_retains_typed_failure_and_cause", decoded.result.failure._tag === "HostUnavailable" && decoded.result.failure.cause instanceof Error && decoded.result.failure.cause.message === "fixture cause")
  assert.throws(() => Schema.decodeUnknownSync(ApplyReply, { onExcessProperty: "error" })(Schema.encodeSync(PlanReply)({ schema: 1, type: "plan", result: error })))
  check("reply_operation_is_bound", true)

  const before = launch()
  before.child.disconnect()
  check("disconnect_before_request_exits_cleanly", (await before.done).code === 0)

  const malformed = launch()
  await send(malformed, { ...Schema.encodeSync(WorkerRequest)(body), extra: true })
  check("malformed_request_exits_without_operation", (await malformed.done).code === 1 && !(await exists(join(root, "calls"))))

  const duplicates = join(root, "duplicates")
  await mkdir(duplicates)
  const once = launch()
  const encoded = Schema.encodeSync(WorkerRequest)(request(duplicates))
  await send(once, encoded)
  await send(once, encoded)
  await waitUntil(() => entered(duplicates, once), "first request accepted")
  await release(duplicates, once)
  check("accepted_request_returns_typed_reply", (await once.done).code === 0 && successfulFixtureReply(once))
  check("duplicate_request_cannot_start_again", (await readFile(join(duplicates, "calls"), "utf8")).trim().split("\n").length === 1)

  const ownership = join(root, "ownership")
  await mkdir(ownership)
  const owner = launch()
  await send(owner, Schema.encodeSync(WorkerRequest)(request(ownership)))
  await waitUntil(() => entered(ownership, owner), "owner acquired lock")
  owner.child.disconnect()
  const contender = launch()
  await send(contender, Schema.encodeSync(WorkerRequest)(request(ownership)))
  await waitUntil(() => exists(join(ownership, `waiting-${contender.child.pid}`)), "contender observed lock contention")
  check("caller_disconnect_does_not_release_worker_lock", owner.child.exitCode === null && !(await entered(ownership, contender)))
  await release(ownership, owner)
  await owner.done
  check("disconnected_worker_finishes_accepted_operation", await completed(ownership, owner))
  await waitUntil(() => entered(ownership, contender), "contender acquired released lock")
  await release(ownership, contender)
  check("lock_released_after_completion", (await contender.done).code === 0 && successfulFixtureReply(contender))

  const death = join(root, "death")
  await mkdir(death)
  const killed = launch()
  await send(killed, Schema.encodeSync(WorkerRequest)(request(death)))
  await waitUntil(() => entered(death, killed), "worker holds lock before death")
  const next = launch()
  await send(next, Schema.encodeSync(WorkerRequest)(request(death)))
  await waitUntil(() => exists(join(death, `waiting-${next.child.pid}`)), "second worker observed lock contention")
  check("second_worker_waits_for_lock", !(await entered(death, next)))
  killed.child.kill("SIGKILL")
  await killed.done
  await waitUntil(() => entered(death, next), "lock released by worker death")
  await release(death, next)
  check("worker_death_releases_process_owned_lock", (await next.done).code === 0 && successfulFixtureReply(next))

  const callerDeath = join(root, "caller-death")
  await mkdir(callerDeath)
  const controller = launch(new URL("../fixtures/installer-worker-controller.cjs", import.meta.url))
  await send(controller, Schema.encodeSync(WorkerRequest)(request(callerDeath)))
  await waitUntil(() => controller.replies.length === 1, "controller reported worker")
  const owned = Schema.decodeUnknownSync(Schema.Struct({ pid: ProcessId }), { onExcessProperty: "error" })(controller.replies[0])
  detached.push({ directory: callerDeath, pid: owned.pid })
  await waitUntil(() => exists(join(callerDeath, `entered-${owned.pid}`)), "worker acquired lock before caller death")
  controller.child.kill("SIGKILL")
  await controller.done
  const afterCaller = launch()
  await send(afterCaller, Schema.encodeSync(WorkerRequest)(request(callerDeath)))
  await waitUntil(() => exists(join(callerDeath, `waiting-${afterCaller.child.pid}`)), "worker retained lock after caller death")
  check("caller_death_does_not_release_worker_lock", !(await entered(callerDeath, afterCaller)))
  await writeFile(join(callerDeath, `release-${owned.pid}`), "release\n")
  await waitUntil(() => exists(join(callerDeath, `completed-${owned.pid}`)), "worker completed after caller death")
  await waitUntil(() => entered(callerDeath, afterCaller), "lock released after orphan completion")
  await release(callerDeath, afterCaller)
  check("worker_finishes_after_actual_caller_death", (await afterCaller.done).code === 0 && successfulFixtureReply(afterCaller))

  const outcome = await Effect.runPromise(Installer.use((service) => Effect.result(service.plan(request(root).input))).pipe(Effect.provide(InstallerWorkerLive)))
  check("production_worker_round_trip_retains_error", outcome._tag === "Failure" && outcome.failure._tag === "DestinationUnsupported")
  console.log(JSON.stringify({ schema: 1, status: "passed", platform: process.platform, node: process.versions.node, checks, clientLifecycleTested: false }))
} finally {
  for (const owner of detached) await writeFile(join(owner.directory, `release-${owner.pid}`), "release\n")
  for (const child of processes) {
    if (child.connected) child.disconnect()
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  }
  await Promise.all(processes.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve))))
  for (const owner of detached) {
    await waitUntil(() => {
      try { process.kill(owner.pid, 0); return false }
      catch (cause) { if (cause.code === "ESRCH") return true; throw cause }
    }, "detached worker exit")
  }
  await rm(root, { recursive: true, force: true })
}
