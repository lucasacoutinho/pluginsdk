import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir, release } from "node:os"
import { join, win32 } from "node:path"
import { setTimeout as pause } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { Cause, Deferred, Effect, Exit, Fiber, Result, Schema, Stream } from "effect"
import koffi from "koffi"
import { Host, HostUnavailable } from "../../contracts/Installer.ts"
import { Writer } from "../../contracts/Writers.ts"
import { acquireWindowsChannel, ChannelLimits } from "../../src/installer/windows/channels/channel.ts"
import { CommandRequest, WindowsCommands, withWindowsCommands } from "../../src/installer/windows/commands.ts"
import { WindowsJobs, WindowsJobsLive } from "../../src/installer/windows/process/jobs.ts"
import { NativeCommand, openCommandSession } from "../../src/installer/windows/process/native.ts"

assert.equal(process.platform, "win32")
assert.equal(process.arch, "x64")
assert.equal(process.version, "v24.18.0")
assert.equal(koffi.version, "3.3.3")

const stage = process.cwd()
assert.ok(existsSync(join(stage, ".pluginsdk-probe")), "Native checks require an owned isolated stage")
const deadline = Date.now() + 32_000
const root = await mkdtemp(join(tmpdir(), "pluginsdk debug-é-😀-"))
const familyPath = fileURLToPath(new URL("./windows-debug-family.mjs", import.meta.url))
const host = Schema.decodeUnknownSync(Host)("claude_code")
const nodeImage = win32.basename(process.execPath).toLowerCase()
const scenarios = []
const allObservations = []

const remaining = () => {
  const milliseconds = deadline - Date.now()
  assert.ok(milliseconds > 0, "Native command regression exceeded its 32 second deadline")
  return milliseconds
}

const kernel = koffi.load("kernel32.dll")
const api = {
  process: kernel.func("void * __stdcall OpenProcess(uint32_t access, int32_t inherit, uint32_t pid)"),
  pid: kernel.func("uint32_t __stdcall GetProcessId(void *process)"),
  times: kernel.func("int32_t __stdcall GetProcessTimes(void *process, void *created, void *exited, void *kernel, void *user)"),
  image: kernel.func("int32_t __stdcall QueryFullProcessImageNameW(void *process, uint32_t flags, void *name, void *size)"),
  wait: kernel.func("uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t timeout)"),
  exit: kernel.func("int32_t __stdcall GetExitCodeProcess(void *process, void *code)"),
  close: kernel.func("int32_t __stdcall CloseHandle(void *handle)"),
  error: kernel.func("uint32_t __stdcall GetLastError()")
}

const checked = (operation, result) => assert.notEqual(result, 0, `${operation}: ${api.error()}`)

const fixture = async (name, mode = "tree") => {
  const directory = join(root, name)
  await mkdir(directory)
  const settingsPath = join(directory, "settings.json")
  await writeFile(settingsPath, JSON.stringify({ directory, mode }))
  return { name, directory, settingsPath }
}

const request = (application, args, directory) => Schema.decodeUnknownSync(CommandRequest)({
  launch: Schema.decodeUnknownSync(NativeCommand)({ application, args, directory, environment: {} }),
  limits: Schema.decodeUnknownSync(ChannelLimits)({ input: 1_048_576, output: 8_388_608 })
})

const familyRequest = (case_) => request(process.execPath, [familyPath, "--settings", case_.settingsPath], case_.directory)

