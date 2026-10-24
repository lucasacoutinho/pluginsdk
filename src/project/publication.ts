import { Schema } from "effect"
import { Publication, type PublishInput, type PublishResult } from "../../contracts/Publication.ts"

const samePublication = Schema.toEquivalence(Publication)

export function publishRelease(input: PublishInput): PublishResult {
  const versions = new Map<string, Set<string>>()
  for (const entry of input.history) {
    const seen = versions.get(entry.plugin) ?? new Set<string>()
    if (seen.has(entry.version)) return { type: "blocked", reason: "duplicate" }
    seen.add(entry.version)
    versions.set(entry.plugin, seen)
  }

  const previous = input.history.find((entry) => entry.plugin === input.desired.plugin && entry.version === input.desired.version)
  if (previous === undefined) return { type: "published", history: [...input.history, input.desired] }
  return samePublication(previous, input.desired)
    ? { type: "unchanged", history: input.history }
    : { type: "blocked", reason: "version_conflict" }
}
