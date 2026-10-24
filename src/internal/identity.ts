import { createHash } from "node:crypto"
import { Match, Schema } from "effect"
import { Bundle, BundleBody, BundleDigest, type PackageFile } from "../../contracts/Compiler.ts"
import { FileDigest } from "../../contracts/CompilerModel.ts"
import { CompanionCapture } from "../../contracts/Companions.ts"
import { Fingerprint, PlanBody as PlanBodySchema, PlanId, RepairPlanBody as RepairPlanBodySchema } from "../../contracts/Installer.ts"
import type { PlanBody, RepairPlanBody } from "../../contracts/Installer.ts"
import { canonicalJson, type Json } from "./json.ts"

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

export const fileDigest = (bytes: Uint8Array): FileDigest => FileDigest.make(sha256(bytes))

export const commitment = (domain: string, body: Json): string =>
  createHash("sha256").update(`pluginsdk:${domain}:1\0`).update(canonicalJson(body)).digest("hex")

export const bundleDigest = (bundle: BundleBody): BundleDigest => BundleDigest.make(
  commitment("bundle", Schema.encodeSync(BundleBody)({
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files: bundle.files
  }))
)

export const planId = (plan: PlanBody | RepairPlanBody): PlanId => Match.value(plan).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: (plan): PlanId => PlanId.make(commitment("plan", Schema.encodeSync(PlanBodySchema)({
      type: plan.type,
      schema: plan.schema,
      target: plan.target,
      before: plan.before,
      change: plan.change,
      ...(plan.companions === undefined ? {} : { companions: plan.companions }),
      ...(plan.project === undefined ? {} : { project: plan.project })
    }))),
    repair_ready: (plan): PlanId => PlanId.make(commitment("plan", Schema.encodeSync(RepairPlanBodySchema)({
      type: plan.type,
      schema: plan.schema,
      target: plan.target,
      before: plan.before,
      ...(plan.companions === undefined ? {} : { companions: plan.companions })
    })))
  })
)

export const fingerprint = (profile: string, value: Json): Fingerprint =>
  Fingerprint.make(commitment(`observation:${profile}`, value))

export const copyBundle = (bundle: Bundle): Bundle => {
  const snapshot = Schema.decodeSync(Schema.toType(Bundle))(structuredClone(bundle), { onExcessProperty: "error" })
  const copy = (file: PackageFile): PackageFile => ({ ...file, content: new Uint8Array(file.content) })
  const [head, ...tail] = snapshot.files
  return { ...snapshot, files: [copy(head), ...tail.map(copy)] }
}

export const copyCompanions = (capture: CompanionCapture): CompanionCapture => {
  const snapshot = Schema.decodeSync(Schema.toType(CompanionCapture))(structuredClone(capture), { onExcessProperty: "error" })
  return {
    previous: snapshot.previous.map((file) => ({ ...file, content: new Uint8Array(file.content) })),
    desired: snapshot.desired.map((file) => ({ ...file, content: new Uint8Array(file.content) }))
  }
}
