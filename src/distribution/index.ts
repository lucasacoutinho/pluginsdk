import { resolve } from "node:path"
import { Effect, Layer, Match, Schema } from "effect"
import { Release, type PluginRelease } from "../../contracts/Catalog.ts"
import {
  Distribution, DistributionInputRejected, DistributionRejected, DistributionUnavailable, ExecutionRecord, ReadyPlan, Step,
  type DistributionTarget, type NativeIntent, type Operation, type Outcome, type PlanRequest, type Planning, type ExecutionResult
} from "../../contracts/Distribution.ts"
import { Candidate, ProgressRecord, type Desired, type PlanningFailure, type TargetId } from "../../contracts/DistributionModel.ts"
import { Installer, Snapshot, Target } from "../../contracts/Installer.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { ReleaseCatalog } from "../../contracts/Registry.ts"
import { compareUtf8 } from "../internal/paths.ts"
import { normalizeDistribution } from "./planning.ts"
import { openDistribution, recordDistribution, scheduleDistribution, summarizeDistribution } from "./execution.ts"
import { selectDistributionFormat } from "./selection.ts"
import { declaredFormats, describePlan, describeStep, projectProgress, reviewPlan, snapshotPlan, snapshotRequest, validateExecutionRecord } from "./review.ts"
import { createDirectory, distributionLock, readDistribution, writeDistribution, type StoredDistribution } from "./storage.ts"

const Evaluation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), step: Step }), Candidate.members[1]
]).pipe(Schema.toTaggedUnion("type"))
type Evaluation = typeof Evaluation.Type
const sameRelease = Schema.toEquivalence(Release)
const samePlan = Schema.toEquivalence(ReadyPlan)
const sameProgress = Schema.toEquivalence(ProgressRecord)
const sameTarget = Schema.toEquivalence(Target)
const sameSnapshot = Schema.toEquivalence(Snapshot)
type AttemptOutcome = Exclude<Outcome, { readonly type: "pending" }>

const blocked = (target: TargetId, reason: PlanningFailure): Evaluation => ({ type: "blocked", target, reason })

const evaluateLocal = Effect.fnUntraced(function*(
  catalog: typeof ReleaseCatalog.Service,
  installer: typeof Installer.Service,
  release: PluginRelease,
  desired: Desired,
  target: Extract<DistributionTarget, { type: "local" }>
) {
  const selected = selectDistributionFormat({ host: target.destination.host, formats: declaredFormats(release) })
  return yield* Match.value(selected).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ reason }) => Effect.succeed(blocked(target.id, Match.value(reason).pipe(
      Match.when("unavailable", (): PlanningFailure => "package_unavailable"),
      Match.when("ambiguous", (): PlanningFailure => "package_ambiguous"), Match.exhaustive
    ))),
    selected: ({ format }) => Effect.gen(function*() {
      const acquisition = yield* catalog.acquire({ key: release.key, target: { type: "plugin", format } })
      return yield* Match.value(acquisition).pipe(Match.discriminatorsExhaustive("type")({
        blocked: ({ reason }) => Effect.succeed(blocked(target.id, Match.value(reason).pipe(
          Match.when("release_missing", (): PlanningFailure => "release_unavailable"),
          Match.when("format_unavailable", (): PlanningFailure => "package_unavailable"),
          Match.whenOr("kind_mismatch", "release_conflict", (): PlanningFailure => "release_mismatch"),
          Match.exhaustive
        ))),
        mcp: () => Effect.succeed(blocked(target.id, "release_mismatch")),
        plugin: ({ release: retained, bundle }) => Effect.gen(function*() {
          if (!sameRelease(release, retained)) return blocked(target.id, "release_mismatch")
          const intent = Match.value(desired).pipe(
            Match.when("present", (): NativeIntent => ({ type: "present", bundle })),
            Match.when("absent", (): NativeIntent => ({ type: "absent", plugin: release.contents.plugin })),
            Match.exhaustive
          )
          const planning = yield* installer.plan({ destination: target.destination, intent })
          return Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
            ready: (plan): Evaluation => ({ type: "ready", step: { target: target.id, operation: { type: "apply", plan } } }),
            repair_ready: () => blocked(target.id, "pending_operation"),
            pending: () => blocked(target.id, "pending_operation"),
            blocked: ({ reason }) => blocked(target.id, reason),
            unchanged: ({ target: nativeTarget, state }): Evaluation => ({
              type: "ready", step: { target: target.id, operation: { type: "verify", target: nativeTarget, before: state, intent } }
            })
          }))
        })
      }))
    })
  }), Effect.catchTags({
    CatalogUnavailable: () => Effect.succeed(blocked(target.id, "release_unavailable")),
    CatalogInputRejected: () => Effect.succeed(blocked(target.id, "release_unavailable")),
    BundleRejected: () => Effect.succeed(blocked(target.id, "package_rejected")),
    DestinationUnsupported: () => Effect.succeed(blocked(target.id, "destination_unsupported")),
    HostUnavailable: () => Effect.succeed(blocked(target.id, "host_unavailable")),
    StateUnavailable: () => Effect.succeed(blocked(target.id, "installation_unavailable"))
  }))
})

