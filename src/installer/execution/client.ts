import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Effect, Exit, Layer, Schema } from "effect"
import { HostUnavailable, Installer, type Host, type PlanRequest, type ReviewedPlan } from "../../../contracts/Installer.ts"
import { rejectInvalidBundle, rejectInvalidPlan, snapshotPlan, snapshotRequest } from "../lifecycle/plans.ts"
import { ApplyReply, PlanReply, WorkerRequest } from "./protocol.ts"

const exchange = <S extends Schema.ConstraintDecoder<unknown>>(request: WorkerRequest, reply: S, host: Host) => Effect.gen(function*() {
  const message = yield* Schema.encodeEffect(WorkerRequest)(request).pipe(
    Effect.mapError(() => new HostUnavailable({ host, cause: new Error("Installer worker request could not be encoded") }))
  )
  return yield* Effect.callback<S["Type"], HostUnavailable>((resume) => {
    let child: ChildProcess | undefined
    const failed = () => resume(Effect.fail(new HostUnavailable({ host, cause: new Error("Installer worker disconnected without a valid reply") })))
    const received = (input: unknown) => {
      const decoded = Schema.decodeUnknownExit(reply, { onExcessProperty: "error" })(input)
      resume(Exit.isSuccess(decoded) ? Effect.succeed(decoded.value) : Effect.fail(new HostUnavailable({ host, cause: new Error("Installer worker sent an invalid reply") })))
    }
    try {
      const file = new URL(import.meta.url.endsWith(".ts") ? "./transaction-worker.ts" : "./transaction-worker.js", import.meta.url)
      child = spawn(process.execPath, [fileURLToPath(file)], { detached: true, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] })
      const spawned = child
      spawned.on("error", failed)
      spawned.once("close", () => spawned.off("error", failed))
      spawned.once("exit", failed)
      spawned.once("message", received)
      spawned.send(message, (cause) => { if (cause !== null) failed() })
    } catch { failed() }
    return Effect.sync(() => {
      if (child === undefined) return
      child.off("exit", failed)
      child.off("message", received)
      if (child.connected) child.disconnect()
      child.unref()
    })
  })
})

export const InstallerWorkerLive = Layer.succeed(Installer, Installer.of({
  plan: Effect.fn("Installer.plan.worker")(function*(input: PlanRequest) {
    const snapshot = yield* Effect.try({ try: () => snapshotRequest(input), catch: rejectInvalidBundle })
    const reply = yield* exchange({ schema: 1, type: "plan", input: snapshot }, PlanReply, snapshot.destination.host)
    return yield* Effect.fromResult(reply.result)
  }),
  apply: Effect.fn("Installer.apply.worker")(function*(input: ReviewedPlan) {
    const snapshot = yield* Effect.try({ try: () => snapshotPlan(input), catch: rejectInvalidPlan })
    const reply = yield* exchange({ schema: 1, type: "apply", input: snapshot }, ApplyReply, snapshot.target.destination.host)
    return yield* Effect.fromResult(reply.result)
  })
}))
