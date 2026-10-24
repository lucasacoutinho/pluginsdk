import type { ToolName } from "../../../contracts/Authorization.ts"
import type { ContractBindingInput, ContractBindingIssue, ContractBindingResult, NormalizeToolsInput, ToolListResult } from "../../../contracts/ToolContract.ts"
import { compareUtf8 } from "../../internal/paths.ts"

export const normalizeTools = (input: NormalizeToolsInput): ToolListResult => {
  const counts = new Map<ToolName, number>()
  for (const tool of input.tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1)
  const duplicates = Array.from(counts).filter(([, count]) => count > 1).map(([name]) => name).sort(compareUtf8)
  const [first, ...rest] = duplicates
  return first === undefined
    ? { type: "accepted", tools: input.tools.toSorted((left, right) => compareUtf8(left.name, right.name)) }
    : { type: "rejected", tools: [first, ...rest] }
}

export const checkContractBinding = ({ expected, actual }: ContractBindingInput): ContractBindingResult => {
  const issues: ContractBindingIssue[] = []
  if (actual.digest !== expected.digest) issues.push("digest_mismatch")
  if (actual.organization !== expected.organization) issues.push("organization_mismatch")
  if (actual.service !== expected.service) issues.push("service_mismatch")
  const [first, ...rest] = issues.sort(compareUtf8)
  return first === undefined ? { type: "accepted" } : { type: "rejected", issues: [first, ...rest] }
}
