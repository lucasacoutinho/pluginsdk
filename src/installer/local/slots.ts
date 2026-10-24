import { Match, Schema } from "effect"
import { Identity } from "../../../contracts/Installer.ts"
import { Owner } from "../../../contracts/LocalSlot.ts"
import type { Claim, CleanupDecision, Decision, Input, Observation, Reason } from "../../../contracts/LocalSlot.ts"

const sameIdentity = Schema.toEquivalence(Identity)
const sameOwner = Schema.toEquivalence(Owner)

function reviewClaim(owner: Owner, claim: Claim, permitted: ReadonlyArray<Identity>): Reason | null {
  if (!sameOwner(owner, claim.owner)) return "unowned"
  return permitted.some((identity) => sameIdentity(identity, claim.identity)) ? null : "drift"
}

function reviewObservation(owner: Owner, observed: Observation,
  complete: ReadonlyArray<Identity>, partial: ReadonlyArray<Identity>): Reason | null {
  return Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
    absent: () => null,
    unknown: (): Reason => "unknown",
    foreign: (): Reason => "unowned",
    complete: (claim) => reviewClaim(owner, claim, complete),
    partial: (claim) => reviewClaim(owner, claim, partial)
  }))
}

function completePackage(observed: Observation, identity: Identity): boolean {
  return Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
    absent: () => false,
    unknown: () => false,
    foreign: () => false,
    complete: (claim) => sameIdentity(identity, claim.identity),
    partial: () => false
  }))
}

function reviewSlots(input: Input): Reason | null {
  const policy = Match.value(input.operation).pipe(Match.discriminatorsExhaustive("type")({
    install: ({ next }) => ({ previous: [], next: [next], valid: true }),
    replace: ({ previous, next }) => ({ previous: [previous], next: [next], valid: previous.plan !== next.plan }),
    remove: ({ previous }) => ({ previous: [previous], next: [], valid: true })
  }))
  const { live, staged, retired } = input.slots
  const refusals = [
    reviewObservation(input.owner, live, [...policy.previous, ...policy.next], []),
    reviewObservation(input.owner, staged, policy.next, policy.next),
    reviewObservation(input.owner, retired, policy.previous, [])
  ]
  if (refusals.includes("unknown")) return "unknown"
  if (refusals.includes("unowned")) return "unowned"
  if (!policy.valid) return "operation"
  if (refusals.includes("drift")) return "drift"
  return null
}

function claimedPackage(observed: Observation): boolean {
  return Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
    absent: () => false,
    unknown: () => false,
    foreign: () => false,
    complete: () => true,
    partial: () => true
  }))
}

export function cleanupLocalSlots(input: Input): CleanupDecision {
  const refusal = reviewSlots(input)
  if (refusal !== null) return { type: "blocked", reason: refusal }
  if (claimedPackage(input.slots.staged)) return { type: "step", role: "staged" }
  if (claimedPackage(input.slots.retired)) return { type: "step", role: "retired" }
  if (claimedPackage(input.slots.live)) return { type: "step", role: "live" }
  return { type: "complete" }
}

export function advanceLocalSlot(input: Input): Decision {
  const refusal = reviewSlots(input)
  if (refusal !== null) return { type: "blocked", reason: refusal }
  const { live, staged, retired } = input.slots

  return Match.value(input.operation).pipe(Match.discriminatorsExhaustive("type")({
    install: ({ next }): Decision => {
      if (live.type === "absent") {
        if (staged.type === "absent") return { type: "step", action: "prepare" }
        if (staged.type === "partial") return { type: "step", action: "discard_stage" }
        if (completePackage(staged, next)) return { type: "step", action: "publish" }
      }
      if (completePackage(live, next) && staged.type === "absent") return { type: "complete" }
      return { type: "blocked", reason: "state" }
    },
    replace: ({ previous, next }): Decision => {
      if (completePackage(live, previous) && retired.type === "absent") {
        if (staged.type === "absent") return { type: "step", action: "prepare" }
        if (staged.type === "partial") return { type: "step", action: "discard_stage" }
        if (completePackage(staged, next)) return { type: "step", action: "retire" }
      }
      if (live.type === "absent" && completePackage(staged, next) && completePackage(retired, previous)) {
        return { type: "step", action: "publish" }
      }
      if (completePackage(live, next) && staged.type === "absent") {
        if (retired.type === "absent") return { type: "complete" }
        if (completePackage(retired, previous)) return { type: "step", action: "discard_retired" }
      }
      return { type: "blocked", reason: "state" }
    },
    remove: ({ previous }): Decision => {
      if (completePackage(live, previous) && retired.type === "absent") return { type: "step", action: "retire" }
      if (live.type === "absent") {
        if (completePackage(retired, previous)) return { type: "step", action: "discard_retired" }
        if (retired.type === "absent") return { type: "complete" }
      }
      return { type: "blocked", reason: "state" }
    }
  }))
}
