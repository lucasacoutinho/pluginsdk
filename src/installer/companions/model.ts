import { Match } from "effect"
import type {
  FileChange,
  FileIdentity,
  ReviewInput,
  ReviewIssue,
  ReviewResult
} from "../../../contracts/Companions.ts"
import { compareUtf8 } from "../../internal/paths.ts"

type RoleName = ReviewInput["previous"][number]["name"]
type ObservedFile = ReviewInput["observed"][number]
type UnsafeReason = Extract<ReviewIssue["reason"], "drift" | "unowned" | "unknown">

function groupByName<A extends { readonly name: string }>(values: ReadonlyArray<A>): Map<string, A[]> {
  const groups = new Map<string, A[]>()
  for (const value of values) {
    const group = groups.get(value.name)
    if (group === undefined) groups.set(value.name, [value])
    else group.push(value)
  }
  return groups
}

function requiredNames(input: ReviewInput): RoleName[] {
  const names = new Set<RoleName>()
  for (const file of input.previous) names.add(file.name)
  for (const file of input.desired) names.add(file.name)
  return [...names].toSorted(compareUtf8)
}

function unsafeReason(previous: ReadonlyArray<FileIdentity>, observed: ReadonlyArray<ObservedFile>): UnsafeReason | null {
  const [entry, ...remaining] = observed
  if (entry === undefined || remaining.length > 0) return null

  const [before] = previous
  return Match.value(entry.observed).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): UnsafeReason | null => previous.length === 1 ? "drift" : null,
      file: ({ digest }): UnsafeReason | null => {
        if (previous.length === 0) return "unowned"
        if (previous.length === 1 && before !== undefined && before.digest !== digest) return "drift"
        return null
      },
      conflict: (): UnsafeReason | null => "unowned",
      unknown: (): UnsafeReason | null => "unknown"
    })
  )
}

function planChange(
  name: RoleName,
  previous: ReadonlyArray<FileIdentity>,
  desired: ReadonlyArray<FileIdentity>
): FileChange | null {
  const [before, ...previousRest] = previous
  const [after, ...desiredRest] = desired
  if (previousRest.length > 0 || desiredRest.length > 0) return null
  if (before === undefined) {
    return after === undefined ? null : { type: "create", name, after: after.digest }
  }
  if (after === undefined) return { type: "remove", name, before: before.digest }
  if (before.digest === after.digest) return { type: "keep", name, digest: before.digest }
  return { type: "replace", name, before: before.digest, after: after.digest }
}

function issueOrder(left: ReviewIssue, right: ReviewIssue): number {
  const nameOrder = compareUtf8(left.name, right.name)
  return nameOrder === 0 ? compareUtf8(left.reason, right.reason) : nameOrder
}

export function reviewCompanions(input: ReviewInput): ReviewResult {
  const names = requiredNames(input)
  const previousByName = groupByName(input.previous)
  const desiredByName = groupByName(input.desired)
  const observedByName = groupByName(input.observed)
  const issues: ReviewIssue[] = []

  for (const name of names) {
    const previous = previousByName.get(name) ?? []
    const desired = desiredByName.get(name) ?? []
    const observed = observedByName.get(name) ?? []
    if (previous.length > 1) issues.push({ name, reason: "duplicate_previous" })
    if (desired.length > 1) issues.push({ name, reason: "duplicate_desired" })
    if (observed.length !== 1) issues.push({ name, reason: "observation_unavailable" })
    const unsafe = unsafeReason(previous, observed)
    if (unsafe !== null) issues.push({ name, reason: unsafe })
  }

  const canonicalIssues = issues.toSorted(issueOrder)
  const [firstIssue, ...remainingIssues] = canonicalIssues
  if (firstIssue !== undefined) {
    return { type: "blocked", issues: [firstIssue, ...remainingIssues] }
  }

  const changes: FileChange[] = []
  for (const name of names) {
    const change = planChange(
      name,
      previousByName.get(name) ?? [],
      desiredByName.get(name) ?? []
    )
    if (change !== null) changes.push(change)
  }
  return { type: "ready", changes }
}
