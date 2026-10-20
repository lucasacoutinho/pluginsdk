import { createHash } from "node:crypto"
import { Schema } from "effect"
import { Bundle, BundleBody, BundleDigest, type PackageFile } from "../../contracts/Compiler.ts"
import { FileDigest } from "../../contracts/CompilerModel.ts"
import { Fingerprint, PlanBody, PlanId } from "../../contracts/Installer.ts"
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

export const planId = (plan: PlanBody): PlanId => PlanId.make(commitment("plan", Schema.encodeSync(PlanBody)({
  type: plan.type,
  schema: plan.schema,
  target: plan.target,
  before: plan.before,
  change: plan.change
})))

export const fingerprint = (profile: string, value: Json): Fingerprint =>
  Fingerprint.make(commitment(`observation:${profile}`, value))

export const copyBundle = (bundle: Bundle): Bundle => {
  const snapshot = Schema.decodeSync(Schema.toType(Bundle))(structuredClone(bundle), { onExcessProperty: "error" })
  const copy = (file: PackageFile): PackageFile => ({ ...file, content: new Uint8Array(file.content) })
  const [head, ...tail] = snapshot.files
  return { ...snapshot, files: [copy(head), ...tail.map(copy)] }
}
