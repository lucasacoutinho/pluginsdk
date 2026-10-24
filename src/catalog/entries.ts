import { Match, Schema } from "effect"
import { AdmissionRequest, CatalogInputRejected, PackageSetRejected } from "../../contracts/Registry.ts"
import { BundleRejected } from "../../contracts/Compiler.ts"
import { ContractRejected } from "../../contracts/ToolContract.ts"
import { copyBundle } from "../internal/identity.ts"
import { validateBundle } from "../compiler/package/native.ts"
import { checkPackages } from "./artifacts/model.ts"
import { checkContractBinding } from "./tools/model.ts"
import { captureContract } from "./tools/contracts.ts"

export const captureRelease = (input: AdmissionRequest): AdmissionRequest => {
  const captured = Schema.decodeSync(Schema.toType(AdmissionRequest))(structuredClone(input), { onExcessProperty: "error" })
  return Match.value(captured).pipe(Match.discriminatorsExhaustive("type")({
    plugin: ({ release, bundles: inputBundles }) => {
      const bundles = inputBundles.map(copyBundle)
      const artifacts = bundles.map((bundle) => ({
        plugin: bundle.plugin, format: bundle.format, version: validateBundle(bundle).version, digest: bundle.digest
      }))
      const { plugin, packages } = release.contents
      const checked = checkPackages({ plugin, packages, version: release.version, artifacts })
      return Match.value(checked).pipe(Match.discriminatorsExhaustive("type")({
        accepted: (): AdmissionRequest => ({ type: "plugin", release, bundles }),
        rejected: ({ issues }) => { throw new PackageSetRejected({ issues }) }
      }))
    },
    mcp: ({ release, contract: inputContract }) => {
      const { contract, digest } = captureContract(inputContract)
      const checked = checkContractBinding({
        expected: { organization: release.key.organization, service: release.contents.service, digest: release.contents.contract },
        actual: { organization: contract.organization, service: contract.service, digest }
      })
      return Match.value(checked).pipe(Match.discriminatorsExhaustive("type")({
        accepted: (): AdmissionRequest => ({ type: "mcp", release, contract }),
        rejected: ({ issues }) => { throw new ContractRejected({ reason: { type: "binding", issues } }) }
      }))
    }
  }))
}

export const rejectAdmission = (cause: unknown): CatalogInputRejected | PackageSetRejected | BundleRejected | ContractRejected => {
  if (cause instanceof PackageSetRejected || cause instanceof BundleRejected || cause instanceof ContractRejected) return cause
  return new CatalogInputRejected({ cause })
}
