import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { JobName } from "../contracts/Execution.ts"
import { executionQuiescent } from "../src/installer/execution/execute.ts"
import { Execution, StoredState } from "../src/installer/lifecycle/records.ts"
import { executionPlan } from "./fixtures/execution-plan.ts"

const decode = Schema.decodeUnknownSync(Execution, { onExcessProperty: "error" })

it("preserves the legacy Linux witness schema", () => {
  const legacy = { type: "running", group: 17, boot: "boot-a" }
  expect(Schema.encodeSync(Execution)(decode(legacy))).toEqual(legacy)
  expect(decode({ ...legacy, group: Number.MAX_SAFE_INTEGER, boot: "legacy\nboot" })).toEqual({ ...legacy, group: Number.MAX_SAFE_INTEGER, boot: "legacy\nboot" })
})

it("retains a distinct global Windows job witness in pending records", () => {
  const plan = executionPlan("/fixture")
  const execution = { type: "windows_running", name: `Global\\pluginsdk-${"a".repeat(64)}` }
  const previous = { type: "installed", receipt: plan.before.receipt }
  const record = { schema: 1, type: "pending", plan, execution, journal: { type: "pending", plan: plan.id, previous, observed: plan.before.observed, change: { type: "remove" } } }
  const parsed = Schema.decodeSync(StoredState, { onExcessProperty: "error" })(Schema.encodeUnknownSync(StoredState)(record))
  if (parsed.type !== "pending") throw new Error("Expected a retained pending record")
  expect(parsed.execution).toEqual(execution)
  expect(() => decode({ ...execution, name: execution.name.replace("Global", "Local") })).toThrow()
  expect(() => decode({ ...execution, group: 17 })).toThrow()
  expect(() => decode({ type: "running", name: execution.name })).toThrow()
})

it.effect("keeps job-only records pending and rejects foreign process-group evidence", () => Effect.gen(function*() {
  const target = executionPlan("/fixture").target
  expect(yield* executionQuiescent(target, { type: "prepared" })).toBe(true)
  expect(yield* executionQuiescent(target, { type: "windows_running", name: JobName.make(`Global\\pluginsdk-${"a".repeat(64)}`) })).toBe(false)
  if (process.platform !== "win32") {
    expect(yield* executionQuiescent(target, { type: "windows_writers", writers: [] })).toBe(false)
  }
  if (process.platform !== "linux") {
    expect(yield* executionQuiescent(target, { type: "running", group: 17, boot: "different-platform" })).toBe(false)
  }
}))