const hold = (writer, held) => {
  const handle = api.process(0x0010_1000, 0, writer.pid)
  assert.equal(typeof handle, "bigint", `OpenProcess: ${api.error()}`)
  const observer = { writer, handle, image: "" }
  held.push(observer)
  assert.equal(api.pid(handle), writer.pid, "Observer handle PID differs from the writer")
  const created = Buffer.alloc(8)
  checked("GetProcessTimes", api.times(handle, created, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)))
  assert.equal(created.readBigUInt64LE().toString(16).padStart(16, "0"), writer.creation)
  assert.equal(api.wait(handle, 0), 258, "Creation-gate process must still be active")
  const imageBuffer = Buffer.alloc(65_536)
  const imageLength = Buffer.alloc(4)
  imageLength.writeUInt32LE(32_768)
  checked("QueryFullProcessImageNameW", api.image(handle, 0, imageBuffer, imageLength))
  assert.ok(imageLength.readUInt32LE() > 0 && imageLength.readUInt32LE() <= 32_768)
  const imagePath = imageBuffer.toString("utf16le", 0, imageLength.readUInt32LE() * 2)
  observer.image = win32.basename(imagePath).toLowerCase()
  return observer
}

const observe = (held) => held.map(({ writer, handle, image }) => {
  const wait = api.wait(handle, 0)
  assert.equal(wait, 0, `Known process ${writer.pid} remained active during observation`)
  const code = Buffer.alloc(4)
  checked("GetExitCodeProcess", api.exit(handle, code))
  const observation = { pid: writer.pid, creation: writer.creation, image, wait, code: code.readUInt32LE() }
  allObservations.push(observation)
  return observation
})

const waitForObservers = async (held) => {
  while (true) {
    const waits = held.map(({ writer, handle }) => {
      const wait = api.wait(handle, 0)
      assert.ok(wait === 0 || wait === 258, `WaitForSingleObject(${writer.pid}) returned ${wait}`)
      return wait
    })
    if (waits.every((wait) => wait === 0)) return
    assert.ok(Date.now() < deadline, "A known process remained active at the native regression deadline")
    await pause(2)
  }
}

const closeObservers = (held) => {
  for (const { handle } of held) {
    assert.equal(api.wait(handle, 0), 0, "Observer cannot close before its exact process handle signals")
    checked("CloseHandle(observer)", api.close(handle))
  }
}

const releaseObservers = (held) => Effect.uninterruptible(Effect.promise(async () => {
  await waitForObservers(held)
  closeObservers(held)
}))

const observedUse = (held, effect) => Effect.acquireUseRelease(
  Effect.succeed(held),
  () => Effect.gen(function*() {
    const value = yield* effect
    yield* Effect.promise(() => waitForObservers(held))
    return { value, observations: observe(held) }
  }),
  (resources) => releaseObservers(resources)
).pipe(Effect.scoped)