const applyOperation = Effect.fnUntraced(function*(installer: typeof Installer.Service, operation: Operation) {
  return yield* Match.value(operation).pipe(Match.discriminatorsExhaustive("type")({
    apply: ({ plan }) => installer.apply(plan).pipe(Effect.map((outcome): AttemptOutcome => Match.value(outcome).pipe(
      Match.discriminatorsExhaustive("type")({ completed: ({ result }) => result, uncertain: (outcome) => outcome })
    ))),
    verify: ({ target, before, intent }) => installer.plan({ destination: target.destination, intent }).pipe(
      Effect.map((planning): AttemptOutcome => Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
        unchanged: ({ target: current, state }): AttemptOutcome => sameTarget(target, current) && sameSnapshot(before, state)
          ? { type: "unchanged", state } : { type: "blocked", reason: "basis_changed" },
        ready: (): AttemptOutcome => ({ type: "blocked", reason: "basis_changed" }),
        repair_ready: (): AttemptOutcome => ({ type: "blocked", reason: "basis_changed" }),
        pending: (): AttemptOutcome => ({ type: "blocked", reason: "basis_changed" }),
        blocked: (): AttemptOutcome => ({ type: "blocked", reason: "basis_changed" })
      })))
    )
  }), Effect.catchTags({
    BundleRejected: () => Effect.succeed<AttemptOutcome>({ type: "blocked", reason: "invalid_plan" }),
    DestinationUnsupported: () => Effect.succeed<AttemptOutcome>({ type: "blocked", reason: "destination_unsupported" }),
    HostUnavailable: () => Effect.succeed<AttemptOutcome>({ type: "unavailable", reason: "host_unavailable" }),
    StateUnavailable: () => Effect.succeed<AttemptOutcome>({ type: "unavailable", reason: "installation_unavailable" }),
    PlanRejected: ({ reason }) => Effect.succeed<AttemptOutcome>({ type: "blocked", reason })
  }))
})

