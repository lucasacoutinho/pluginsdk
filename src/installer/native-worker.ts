import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Schema } from "effect"
import { validatePlan } from "./plan.ts"
import { ExecuteRequest } from "./records.ts"
import { executeChange } from "./recipe.ts"

let started = false
process.on("disconnect", () => { if (!started) process.exit(0) })
process.once("message", (message: unknown) => {
  const request = Schema.decodeUnknownExit(ExecuteRequest)(message, { onExcessProperty: "error" })
  if (Exit.isFailure(request)) { process.exitCode = 1; process.disconnect(); return }
  const { plan } = request.value
  try { validatePlan(plan) }
  catch { process.exitCode = 1; process.disconnect(); return }
  started = true
  Effect.runPromiseExit(executeChange(plan).pipe(Effect.provide(NodeServices.layer))).then((exit) => {
    process.exitCode = Exit.isSuccess(exit) ? 0 : 1
    if (process.connected) process.disconnect()
  })
})
