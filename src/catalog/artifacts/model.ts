import type { PackageSetInput, PackageSetIssue, PackageSetResult } from "../../../contracts/Artifacts.ts"
import { Format } from "../../../contracts/Compiler.ts"
import { compareUtf8 } from "../../internal/paths.ts"

export function checkPackages(input: PackageSetInput): PackageSetResult {
  const issues: PackageSetIssue[] = []
  for (const format of Format.literals) {
    const digest = input.packages[format]
    const candidates = input.artifacts.filter((artifact) => artifact.format === format)
    if (digest !== undefined && candidates.length === 0) issues.push({ type: "missing_package", format })
    if (digest === undefined && candidates.length > 0) issues.push({ type: "unexpected_package", format })
    if (candidates.length > 1) issues.push({ type: "duplicate_package", format })
    if (candidates.some((artifact) => artifact.plugin !== input.plugin)) issues.push({ type: "plugin_mismatch", format })
    if (candidates.some((artifact) => artifact.version !== input.version)) issues.push({ type: "version_mismatch", format })
    if (digest !== undefined && candidates.some((artifact) => artifact.digest !== digest)) issues.push({ type: "digest_mismatch", format })
  }
  issues.sort((left, right) => compareUtf8(left.type, right.type) || compareUtf8(left.format, right.format))
  const [first, ...rest] = issues
  return first === undefined ? { type: "accepted" } : { type: "rejected", issues: [first, ...rest] }
}