export const DistributionLive = Layer.effect(Distribution, Effect.gen(function*() {
  const installer = yield* Installer
  const plan = Effect.fn("Distribution.plan")(function*(input: PlanRequest) {
    const request = yield* Effect.try({ try: () => snapshotRequest(input), catch: (cause) => new DistributionInputRejected({ cause }) })
    const catalog = yield* ReleaseCatalog
    const evaluate = (target: DistributionTarget) => Match.value(target).pipe(Match.discriminatorsExhaustive("type")({
      workspace: (target) => Effect.succeed(blocked(target.id,
        target.organization === request.release.key.organization ? "workspace_unqualified" : "wrong_organization")),
      local: (target) => Match.value(request.release.contents).pipe(Match.discriminatorsExhaustive("type")({
        mcp: () => Effect.succeed(blocked(target.id, "mcp_registration_unqualified")),
        plugin: (contents) => evaluateLocal(catalog, installer, { ...request.release, contents }, request.desired, target)
      }))
    }))
    const [firstTarget, ...restTargets] = request.targets
    const first = yield* evaluate(firstTarget)
    const rest = yield* Effect.forEach(restTargets, evaluate, { concurrency: 1 })
    const project = (evaluation: Evaluation): Candidate => Match.value(evaluation).pipe(Match.discriminatorsExhaustive("type")({
      ready: ({ step }): Candidate => ({ type: "ready", step: describeStep(step) }), blocked: (evaluation) => evaluation
    }))
    const normalized = normalizeDistribution({ candidates: [project(first), ...rest.map(project)] })
    return yield* Match.value(normalized).pipe(Match.discriminatorsExhaustive("type")({
      blocked: (planning) => Effect.succeed<Planning>(planning),
      ready: () => Effect.gen(function*() {
        const steps = [first, ...rest].flatMap((evaluation) => Match.value(evaluation).pipe(Match.discriminatorsExhaustive("type")({
          ready: ({ step }) => [step], blocked: () => []
        }))).sort((left, right) => compareUtf8(left.target, right.target))
        const [head, ...tail] = steps
        if (head === undefined) return yield* Effect.die(new Error("Accepted distribution has no destinations"))
        return yield* Effect.try({
          try: () => reviewPlan({ schema: 1, type: "ready", desired: request.desired, release: request.release, steps: [head, ...tail] }),
          catch: (cause) => new DistributionInputRejected({ cause })
        })
      })
    }))
  })

  const apply = Effect.fn("Distribution.apply")(function*(input: ReadyPlan, state: Directory) {
    const plan = yield* Effect.try({ try: () => snapshotPlan(input), catch: () => new DistributionRejected({ reason: "invalid_plan" }) })
    const directory = Directory.make(resolve(state))
    const created = yield* createDirectory(directory)
    yield* distributionLock(directory)
    let stored: StoredDistribution = created ? { schema: 1, jobs: [] } : yield* readDistribution(directory)
    const prior = stored.jobs.find((job) => job.plan.id === plan.id)
    if (prior !== undefined && !samePlan(prior.plan, plan)) return yield* new DistributionRejected({ reason: "plan_conflict" })
    const opened = yield* Match.value(openDistribution({
      plan: describePlan(plan), prior: prior === undefined ? null : projectProgress(prior.record)
    })).pipe(Match.discriminatorsExhaustive("type")({
      rejected: ({ reason }) => Effect.fail(new DistributionRejected({ reason })),
      opened: ({ record }) => Effect.succeed(record)
    }))
    const entry = (value: ProgressRecord["entries"][number]): ExecutionRecord["entries"][number] => ({ step: value.step, outcome: { type: "pending" } })
    const [first, ...rest] = opened.entries
    let record: ExecutionRecord = prior?.record ?? { schema: 1, id: plan.id, desired: plan.desired, entries: [entry(first), ...rest.map(entry)] }
    const save = Effect.fnUntraced(function*() {
      yield* Effect.try({ try: () => validateExecutionRecord(plan, record), catch: (cause) => new DistributionUnavailable({ directory, cause }) })
      stored = { schema: 1, jobs: [...stored.jobs.filter((job) => job.plan.id !== plan.id), { plan, record }] }
      yield* writeDistribution(directory, stored)
    })
    if (prior === undefined) yield* save()
    const visited: TargetId[] = []
    while (true) {
      const scheduled = Match.value(scheduleDistribution({ record: projectProgress(record), visited })).pipe(
        Match.discriminatorsExhaustive("type")({ idle: () => null, attempt: ({ step }) => step })
      )
      if (scheduled === null) return { type: summarizeDistribution({ record: projectProgress(record) }), record } satisfies ExecutionResult
      const step = plan.steps.find((step) => step.target === scheduled.target)
      if (step === undefined) return yield* Effect.die(new Error("Scheduled destination is missing from the reviewed plan"))
      visited.push(step.target)
      const outcome = yield* applyOperation(installer, step.operation)
      const update = (entry: ExecutionRecord["entries"][number]): ExecutionRecord["entries"][number] => entry.step.target === step.target ? { ...entry, outcome } : entry
      const [head, ...tail] = record.entries
      const next: ExecutionRecord = { ...record, entries: [update(head), ...tail.map(update)] }
      const recorded = yield* Match.value(recordDistribution({
        record: projectProgress(record), target: step.target, status: outcome.type
      })).pipe(Match.discriminatorsExhaustive("type")({
        rejected: () => Effect.die(new Error("Scheduled distribution destination rejected its outcome")),
        recorded: ({ record }) => Effect.succeed(record)
      }))
      if (!sameProgress(recorded, projectProgress(next))) {
        return yield* Effect.die(new Error("Distribution outcome does not conform to the execution model"))
      }
      record = next
      yield* save()
    }
  }, Effect.scoped)
  return Distribution.of({ plan, apply })
}))