const markerEntries = async (directory) => {
  const markers = (await readdir(directory)).filter((name) => name.endsWith(".started"))
  return Promise.all(markers.map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8"))))
}

const expectedRetentionFailure = (message) => new HostUnavailable({ host, cause: new Error(message) })

const ownedRun = async (case_, options = {}) => {
  const held = []
  const acknowledgements = []
  const denied = []
  const ledgerPath = join(case_.directory, "writers.json")
  const interrupted = await Effect.runPromise(Deferred.make())
  let rootPid

  const writeLedger = (writers) => Effect.tryPromise({
    try: async () => {
      const file = await open(ledgerPath, "w")
      try {
        await file.writeFile(JSON.stringify(writers))
        await file.sync()
      } finally {
        await file.close()
      }
    },
    catch: (cause) => new HostUnavailable({ host, cause })
  })

  const retain = (writers) => Effect.gen(function*() {
    const parsed = Schema.decodeUnknownSync(Schema.Array(Writer))(writers)
    assert.equal(parsed.length, held.length + 1, "Retained writer ledger did not grow by one")
    assert.deepEqual(parsed.slice(0, -1), held.map(({ writer }) => writer), "Retained writer ledger changed an earlier witness")
    const writer = parsed.at(-1)
    assert.ok(writer)
    const observer = hold(writer, held)
    if (rootPid === undefined) rootPid = writer.pid
    const marker = join(case_.directory, `${writer.pid}.started`)
    assert.equal(existsSync(marker), false, "Process executed before its retention callback")
    yield* Effect.sleep("20 millis")
    assert.equal(existsSync(marker), false, "Process executed while retention was pending")

    const rejectRoot = options.rejectRoot === true && writer.pid === rootPid
    const rejectNode = options.rejectNode === true && writer.pid !== rootPid && observer.image === nodeImage
    if (rejectRoot || rejectNode) {
      denied.push({ pid: writer.pid, image: observer.image, creation: writer.creation })
      return yield* Effect.fail(expectedRetentionFailure(rejectRoot ? "intentional root retention failure" : "intentional Node descendant retention failure"))
    }
    if (options.interrupt === true) {
      denied.push({ pid: writer.pid, image: observer.image, creation: writer.creation })
      yield* Deferred.succeed(interrupted, writer.pid)
      return yield* Effect.never
    }

    yield* writeLedger(parsed)
    yield* Effect.sync(() => { acknowledgements.push(parsed) })
  })

  const defaultProgram = Effect.gen(function*() {
    const commands = yield* WindowsCommands
    return yield* commands.run(options.request, (channel) => Effect.gen(function*() {
      yield* channel.endInput
      yield* Stream.runDrain(channel.output)
      return yield* channel.exitCode
    }))
  })

  let interruptedExit
  const program = options.interrupt === true
    ? Effect.gen(function*() {
      const commands = yield* WindowsCommands
      const fiber = yield* Effect.forkScoped(commands.run(options.request, (channel) => Effect.gen(function*() {
        yield* channel.endInput
        yield* Stream.runDrain(channel.output)
        return yield* channel.exitCode
      })))
      yield* Deferred.await(interrupted)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      yield* Effect.sync(() => { interruptedExit = exit })
    })
    : defaultProgram

  const withOwner = Effect.timeout(remaining())(withWindowsCommands(host, retain, program))
  const outcome = Effect.result(withOwner)
  const run = observedUse(held, outcome)
  const result = await Effect.runPromise(run)
  const markers = await markerEntries(case_.directory)
  return { ...result, held, acknowledgements, denied, rootPid, markers, interruptedExit, ledgerPath }
}

const assertSuccessfulOutcome = (name, outcome, code) => {
  assert.ok(Result.isSuccess(outcome), `${name} command failed: ${Result.isFailure(outcome) ? outcome.failure._tag : "unknown"}`)
  assert.equal(outcome.success, code, `${name} returned an unexpected exit status`)
}

const releaseNativeCleanup = (native) => Effect.uninterruptible(Effect.gen(function*() {
  yield* Effect.sync(() => native.terminate())
  while (true) {
    const event = yield* Effect.sync(() => native.poll())
    if (event !== null) yield* Effect.sync(() => native.continueEvent(event, "unhandled"))
    else if (yield* Effect.sync(() => native.finished())) break
    assert.ok(Date.now() < deadline, "Native boundary cleanup exceeded the regression deadline")
    yield* Effect.yieldNow
  }
  yield* Effect.sync(() => native.close())
}))

const boundaryCase = (case_) => {
  const held = []
  const launch = request(process.execPath, ["-e", ""], case_.directory).launch
  const nativeEffect = Effect.scoped(Effect.gen(function*() {
    const jobs = yield* WindowsJobs
    const job = yield* jobs.create
    const channel = yield* acquireWindowsChannel(host, Schema.decodeUnknownSync(ChannelLimits)({ input: 1_048_576, output: 8_388_608 }))
    const native = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => openCommandSession(launch, job.domain.name, channel.child),
        catch: (cause) => new HostUnavailable({ host, cause })
      }),
      (session) => releaseNativeCleanup(session)
    )
    yield* channel.closeChildren

    let event
    while (event === undefined) {
      const polled = yield* Effect.sync(() => native.poll())
      if (polled !== null) event = polled
      else {
        assert.ok(Date.now() < deadline, "Native boundary did not receive its root creation event")
        yield* Effect.sleep("1 millis")
      }
    }
    assert.equal(event.type, "create_process")
    assert.equal(event.pid, native.root)
    hold(event.writer, held)
    assert.throws(() => native.poll(), /pending debug event/u)
    assert.throws(() => native.close(), /pending debug event/u)
    assert.throws(() => native.continueEvent({ ...event, pid: event.pid + 1 }, "handled"), /does not match the pending debug event/u)
    return { root: native.root, pending: event }
  }).pipe(Effect.provide(WindowsJobsLive)))

  return observedUse(held, Effect.gen(function*() {
    const result = yield* Effect.timeout(remaining())(nativeEffect)
    assert.equal(result.pending.type, "create_process")
    assert.equal(result.root, result.pending.pid)
    const markers = yield* Effect.promise(() => markerEntries(case_.directory))
    assert.deepEqual(markers, [], "Root startup marker appeared before its creation event was continued")
    return { rootPid: result.root, pendingEventGuards: true, abortBeforeContinuation: true }
  }))
}

