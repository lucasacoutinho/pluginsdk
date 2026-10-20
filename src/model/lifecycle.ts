import { Match, Schema } from "effect"
import {
  Change as ChangeSchema,
  Desired as DesiredSchema,
  Identity as IdentitySchema,
  Observation as ObservationSchema,
  Receipt as ReceiptSchema,
  Snapshot as SnapshotSchema
} from "../../contracts/Installer.ts"
import type { BundleDigest } from "../../contracts/Compiler.ts"
import type {
  Change,
  Completion,
  Desired,
  Identity,
  Observation,
  Receipt,
  Snapshot
} from "../../contracts/Installer.ts"
import type {
  BeginInput,
  BeginResult,
  Decision,
  Idle,
  Pending,
  PlanningInput,
  SettleInput,
  Settlement
} from "../../contracts/Lifecycle.ts"

const sameIdentity = Schema.toEquivalence(IdentitySchema)
const sameReceipt = Schema.toEquivalence(ReceiptSchema)
const sameObservation = Schema.toEquivalence(ObservationSchema)
const sameChange = Schema.toEquivalence(ChangeSchema)
const sameDesired = Schema.toEquivalence(DesiredSchema)
const sameSnapshot = Schema.toEquivalence(SnapshotSchema)

function idleRevision(idle: Idle): Snapshot["revision"] {
  return Match.value(idle).pipe(
    Match.discriminatorsExhaustive("type")({
      empty: (state) => state.last,
      installed: (state) => state.receipt.identity.plan,
      not_applied: (state) => state.plan
    })
  )
}

function idleReceipt(idle: Idle): Receipt | null {
  return Match.value(idle).pipe(
    Match.discriminatorsExhaustive("type")({
      empty: () => null,
      installed: (state) => state.receipt,
      not_applied: (state) => state.state.receipt
    })
  )
}

function snapshot(idle: Idle, observed: Observation): Snapshot {
  return {
    revision: idleRevision(idle),
    receipt: idleReceipt(idle),
    observed
  }
}

function desiredOf(change: Change): Desired {
  return Match.value(change).pipe(
    Match.discriminatorsExhaustive("type")({
      install: (value): Desired => ({ type: "present", bundle: value.bundle }),
      replace: (value): Desired => ({ type: "present", bundle: value.bundle }),
      remove: (): Desired => ({ type: "absent" })
    })
  )
}

function completedDesired(idle: Idle): Desired | null {
  return Match.value(idle).pipe(
    Match.discriminatorsExhaustive("type")({
      empty: (state): Desired | null => state.last === null ? null : { type: "absent" },
      installed: (state): Desired => ({ type: "present", bundle: state.receipt.identity.bundle }),
      not_applied: (state) => desiredOf(state.change)
    })
  )
}

function decideForAbsent(idle: Idle, state: Snapshot, desired: Desired): Decision {
  return Match.value(desired).pipe(
    Match.discriminatorsExhaustive("type")({
      present: (value): Decision => ({
        type: "change",
        change: { type: "install", bundle: value.bundle },
        before: state
      }),
      absent: (): Decision => idleReceipt(idle) === null
        ? { type: "unchanged", state }
        : { type: "change", change: { type: "remove" }, before: state }
    })
  )
}

function decideForPresent(idle: Idle, observed: Extract<Observation, { type: "present" }>, state: Snapshot, desired: Desired): Decision {
  const receipt = idleReceipt(idle)
  if (receipt === null) return { type: "blocked", reason: "unowned", state }
  const matches = observed.fingerprint === receipt.fingerprint &&
    observed.identity !== null && sameIdentity(observed.identity, receipt.identity)
  if (!matches) return { type: "blocked", reason: "drift", state }

  return Match.value(desired).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): Decision => ({ type: "change", change: { type: "remove" }, before: state }),
      present: (value): Decision => value.bundle === receipt.identity.bundle
        ? { type: "unchanged", state }
        : { type: "change", change: { type: "replace", bundle: value.bundle }, before: state }
    })
  )
}

function decideIdle(idle: Idle, observed: Observation, desired: Desired): Decision {
  const state = snapshot(idle, observed)
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      unknown: (): Decision => ({ type: "blocked", reason: "unknown", state }),
      absent: (): Decision => decideForAbsent(idle, state, desired),
      present: (value): Decision => decideForPresent(idle, value, state, desired)
    })
  )
}

export function decide(input: PlanningInput): Decision {
  return Match.value(input.journal).pipe(
    Match.discriminatorsExhaustive("type")({
      pending: (operation): Decision => ({ type: "pending", plan: operation.plan }),
      empty: (state): Decision => decideIdle(state, input.observed, input.desired),
      installed: (state): Decision => decideIdle(state, input.observed, input.desired),
      not_applied: (state): Decision => decideIdle(state, input.observed, input.desired)
    })
  )
}

function replayEmpty(observed: Observation): BeginResult {
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): BeginResult => ({ type: "completed", result: { type: "removed" } }),
      present: (): BeginResult => ({ type: "rejected", reason: "stale_plan" }),
      unknown: (): BeginResult => ({ type: "rejected", reason: "stale_plan" })
    })
  )
}

