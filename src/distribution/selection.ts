import type { Selection, SelectionInput } from "../../contracts/DistributionModel.ts"
import { packageClient } from "../installer/target/packages.ts"

export const selectDistributionFormat = (input: SelectionInput): Selection => {
  const host = packageClient(input.host)
  const candidates = input.formats.filter((format) => format === host)
  const [first, second] = candidates
  if (first === undefined) return { type: "blocked", reason: "unavailable" }
  return second === undefined
    ? { type: "selected", format: first }
    : { type: "blocked", reason: "ambiguous" }
}
