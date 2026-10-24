import { BundleDigest } from "../../contracts/Compiler.ts"
import { Fingerprint, InstallationKey, PlanId, type PlanBody, type ReadyPlan } from "../../contracts/Installer.ts"
import { Directory, PluginId } from "../../contracts/Plugin.ts"
import { planId } from "../../src/internal/identity.ts"

export const executionPlan = (home: string): ReadyPlan => {
  const identity = { plan: PlanId.make("a".repeat(64)), bundle: BundleDigest.make("b".repeat(64)) }
  const fingerprint = Fingerprint.make("c".repeat(64))
  const body: PlanBody = {
    type: "ready", schema: 1,
    target: { key: InstallationKey.make("execution-fixture"), destination: { type: "user", host: "codex", home: Directory.make(home) }, plugin: PluginId.make("execution-fixture"), profile: "fixture:1", version: "fixture" },
    before: { revision: identity.plan, receipt: { identity, fingerprint }, observed: { type: "present", identity, fingerprint } },
    change: { type: "remove" }
  }
  return { ...body, id: planId(body) }
}
