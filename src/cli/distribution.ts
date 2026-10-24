import { Effect, Match, Schema, Console } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { resolve } from "node:path"
import {
  Distribution,
  ExecutionResult,
  Planning,
  ReadyPlan,
  Request,
  type ExecutionResult as ExecutionResultType,
  type Outcome,
  type Planning as PlanningType,
  type PlanningIssue
} from "../../contracts/Distribution.ts"
import { Release } from "../../contracts/Registry.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { ReleaseCatalogLive } from "../catalog/index.ts"
import { canonicalJson } from "../internal/json.ts"
import {
  InputRejected,
  jsonFlag,
  readJson,
  toCliFailure,
  writeJson
} from "./shared.ts"

const encodedPlanning = Schema.encodeSync(Planning)
const encodedExecutionResult = Schema.encodeSync(ExecutionResult)

const readRelease = Effect.fn("pluginsdk.cli.distribution.readRelease")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Release, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Release does not match the Release schema" }))
  )
})

const readRequest = Effect.fn("pluginsdk.cli.distribution.readRequest")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Request, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Distribution request does not match the Request schema" }))
  )
})

const readReadyPlan = Effect.fn("pluginsdk.cli.distribution.readReadyPlan")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(ReadyPlan, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Reviewed distribution does not match the ReadyPlan schema" }))
  )
})

const planningIssueText = (issue: PlanningIssue): string =>
  Match.value(issue).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ target, reason }) => `${target}: blocked (${reason})`,
    duplicate_target: ({ target }) => `${target}: duplicate destination label`,
    duplicate_installation: () => "duplicate physical installation"
  }))

const planningReport = (planning: PlanningType): { readonly text: string; readonly failure: boolean } =>
  Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
    ready: (plan) => ({
      text: [
        "status: ready",
        `plan ID: ${plan.id}`,
        `release: ${plan.release.key.organization}/${plan.release.key.integration}/${plan.release.key.release}`,
        `version: ${plan.release.version}`,
        `desired: ${plan.desired}`,
        ...plan.steps.flatMap((step) => [
          `destination: ${step.target}`,
          `operation: ${step.operation.type}`
        ])
      ].join("\n"),
      failure: false
    }),
    blocked: ({ issues }) => ({
      text: ["status: blocked", ...issues.map(planningIssueText)].join("\n"),
      failure: true
    })
  }))

const outcomeText = (outcome: Outcome): string =>
  Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
    pending: () => "pending",
    installed: () => "installed",
    removed: () => "removed",
    unchanged: () => "unchanged",
    not_applied: () => "not_applied",
    blocked: ({ reason }) => `blocked (${reason})`,
    uncertain: () => "uncertain",
    unavailable: ({ reason }) => `unavailable (${reason})`
  }))

const executionReport = (result: ExecutionResultType): { readonly text: string; readonly failure: boolean } => ({
  text: [
    `status: ${result.type}`,
    `plan ID: ${result.record.id}`,
    `desired: ${result.record.desired}`,
    ...result.record.entries.flatMap(({ step, outcome }) => [
      `destination: ${step.target}`,
      `result: ${outcomeText(outcome)}`
    ])
  ].join("\n"),
  failure: result.type === "partial"
})

const planCommand = Command.make(
  "plan",
  {
    release: Argument.String("release.json"),
    request: Flag.String("request").pipe(Flag.withDescription("Named distribution destinations JSON")),
    catalog: Flag.String("catalog").pipe(Flag.withDescription("Release catalog directory")),
    out: Flag.String("out").pipe(Flag.withDescription("Reviewed distribution output path")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.distribution.plan")(function*(input) {
    const release = yield* readRelease(input.release).pipe(Effect.mapError(toCliFailure))
    const request = yield* readRequest(input.request).pipe(Effect.mapError(toCliFailure))
    const planning = yield* Distribution.use((distribution) => distribution.plan({ ...request, release })).pipe(
      Effect.provide(ReleaseCatalogLive(Directory.make(resolve(input.catalog)))),
      Effect.mapError(toCliFailure)
    )
    const encoded = encodedPlanning(planning)
    yield* writeJson(input.out, encoded).pipe(Effect.mapError(toCliFailure))
    const report = planningReport(planning)
    yield* Console.log(input.json ? canonicalJson(encoded) : report.text)
    if (report.failure) yield* Effect.sync(() => { process.exitCode = 1 })
  })
).pipe(Command.withDescription("Review a release distribution across named destinations"))

const applyCommand = Command.make(
  "apply",
  {
    plan: Argument.String("reviewed-distribution.json"),
    state: Flag.String("state").pipe(Flag.withDescription("Distribution execution state directory")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.distribution.apply")(function*(input) {
    const plan = yield* readReadyPlan(input.plan).pipe(Effect.mapError(toCliFailure))
    const result = yield* Distribution.use((distribution) =>
      distribution.apply(plan, Directory.make(resolve(input.state)))
    ).pipe(Effect.mapError(toCliFailure))
    const encoded = encodedExecutionResult(result)
    const report = executionReport(result)
    yield* Console.log(input.json ? canonicalJson(encoded) : report.text)
    if (report.failure) yield* Effect.sync(() => { process.exitCode = 1 })
  })
).pipe(Command.withDescription("Apply a complete reviewed distribution plan"))

export const distributionCommand = Command.make("distribution").pipe(
  Command.withDescription("Review and apply release distributions across destinations"),
  Command.withSubcommands([planCommand, applyCommand])
)