try {
  const stock = await fixture("stock-command")
  const stockRequest = request(process.execPath, ["-e", ""], stage)
  const stockResult = await ownedRun(stock, { request: stockRequest })
  assertSuccessfulOutcome(stock.name, stockResult.value, 0)
  assert.equal(stockResult.observations[0]?.image, nodeImage)
  assert.deepEqual(JSON.parse(await readFile(stockResult.ledgerPath, "utf8")), stockResult.held.map(({ writer }) => writer))
  scenarios.push({ name: stock.name, status: "passed", exitCode: stockResult.value.success, observers: stockResult.observations })

  const boundary = await fixture("pending-create-boundary")
  const boundaryResult = await Effect.runPromise(boundaryCase(boundary))
  assert.ok(boundaryResult.value.pendingEventGuards)
  assert.ok(boundaryResult.value.abortBeforeContinuation)
  scenarios.push({ name: boundary.name, status: "passed", ...boundaryResult.value, observers: boundaryResult.observations })

  const family = await fixture("process-family")
  const familyResult = await ownedRun(family, { request: familyRequest(family) })
  assertSuccessfulOutcome(family.name, familyResult.value, 0)
  assert.equal(familyResult.markers.length, 5)
  assert.deepEqual(familyResult.markers.map(({ role }) => role).sort(), ["root", "ordinary", "detached", "ordinary-leaf", "detached-leaf"].sort())
  const authorized = familyResult.acknowledgements.at(-1)
  assert.ok(authorized)
  assert.ok(familyResult.markers.every(({ pid }) => authorized.some(({ pid: authorizedPid }) => authorizedPid === pid)))
  for (const { pid } of familyResult.markers) {
    const observation = familyResult.observations.find(({ pid: observedPid }) => observedPid === pid)
    assert.ok(observation, `Family process ${pid} was not independently observed`)
    assert.equal(observation.code, 0, `Family process ${pid} did not exit normally`)
  }
  assert.deepEqual(JSON.parse(await readFile(familyResult.ledgerPath, "utf8")), familyResult.held.map(({ writer }) => writer))
  assert.ok(familyResult.held.length >= familyResult.markers.length)
  scenarios.push({ name: family.name, status: "passed", exitCode: familyResult.value.success, markers: familyResult.markers, observers: familyResult.observations })

  const rejectRoot = await fixture("reject-root")
  const rejectRootResult = await ownedRun(rejectRoot, { request: familyRequest(rejectRoot), rejectRoot: true })
  assert.ok(Result.isFailure(rejectRootResult.value))
  assert.equal(rejectRootResult.value.failure._tag, "HostUnavailable")
  assert.equal(rejectRootResult.acknowledgements.length, 0)
  assert.equal(rejectRootResult.denied.length, 1)
  assert.equal(rejectRootResult.denied[0]?.pid, rejectRootResult.rootPid)
  assert.equal(rejectRootResult.denied[0]?.image, nodeImage)
  assert.ok(!rejectRootResult.markers.some(({ pid }) => pid === rejectRootResult.denied[0]?.pid))
  assert.deepEqual(rejectRootResult.markers, [])
  scenarios.push({ name: rejectRoot.name, status: "passed", rejectedBeforeMarker: rejectRootResult.denied[0], observers: rejectRootResult.observations })

  const rejectNode = await fixture("reject-node-descendant")
  const rejectNodeResult = await ownedRun(rejectNode, { request: familyRequest(rejectNode), rejectNode: true })
  assert.ok(Result.isFailure(rejectNodeResult.value))
  assert.equal(rejectNodeResult.value.failure._tag, "HostUnavailable")
  assert.equal(rejectNodeResult.denied.length, 1)
  assert.ok(rejectNodeResult.denied.every(({ pid, image }) => pid !== rejectNodeResult.rootPid && image === nodeImage))
  assert.ok(rejectNodeResult.markers.some(({ pid, role }) => pid === rejectNodeResult.rootPid && role === "root"))
  assert.ok(rejectNodeResult.denied.every(({ pid }) => !rejectNodeResult.markers.some(({ pid: markerPid }) => markerPid === pid)))
  assert.equal(rejectNodeResult.acknowledgements.at(-1)?.length, rejectNodeResult.held.length - 1)
  scenarios.push({ name: rejectNode.name, status: "passed", rejectedNodeDescendants: rejectNodeResult.denied, markers: rejectNodeResult.markers, observers: rejectNodeResult.observations })

  const interrupt = await fixture("interrupt-retention")
  const interruptResult = await ownedRun(interrupt, { request: familyRequest(interrupt), interrupt: true })
  assert.ok(Result.isFailure(interruptResult.value))
  assert.equal(interruptResult.value.failure._tag, "HostUnavailable")
  assert.equal(interruptResult.acknowledgements.length, 0)
  assert.equal(interruptResult.denied.length, 1)
  assert.ok(interruptResult.interruptedExit)
  assert.equal(Exit.isFailure(interruptResult.interruptedExit), true)
  assert.equal(Cause.hasInterrupts(interruptResult.interruptedExit.cause), true)
  assert.deepEqual(interruptResult.markers, [])
  scenarios.push({ name: interrupt.name, status: "passed", interruptedWriter: interruptResult.denied[0], interruptedFiber: true, observers: interruptResult.observations })

  const breakpoint = await fixture("unhandled-debugbreak", "nativeDebugBreak")
  const breakpointResult = await ownedRun(breakpoint, { request: familyRequest(breakpoint) })
  assertSuccessfulOutcome(breakpoint.name, breakpointResult.value, 0x8000_0003)
  const rootObservation = breakpointResult.observations.find(({ pid }) => pid === breakpointResult.rootPid)
  assert.ok(rootObservation)
  assert.equal(rootObservation.code, 0x8000_0003)
  assert.ok(breakpointResult.markers.some(({ pid, role }) => pid === breakpointResult.rootPid && role === "root"))
  assert.equal(existsSync(join(breakpoint.directory, "after-exception")), false)
  scenarios.push({ name: breakpoint.name, status: "passed", rootExitCode: rootObservation.code, afterExceptionMarker: false, observers: breakpointResult.observations })
} finally {
  await rm(root, { recursive: true, force: true })
}

assert.equal(scenarios.length, 7)
assert.ok(allObservations.every(({ wait }) => wait === 0))
console.log(JSON.stringify({
  schema: 1,
  status: "native_process_regressions_passed",
  platform: release(),
  node: process.version,
  arch: process.arch,
  koffi: koffi.version,
  scenarios,
  observers: allObservations,
  allKnownProcessesExited: true,
  engineIntegrationTested: false,
  clientLifecycleTested: false
}))
