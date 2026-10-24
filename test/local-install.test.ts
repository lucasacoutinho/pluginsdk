import { Effect, Result, Schema } from "effect"
import { expect, it } from "vitest"
import { PlanBody, PlanId, ReadyPlan, RepairPlan, RepairPlanBody, StateUnavailable } from "../contracts/Installer.ts"
import { planId } from "../src/internal/identity.ts"
import { makeLocalInstallation } from "../src/installer/local/install.ts"

const body = Schema.decodeSync(PlanBody)({
  type: "ready", schema: 1,
  target: {
    key: "local-worker-test", plugin: "worker-example", profile: "claude-local-marketplace:1", version: "2.1.304",
    destination: { type: "user", host: "claude_code", home: "C:\\isolated\\é🙂\\.cursor" }
  },
  before: {
    revision: "1".repeat(64),
    receipt: { identity: { plan: "1".repeat(64), bundle: "2".repeat(64) }, fingerprint: "3".repeat(64) },
    observed: { type: "present", identity: { plan: "1".repeat(64), bundle: "2".repeat(64) }, fingerprint: "3".repeat(64) }
  },
  change: { type: "remove" }
})
const plan = Schema.decodeSync(Schema.toType(ReadyPlan))({ ...body, id: planId(body) })

it("constructs local installation without I/O and refuses invalid execution and recovery plans before using its dependencies", async () => {
  let calls = 0
  const unexpected = (): never => { calls += 1; throw new Error("Unexpected dependency call") }
  const installation = makeLocalInstallation(
    { read: unexpected, observe: unexpected },
    { move: unexpected, prepare: unexpected },
    { write: unexpected, allocate: unexpected }
  )
  expect(calls).toBe(0)
  const repairBody = Schema.decodeSync(RepairPlanBody)({ type: "repair_ready", schema: 1, target: plan.target,
    before: { interrupted: plan.id, pending: plan.id, observed: { residual: "local", fingerprint: "4".repeat(64) } } })
  const repair = Schema.decodeSync(Schema.toType(RepairPlan))({ ...repairBody, id: planId(repairBody) })
  const wrongBody = Schema.decodeSync(Schema.toType(RepairPlanBody))({ ...repairBody, before: { ...repairBody.before, observed: { ...repairBody.before.observed, residual: "marketplace" } } })
  const wrongAdapter = Schema.decodeSync(Schema.toType(RepairPlan))({ ...wrongBody, id: planId(wrongBody) })
  const invalid = { ...plan, id: PlanId.make("f".repeat(64)) }
  for (const operation of [installation.execute(invalid), installation.inspectRecovery(invalid).pipe(Effect.asVoid),
    installation.recover({ ...repair, id: PlanId.make("f".repeat(64)) }), installation.recover(wrongAdapter)]) {
    const result = await Effect.runPromise(Effect.result(operation))
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(StateUnavailable)
  }
  expect(calls).toBe(0)
})