function replayInstalled(receipt: Receipt, observed: Observation): BeginResult {
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): BeginResult => ({ type: "rejected", reason: "stale_plan" }),
      unknown: (): BeginResult => ({ type: "rejected", reason: "stale_plan" }),
      present: (value): BeginResult => value.identity !== null &&
        sameReceipt({ identity: value.identity, fingerprint: value.fingerprint }, receipt)
        ? { type: "completed", result: { type: "installed", receipt } }
        : { type: "rejected", reason: "stale_plan" }
    })
  )
}

function nonUnknownObservationMatches(observed: Observation, expected: Observation): boolean {
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      unknown: () => false,
      absent: (value) => sameObservation(value, expected),
      present: (value) => sameObservation(value, expected)
    })
  )
}

function replayNotApplied(idle: Extract<Idle, { type: "not_applied" }>, change: Change, observed: Observation): BeginResult {
  if (!sameChange(change, idle.change)) return { type: "rejected", reason: "invalid_plan" }
  return nonUnknownObservationMatches(observed, idle.state.observed)
    ? { type: "completed", result: { type: "not_applied" } }
    : { type: "rejected", reason: "stale_plan" }
}

function replay(idle: Idle, change: Change, observed: Observation): BeginResult {
  const desired = completedDesired(idle)
  if (desired === null || !sameDesired(desired, desiredOf(change))) {
    return { type: "rejected", reason: "invalid_plan" }
  }

  return Match.value(idle).pipe(
    Match.discriminatorsExhaustive("type")({
      empty: () => replayEmpty(observed),
      installed: (state) => replayInstalled(state.receipt, observed),
      not_applied: (state) => replayNotApplied(state, change, observed)
    })
  )
}

function start(input: BeginInput, idle: Idle): BeginResult {
  return {
    type: "start",
    journal: {
      type: "pending",
      plan: input.plan,
      previous: idle,
      observed: input.observed,
      change: input.change
    }
  }
}

function startIfAuthorized(input: BeginInput, idle: Idle, decision: Decision): BeginResult {
  return Match.value(decision).pipe(
    Match.discriminatorsExhaustive("type")({
      change: (authorization): BeginResult => sameChange(authorization.change, input.change) &&
        sameSnapshot(authorization.before, input.before)
        ? start(input, idle)
        : { type: "rejected", reason: "invalid_plan" },
      unchanged: (): BeginResult => ({ type: "rejected", reason: "invalid_plan" }),
      blocked: (): BeginResult => ({ type: "rejected", reason: "invalid_plan" }),
      pending: (): BeginResult => ({ type: "rejected", reason: "invalid_plan" })
    })
  )
}

function beginIdle(input: BeginInput, idle: Idle): BeginResult {
  if (idleRevision(idle) === input.plan) return replay(idle, input.change, input.observed)

  const before = snapshot(idle, input.observed)
  if (!sameSnapshot(input.before, before)) return { type: "rejected", reason: "stale_plan" }

  const decision = decide({
    journal: idle,
    observed: input.observed,
    desired: desiredOf(input.change)
  })
  return startIfAuthorized(input, idle, decision)
}

function beginPending(input: BeginInput, operation: Pending): BeginResult {
  if (input.plan !== operation.plan) return { type: "rejected", reason: "different_pending_plan" }
  if (!sameChange(input.change, operation.change)) return { type: "rejected", reason: "invalid_plan" }
  return { type: "resume", journal: operation }
}

export function begin(input: BeginInput): BeginResult {
  return Match.value(input.journal).pipe(
    Match.discriminatorsExhaustive("type")({
      pending: (operation) => beginPending(input, operation),
      empty: (idle) => beginIdle(input, idle),
      installed: (idle) => beginIdle(input, idle),
      not_applied: (idle) => beginIdle(input, idle)
    })
  )
}

type Established = { idle: Idle; result: Completion } | null

function establishedForBundle(pending: Pending, bundle: BundleDigest, observed: Observation): Established {
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): Established => null,
      unknown: (): Established => null,
      present: (value): Established => {
        const identity: Identity = { plan: pending.plan, bundle }
        if (value.identity === null || !sameIdentity(value.identity, identity)) return null
        const receipt: Receipt = { identity, fingerprint: value.fingerprint }
        return {
          idle: { type: "installed", receipt },
          result: { type: "installed", receipt }
        }
      }
    })
  )
}

function establishedForRemoval(pending: Pending, observed: Observation): Established {
  return Match.value(observed).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): Established => ({ idle: { type: "empty", last: pending.plan }, result: { type: "removed" } }),
      present: (): Established => null,
      unknown: (): Established => null
    })
  )
}

function established(pending: Pending, observed: Observation): Established {
  return Match.value(pending.change).pipe(
    Match.discriminatorsExhaustive("type")({
      install: (change) => establishedForBundle(pending, change.bundle, observed),
      replace: (change) => establishedForBundle(pending, change.bundle, observed),
      remove: () => establishedForRemoval(pending, observed)
    })
  )
}

export function settle(input: SettleInput): Settlement {
  const completed = established(input.journal, input.observed)
  if (completed !== null) {
    return { type: "completed", journal: completed.idle, result: completed.result }
  }

  if (nonUnknownObservationMatches(input.observed, input.journal.observed)) {
    return {
      type: "completed",
      journal: {
        type: "not_applied",
        plan: input.journal.plan,
        change: input.journal.change,
        state: snapshot(input.journal.previous, input.journal.observed)
      },
      result: { type: "not_applied" }
    }
  }

  return { type: "uncertain", journal: input.journal, observed: input.observed }
}
