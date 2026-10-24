import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { BundleDigest } from "../contracts/Compiler.ts"
import { FileDigest } from "../contracts/CompilerModel.ts"
import { Fingerprint, PlanId, type PlanBody, type ReadyPlan, type RepairPlanBody } from "../contracts/Installer.ts"
import { ProjectTarget, projectRegistration } from "../src/installer/project/layout.ts"
import { planId } from "../src/internal/identity.ts"
import { snapshotPlan } from "../src/installer/lifecycle/plans.ts"

const target = Schema.decodeSync(ProjectTarget)({
  key: "a".repeat(64),
  destination: { type: "project", host: "codex", home: "/tmp/psdk-codex-home", root: "/tmp/psdk-project" },
  plugin: "project-plan-fixture",
  profile: "codex-project-cache:1",
  version: "0.163.0"
})
const previous = PlanId.make("b".repeat(64))
const identity = { plan: previous, bundle: BundleDigest.make("c".repeat(64)) }
const receipt = { identity, fingerprint: Fingerprint.make("d".repeat(64)) }
const body: PlanBody = {
  type: "ready", schema: 1, target,
  before: { revision: previous, receipt, observed: { type: "present", ...receipt } },
  change: { type: "remove" },
  project: {
    before: { type: "file", digest: FileDigest.make("e".repeat(64)), mode: 0o640 },
    previous: projectRegistration(target, previous)
  }
}
const ready = (body: PlanBody): ReadyPlan => ({ ...body, id: planId(body) })

it("commits the complete reviewed config digest and mode to the plan identity", () => {
  const baseline = ready(body)
  const mode = ready({ ...body, project: { before: { type: "file", digest: FileDigest.make("e".repeat(64)), mode: 0o600 }, previous: projectRegistration(target, previous) } })
  const digest = ready({ ...body, project: { before: { type: "file", digest: FileDigest.make("f".repeat(64)), mode: 0o640 }, previous: projectRegistration(target, previous) } })
  expect(new Set([baseline.id, mode.id, digest.id]).size).toBe(3)
  expect(snapshotPlan(baseline)).toEqual(baseline)
  expect(() => snapshotPlan({ ...mode, id: baseline.id })).toThrow("Plan commitment differs")
})

it("requires the previous registration derived from the retained receipt and the correct destination", () => {
  const { project: _capture, ...withoutCapture } = body
  expect(() => snapshotPlan(ready(withoutCapture))).toThrow("requires its config capture")
  expect(() => snapshotPlan(ready({
    ...body,
    project: { before: { type: "absent" }, previous: projectRegistration(target, PlanId.make("f".repeat(64))) }
  }))).toThrow("does not bind the previous revision")
  expect(() => snapshotPlan(ready({
    ...body,
    target: { ...target, destination: { type: "user", host: "codex", home: target.destination.home } }
  }))).toThrow("belongs to a Codex project destination")
})

it("refuses native user marketplace cleanup through a project repair plan", () => {
  const repair: RepairPlanBody = {
    type: "repair_ready", schema: 1, target,
    before: {
      interrupted: previous, pending: previous,
      observed: { residual: "marketplace", fingerprint: receipt.fingerprint }
    }
  }
  expect(() => snapshotPlan({ ...repair, id: planId(repair) })).toThrow("confirmed inactive plugin state")
  const inactive: RepairPlanBody = { ...repair, before: { ...repair.before, observed: { ...repair.before.observed, residual: "absent" } } }
  expect(snapshotPlan({ ...inactive, id: planId(inactive) }).type).toBe("repair_ready")
})
