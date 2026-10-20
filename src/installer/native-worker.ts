import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Schema } from "effect"
import { planId } from "../internal/identity.ts"
import { validateBundle } from "../compiler/native.ts"
import { ExecuteRequest } from "./records.ts"
import { executeChange } from "./recipe.ts"

let started = false
process.on("disconnect", () => { if (!started) process.exit(0) })
process.once("message", (message: unknown) => {
  const request = Schema.decodeUnknownExit(ExecuteRequest)(message, { onExcessProperty: "error" })
  if (Exit.isFailure(request)) { process.exitCode = 1; process.disconnect(); return }
  const { plan } = request.value
  if (plan.id !== planId(plan)) { process.exitCode = 1; process.disconnect(); return }
  if (plan.change.type !== "remove") validateBundle(plan.change.bundle)
  started = true
  Effect.runPromiseExit(executeChange(plan).pipe(Effect.provide(NodeServices.layer))).then((exit) => {
    process.exitCode = Exit.isSuccess(exit) ? 0 : 1
    if (process.connected) process.disconnect()
  })
})
