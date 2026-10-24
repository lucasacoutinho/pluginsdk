import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Schema } from "effect"
import type { ReviewedPlan } from "../../../contracts/Installer.ts"
import { validatePlan } from "../lifecycle/plans.ts"
import { ExecuteRequest } from "../lifecycle/records.ts"
import { executeChange } from "../lifecycle/recipe.ts"

let started = false
process.on("disconnect", () => { if (!started) process.exit(process.exitCode ?? 0) })
const finish = (code: 0 | 1) => {
  process.exitCode = code
  if (process.connected) process.disconnect()
}
const execute = (plan: ReviewedPlan) => {
  try { validatePlan(plan) }
  catch { finish(1); return }
  started = true
  Effect.runPromiseExit(executeChange(plan).pipe(Effect.provide(NodeServices.layer))).then((exit) => {
    finish(Exit.isSuccess(exit) ? 0 : 1)
  })
}

if (process.argv.length > 2) {
  finish(1)
} else {
  process.once("message", (message: unknown) => {
    const request = Schema.decodeUnknownExit(ExecuteRequest)(message, { onExcessProperty: "error" })
    if (Exit.isFailure(request)) finish(1)
    else execute(request.value.plan)
  })
}
