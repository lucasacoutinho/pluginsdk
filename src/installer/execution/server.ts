import { Effect, Match, Schema } from "effect"
import { Installer } from "../../../contracts/Installer.ts"
import type { WorkerSignal, WorkerState } from "../../../contracts/Worker.ts"
import { admitWorkerRequest } from "./admission.ts"
import { ApplyReply, PlanReply, WorkerRequest } from "./protocol.ts"

const Admission = Schema.Union([
  Schema.Struct({ type: Schema.Literal("accepted"), request: WorkerRequest }),
  Schema.Struct({ type: Schema.Literal("stopped"), code: Schema.Literals([0, 1]) })
]).pipe(Schema.toTaggedUnion("type"))

const receive = Effect.callback<typeof Admission.Type>((resume) => {
  let state: WorkerState = "waiting"
  const advance = (signal: WorkerSignal) => {
    const step = admitWorkerRequest({ state, signal })
    state = step.state
    return step.action
  }
  const stop = (signal: "invalid" | "disconnect", code: 0 | 1) => Match.value(advance(signal)).pipe(
    Match.when("stop", () => resume(Effect.succeed({ type: "stopped", code }))),
    Match.whenOr("start", "ignore", () => {}), Match.exhaustive
  )
  const disconnected = () => stop("disconnect", 0)
  const message = (input: unknown) => Match.value(Schema.decodeUnknownResult(WorkerRequest, { onExcessProperty: "error" })(input)).pipe(
    Match.tagsExhaustive({
      Failure: () => stop("invalid", 1),
      Success: ({ success: request }) => Match.value(advance("request")).pipe(
        Match.when("start", () => resume(Effect.succeed({ type: "accepted", request }))),
        Match.when("stop", () => resume(Effect.succeed({ type: "stopped", code: 1 }))),
        Match.when("ignore", () => {}), Match.exhaustive
      )
    })
  )
  process.on("message", message)
  process.on("disconnect", disconnected)
  if (!process.connected) disconnected()
  return Effect.sync(() => { process.off("message", message); process.off("disconnect", disconnected) })
})

const send = (message: typeof PlanReply.Encoded | typeof ApplyReply.Encoded) => Effect.callback<boolean>((resume) => {
  if (!process.connected || process.send === undefined) { resume(Effect.succeed(false)); return }
  try { process.send(message, undefined, undefined, (cause) => resume(Effect.succeed(cause === null))) }
  catch { resume(Effect.succeed(false)) }
})

export const installerWorker = Effect.gen(function*() {
  const admission = yield* receive
  return yield* Match.value(admission).pipe(Match.discriminatorsExhaustive("type")({
    stopped: ({ code }) => Effect.succeed(code),
    accepted: ({ request }) => Effect.gen(function*() {
      const installer = yield* Installer
      const reply = yield* Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
        plan: ({ input }) => Effect.result(installer.plan(input)).pipe(Effect.flatMap((result) => Schema.encodeEffect(PlanReply)({ schema: 1, type: "plan", result })), Effect.orDie),
        apply: ({ input }) => Effect.result(installer.apply(input)).pipe(Effect.flatMap((result) => Schema.encodeEffect(ApplyReply)({ schema: 1, type: "apply", result })), Effect.orDie)
      }))
      return (yield* send(reply)) ? 0 : 1
    })
  }))
}).pipe(Effect.ensuring(Effect.sync(() => { if (process.connected) process.disconnect() })))
