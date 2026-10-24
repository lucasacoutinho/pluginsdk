import { fork } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import type { Scope } from "effect/Scope"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import { HostUnavailable, StateUnavailable, type ReviewedPlan, type Target } from "../../../contracts/Installer.ts"
import { writerCompletion } from "../../internal/process/model.ts"
import { ExecuteRequest, StoredState, type Execution } from "../lifecycle/records.ts"
import { readRecord, stateIO } from "../storage.ts"
import { targetPaths } from "../target/resolve.ts"
import { executeChange } from "../lifecycle/recipe.ts"
import { withWindowsCommands } from "../windows/commands.ts"
import { observeWindowsWriters } from "../../internal/process/windows.ts"

const bootId = () => readFile("/proc/sys/kernel/random/boot_id", "utf8").then((value) => value.trim())

export const executionQuiescent = Effect.fn("Installer.executionQuiescent")((
  target: Target,
  execution: Execution
): Effect.Effect<boolean, StateUnavailable> => Match.value(execution).pipe(
  Match.discriminatorsExhaustive("type")({
    prepared: () => Effect.succeed(true),
    running: (execution) => process.platform !== "linux" ? Effect.succeed(false) : stateIO(target.key, async () => {
      if (await bootId() !== execution.boot) return true
      try { process.kill(-execution.group, 0); return false }
      catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ESRCH") return true
        return false
      }
    }),
    windows_running: () => Effect.succeed(false),
    windows_writers: ({ writers }) => process.platform !== "win32" ? Effect.succeed(false) : observeWindowsWriters(writers).pipe(
      Effect.mapError(({ cause }) => new StateUnavailable({ key: target.key, cause })),
      Effect.map((observed) => Match.value(writerCompletion({ writers, observed })).pipe(
        Match.when("complete", () => true),
        Match.whenOr("active", "unknown", () => false),
        Match.exhaustive
      ))
    )
  })
))

export const checkOtherExecutions = Effect.fnUntraced(function*(target: Target) {
  const paths = targetPaths(target)
  const directories = yield* stateIO(target.key, async () => {
    try { return await readdir(join(paths.store, "installations")) }
    catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return []
      throw cause
    }
  })
  for (const directory of directories) {
    const record = yield* readRecord(target.key, join(paths.store, "installations", directory, "state.json"), StoredState)
    if (record !== null && record.type !== "idle" && record.plan.target.key !== target.key && !(yield* executionQuiescent(record.plan.target, record.execution))) {
      return yield* new StateUnavailable({ key: target.key, cause: new Error("Another native execution still holds shared host state") })
    }
  }
})

const encodeExecute = Schema.encodeSync(ExecuteRequest)

const executeLinux = Effect.fnUntraced(function*(
  plan: ReviewedPlan,
  leases: ReadonlyArray<number>,
  retain: (execution: Execution) => Effect.Effect<void, StateUnavailable>
) {
  const key = plan.target.key
  const child = yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        const file = new URL(import.meta.url.endsWith(".ts") ? "./native-worker.ts" : "./native-worker.js", import.meta.url)
        const child = fork(file, [], { execArgv: [], detached: true, stdio: ["ignore", "ignore", "ignore", ...leases, "ipc"] })
        child.on("error", () => {})
        return child
      },
      catch: (cause) => new StateUnavailable({ key, cause })
    }),
    (child) => Effect.sync(() => {
      if (child.connected) child.disconnect()
      child.unref()
    })
  )
  const group = child.pid
  if (group === undefined) return yield* new StateUnavailable({ key, cause: new Error("Native execution could not start") })
  const boot = yield* stateIO(key, bootId)
  yield* retain({ type: "running", group, boot })
  yield* Effect.callback<void, StateUnavailable>((resume) => {
    child.send(encodeExecute({ plan }), (cause) => resume(cause === null ? Effect.void : Effect.fail(new StateUnavailable({ key, cause }))))
  })
  yield* Effect.callback<void, StateUnavailable>((resume) => {
    if (child.exitCode !== null || child.signalCode !== null) { resume(Effect.void); return }
    const exited = () => resume(Effect.void)
    const failed = (cause: Error) => resume(Effect.fail(new StateUnavailable({ key, cause })))
    child.once("exit", exited)
    child.once("error", failed)
    return Effect.sync(() => { child.off("exit", exited); child.off("error", failed) })
  })
})

export const executeOnce = Effect.fn("Installer.executeOnce")((
  plan: ReviewedPlan,
  leases: ReadonlyArray<number>,
  retain: (execution: Execution) => Effect.Effect<void, StateUnavailable>
): Effect.Effect<void, StateUnavailable, Scope | ChildProcessSpawner> => {
  if (process.platform === "linux") return executeLinux(plan, leases, retain)
  if (process.platform === "win32") return withWindowsCommands(
    plan.target.destination.host,
    (writers) => retain({ type: "windows_writers", writers }).pipe(
      Effect.mapError((cause) => new HostUnavailable({ host: plan.target.destination.host, cause }))
    ),
    executeChange(plan)
  ).pipe(
    Effect.mapError((cause) => cause instanceof StateUnavailable ? cause : new StateUnavailable({ key: plan.target.key, cause }))
  )
  return Effect.fail(new StateUnavailable({ key: plan.target.key, cause: new Error("Native execution is unavailable on this platform") }))
})
