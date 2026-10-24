import assert from "node:assert/strict"
import { fork } from "node:child_process"
import crypto from "node:crypto"
import { syncBuiltinESMExports } from "node:module"
import { release } from "node:os"
import { setTimeout } from "node:timers/promises"
import { Effect, ManagedRuntime, Schema } from "effect"
import koffi from "koffi"
import { JobName, ProcessId } from "../../contracts/Execution.ts"
import { executionDomainStatus } from "../../src/installer/execution/model.ts"
import { WindowsJobs, WindowsJobsLive } from "../../src/installer/windows/process/jobs.ts"

assert.equal(process.platform, "win32")
assert.equal(process.arch, "x64")
assert.equal(koffi.version, "3.3.3")
const checks = []
const detail = {}
const check = (name, condition) => { assert.ok(condition, name); checks.push(name) }
const runtime = ManagedRuntime.make(WindowsJobsLive)
const run = (effect) => runtime.runPromise(effect)
const jobs = await run(WindowsJobs)
const withJob = (body) => run(Effect.scoped(Effect.gen(function*() {
  const job = yield* jobs.create
  return yield* Effect.promise(() => body(job))
})))
const waitUntil = async (predicate, label) => {
  const deadline = Date.now() + 10_000
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timeout: ${label}`)
    await setTimeout(25)
  }
}
const library = koffi.load("kernel32.dll")
const native = {
  openProcess: library.func("void * __stdcall OpenProcess(uint32_t access, int32_t inherit, uint32_t pid)"),
  wait: library.func("uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t timeout)"),
  close: library.func("int32_t __stdcall CloseHandle(void *handle)"),
  terminate: library.func("int32_t __stdcall TerminateProcess(void *handle, uint32_t code)"),
  createEvent: library.func("void * __stdcall CreateEventW(void *attributes, int32_t manual, int32_t initial, const char16_t *name)"),
  getCurrentProcess: library.func("void * __stdcall GetCurrentProcess()"),
  handleCount: library.func("int32_t __stdcall GetProcessHandleCount(void *process, void *count)")
}
const handles = []
const children = []
const watch = (pid) => {
  const handle = native.openProcess(0x00101001, 0, ProcessId.make(pid))
  assert.equal(typeof handle, "bigint")
  handles.push(handle)
  return handle
}
const alive = (handle) => {
  const state = native.wait(handle, 0)
  assert.ok(state === 0 || state === 258, `Unexpected process wait: ${state}`)
  return state === 258
}
const handleCount = () => {
  const buffer = Buffer.alloc(4)
  assert.notEqual(native.handleCount(native.getCurrentProcess(), buffer), 0)
  return buffer.readUInt32LE(0)
}
const Ready = Schema.Struct({ type: Schema.Literal("ready"), pid: ProcessId })
const Family = Schema.Struct({ type: Schema.Literal("family"), pid: ProcessId, descendant: ProcessId })
const Owned = Schema.Struct({ type: Schema.Literal("owned"), pid: ProcessId, child: ProcessId, descendant: ProcessId, name: JobName })
const start = (role) => {
  const child = fork(new URL("./windows-job-worker.cjs", import.meta.url), [role], { execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] })
  children.push(child)
  const messages = []
  let failure
  let stderr = ""
  child.on("message", (message) => messages.push(message))
  child.on("error", (error) => { failure = error })
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-8192) })
  return {
    child,
    async next(schema) {
      await waitUntil(() => {
        if (failure) throw failure
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Owned probe exited: ${stderr}`)
        return messages.length > 0
      }, "owned probe message")
      return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(messages.shift())
    }
  }
}
const status = async (domain) => {
  const observed = await run(jobs.observe(domain.name))
  return executionDomainStatus({ domain, observed })
}

try {
  let emptyDomain
  let releasedJob
  await withJob(async (job) => {
    releasedJob = job
    emptyDomain = job.domain
    check("global_name", job.domain.name.startsWith("Global\\pluginsdk-"))
    check("new_job_empty", (await run(job.observe)).state === "empty")
    check("empty_job_cannot_prove_termination", await status(job.domain) === "unknown")
    const original = crypto.randomBytes
    crypto.randomBytes = () => Buffer.from(job.domain.name.slice(-64), "hex")
    syncBuiltinESMExports()
    try {
      const collision = await run(Effect.scoped(jobs.create).pipe(Effect.result))
      check("name_collision_fails_with_183", collision._tag === "Failure" && collision.failure._tag === "WindowsJobError" && collision.failure.code === 183)
    } finally { crypto.randomBytes = original; syncBuiltinESMExports() }
    check("collision_preserves_original_handle", (await run(job.observe)).state === "empty")
    const invalid = await run(job.assign(ProcessId.make(0xffff_ffff)).pipe(Effect.result))
    check("process_open_error_is_typed", invalid._tag === "Failure" && invalid.failure._tag === "WindowsJobError" && invalid.failure.operation === "OpenProcess" && invalid.failure.code === 87)
    await run(jobs.observe(job.domain.name))
    const before = handleCount()
    for (let index = 0; index < 64; index++) await run(jobs.observe(job.domain.name))
    const after = handleCount()
    detail.repeatedQueries = { count: 64, handlesBefore: before, handlesAfter: after }
    check("queries_close_temporary_handles", after === before)
  })
  const expiredObservation = await run(releasedJob.observe.pipe(Effect.result))
  check("closed_capability_cannot_query_a_reused_handle", expiredObservation._tag === "Failure" && expiredObservation.failure.code === null && expiredObservation.failure.operation === "QueryInformationJobObject")
  const expiredAssignment = await run(releasedJob.assign(ProcessId.make(0xffff_ffff)).pipe(Effect.result))
  check("closed_capability_cannot_assign_a_process", expiredAssignment._tag === "Failure" && expiredAssignment.failure.code === null && expiredAssignment.failure.operation === "AssignProcessToJobObject")
  check("closed_empty_job_absent", (await run(jobs.observe(emptyDomain.name))).state === "absent")
  const fresh = JobName.make(`Global\\pluginsdk-${crypto.randomBytes(32).toString("hex")}`)
  check("unrelated_exact_job_absent", (await run(jobs.observe(fresh))).state === "absent")
  const event = native.createEvent(null, 0, 0, fresh)
  assert.equal(typeof event, "bigint")
  try {
    const wrongObject = await run(jobs.observe(fresh).pipe(Effect.result))
    check("wrong_object_error_is_not_absence", wrongObject._tag === "Failure" && wrongObject.failure._tag === "WindowsJobError" && wrongObject.failure.code === 6)
  } finally { assert.notEqual(native.close(event), 0) }

  let familyDomain
  let familyHandles
  await withJob(async (job) => {
    familyDomain = job.domain
    const executor = start("gated")
    const ready = await executor.next(Ready)
    assert.equal(ready.pid, executor.child.pid)
    await run(job.assign(ready.pid))
    check("assigned_gated_executor_active", await status(job.domain) === "active")
    executor.child.send("go")
    const family = await executor.next(Family)
    familyHandles = [watch(family.pid), watch(family.descendant)]
    check("both_processes_live_before_close", familyHandles.every(alive))
    check("descendant_keeps_job_active", await status(job.domain) === "active")
    detail.closeFamily = family
  })
  await waitUntil(() => familyHandles.every((handle) => !alive(handle)), "scope close kills job family")
  check("scope_close_terminates_executor_and_descendant", familyHandles.every((handle) => !alive(handle)))
  await waitUntil(async () => (await run(jobs.observe(familyDomain.name))).state === "absent", "closed job absent")
  check("closed_family_job_absent", (await run(jobs.observe(familyDomain.name))).state === "absent")

  await withJob(async (job) => {
    const executor = start("gated")
    const ready = await executor.next(Ready)
    await run(job.assign(ready.pid))
    executor.child.send("go")
    const family = await executor.next(Family)
    const watches = [watch(family.pid), watch(family.descendant)]
    executor.child.send("finish")
    await waitUntil(() => watches.every((handle) => !alive(handle)), "graceful family exit")
    check("live_owner_observes_empty_job", (await run(job.observe)).state === "empty")
    check("empty_owned_job_cannot_prove_termination", await status(job.domain) === "unknown")
  })

  const owner = start("owner")
  const owned = await owner.next(Owned)
  assert.equal(owned.pid, owner.child.pid)
  const ownerHandle = watch(owned.pid)
  const family = [watch(owned.child), watch(owned.descendant)]
  const domain = { type: "windows_job", name: owned.name }
  owner.child.disconnect()
  await setTimeout(250)
  check("caller_disconnect_preserves_owner_and_family", [ownerHandle, ...family].every(alive) && await status(domain) === "active")
  owner.child.kill("SIGKILL")
  await waitUntil(() => [ownerHandle, ...family].every((handle) => !alive(handle)), "owner death kills job family")
  check("owner_death_terminates_executor_and_descendant", family.every((handle) => !alive(handle)))
  await waitUntil(async () => (await run(jobs.observe(domain.name))).state === "absent", "dead owner job absent")
  check("dead_owner_job_absent", (await run(jobs.observe(owned.name))).state === "absent")
  check("job_absence_cannot_prove_termination", await status(domain) === "unknown")
  detail.ownerFamily = owned
  console.log(JSON.stringify({ schema: 1, status: "passed", platform: process.platform, arch: process.arch, node: process.versions.node, os: release(), koffi: koffi.version, checks, detail }))
} finally {
  for (const child of children) if (child.connected) child.disconnect()
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  for (const handle of handles) {
    if (alive(handle)) {
      assert.notEqual(native.terminate(handle, 0xc000013a), 0)
      assert.equal(native.wait(handle, 3000), 0)
    }
    assert.notEqual(native.close(handle), 0)
  }
  await runtime.dispose()
}
