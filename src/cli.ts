#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, Layer, Match, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { Bundle } from "../contracts/Compiler.ts"
import {
  ApplyOutcome,
  Destination,
  Host,
  Installer,
  Planning,
  ReviewedPlan,
  type ApplyOutcome as ApplyOutcomeType,
  type Host as HostType,
  type Planning as PlanningType,
  type ReadyPlan as ReadyPlanType,
  type RepairPlan as RepairPlanType,
  type ReviewedPlan as ReviewedPlanType,
  type Target
} from "../contracts/Installer.ts"
import { PluginId } from "../contracts/Plugin.ts"
import { canonicalJson } from "./internal/json.ts"
import { PluginSdkLive } from "./node.ts"
import { CliFailure, InputRejected, jsonFlag, readBundle, readPlan, toCliFailure, writeJson } from "./cli/shared.ts"
import { catalogCommand } from "./cli/catalog.ts"
import { distributionCommand } from "./cli/distribution.ts"
import { buildCommand, previewCommand, publishCommand } from "./cli/project.ts"
import { fileDigest } from "./internal/identity.ts"
import { companionNames } from "./installer/companions/capture.ts"
import { reviewCompanions } from "./installer/companions/model.ts"

const encodedPlanning = Schema.encodeSync(Planning)
const encodedPlan = Schema.encodeSync(ReviewedPlan)
const encodedApply = Schema.encodeSync(ApplyOutcome)

const makeDestination = Effect.fn("pluginsdk.cli.makeDestination")(function*(
  host: HostType,
  home: string,
  project: Option.Option<string>,
  path: string
) {
  const value = Option.match(project, {
    onNone: () => ({ type: "user", host, home }),
    onSome: (root) => ({ type: "project", host, home, root })
  })
  return yield* Schema.decodeUnknownEffect(Schema.toType(Destination))(value).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Destination paths must be non-empty" }))
  )
})

const targetText = (target: Target): Array<string> => {
  const destination = Match.value(target.destination).pipe(
    Match.discriminatorsExhaustive("type")({
      user: (value) => [
        `host: ${value.host}`,
        "scope: user",
        `home: ${value.home}`
      ],
      project: (value) => [
        `host: ${value.host}`,
        "scope: project",
        `home: ${value.home}`,
        `project root: ${value.root}`
      ]
    })
  )
  return [`plugin: ${target.plugin}`, `physical target key: ${target.key}`, ...destination, `native version: ${target.version}`, `profile: ${target.profile}`]
}

const planChangeSummary = (plan: ReadyPlanType): {
  readonly intent: string
  readonly bundle: Bundle | null
} => Match.value(plan.change).pipe(
  Match.discriminatorsExhaustive("type")({
    install: (change) => ({ intent: "install", bundle: change.bundle }),
    replace: (change) => ({ intent: "replace", bundle: change.bundle }),
    remove: () => ({ intent: "remove", bundle: null })
  })
)

const companionPlanText = (plan: ReviewedPlanType): ReadonlyArray<string> => {
  const capture = plan.companions
  if (capture === undefined) return []
  const previous = capture.previous.map((file) => ({ name: file.name, digest: fileDigest(file.content) }))
  const desired = capture.desired.map((file) => ({ name: file.name, digest: fileDigest(file.content) }))
  const before = new Map(previous.map((file) => [file.name, file.digest]))
  const changes = reviewCompanions({
    previous,
    desired,
    observed: companionNames(capture).map((name) => {
      const digest = before.get(name)
      return { name, observed: digest === undefined ? { type: "absent" } : { type: "file", digest } }
    })
  })
  return Match.value(changes).pipe(Match.discriminatorsExhaustive("type")({
    blocked: () => { throw new Error("Reviewed companion capture is inconsistent") },
    ready: ({ changes }) => changes.map((change) => Match.value(change).pipe(Match.discriminatorsExhaustive("type")({
      create: ({ name, after }) => `agent role: ${name} create after=${after}`,
      replace: ({ name, before, after }) => `agent role: ${name} replace before=${before} after=${after}`,
      remove: ({ name, before }) => `agent role: ${name} remove before=${before}`,
      keep: ({ name, digest }) => `agent role: ${name} keep digest=${digest}`
    })))
  }))
}

const readyPlanText = (status: string, plan: ReadyPlanType): string => {
  const summary = planChangeSummary(plan)
  const fileLines = summary.bundle === null
    ? []
    : summary.bundle.files.map((file) => `file: ${file.path} executable=${file.executable}`)
  const executableCount = summary.bundle === null
    ? 0
    : summary.bundle.files.filter((file) => file.executable).length
  const projectLines = plan.project === undefined || plan.target.destination.type !== "project" ? [] : [
    `project config: ${join(plan.target.destination.root, ".codex", "config.toml")}`,
    `project config before: ${Match.value(plan.project.before).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => "absent",
      file: ({ digest, mode }) => `sha256=${digest} mode=${mode.toString(8).padStart(4, "0")}`,
      windows_file: ({ digest, attributes, security }) =>
        `sha256=${digest} attributes=0x${attributes.toString(16).padStart(8, "0")} access-policy=sha256=${security}`
    }))}`
  ]
  return [
    `status: ${status}`,
    `intent: ${summary.intent}`,
    ...targetText(plan.target),
    `plan ID: ${plan.id}`,
    `before: ${plan.before.observed.type}`,
    `journal revision: ${plan.before.revision ?? "none"}`,
    `owned bundle: ${plan.before.receipt?.identity.bundle ?? "none"}`,
    `bundle digest: ${summary.bundle?.digest ?? "none"}`,
    `files: ${fileLines.length} (${executableCount} executable)`,
    ...fileLines,
    ...projectLines,
    ...companionPlanText(plan)
  ].join("\n")
}

const repairPlanText = (status: string, plan: RepairPlanType): string => {
  const action = Match.value(plan.before.observed.residual).pipe(
    Match.when("absent", () => "none"),
    Match.when("marketplace", () => "remove marketplace"),
    Match.when("companions", () => "remove owned agent roles"),
    Match.when("local", () => "archive owned local plugin packages"),
    Match.when("marketplace_and_companions", () => "remove marketplace and owned agent roles"),
    Match.exhaustive
  )
  return [
    `status: ${status}`,
    "intent: repair",
    ...targetText(plan.target),
    `plan ID: ${plan.id}`,
    `interrupted plan ID: ${plan.before.interrupted}`,
    `current pending plan ID: ${plan.before.pending}`,
    `observed residual: ${plan.before.observed.residual}`,
    `observed fingerprint: ${plan.before.observed.fingerprint}`,
    `intended action: ${action}`,
    ...companionPlanText(plan)
  ].join("\n")
}

const reviewedPlanText = (status: string, plan: ReviewedPlanType): string =>
  Match.value(plan).pipe(Match.discriminatorsExhaustive("type")({
    ready: (value) => readyPlanText(status, value),
    repair_ready: (value) => repairPlanText(status, value)
  }))

const targetStateText = (status: string, target: Target, intent: string): string => [
  `status: ${status}`,
  `intent: ${intent}`,
  ...targetText(target),
  "bundle digest: none",
  "files: 0 (0 executable)"
].join("\n")

const planningText = (planning: PlanningType): { readonly text: string; readonly recovery: boolean } =>
  Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
    ready: (plan) => ({ text: readyPlanText("ready", plan), recovery: false }),
    repair_ready: (plan) => ({ text: repairPlanText("repair_ready", plan), recovery: false }),
    unchanged: (result) => ({ text: targetStateText("unchanged", result.target, "already satisfied"), recovery: false }),
    blocked: (result) => ({
      text: [
        targetStateText("blocked", result.target, "blocked by conflicting host state"),
        `reason: ${result.reason}`,
        "recovery: resolve the host state conflict, then create a new plan"
      ].join("\n"),
      recovery: true
    }),
    pending: (result) => ({
      text: [
        reviewedPlanText("pending", result.plan),
        "recovery: applying the pending plan only inspects host state",
        "recovery: inspect host state, then pass the saved plan to \"pluginsdk repair <reviewed-plan.json> --out cleanup.json\" for a fresh cleanup review"
      ].join("\n"),
      recovery: true
    })
  }))

const applyText = (outcome: ApplyOutcomeType): { readonly text: string; readonly failure: boolean } =>
  Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
    uncertain: () => ({
      text: "status: uncertain\nrecovery: inspect the host state before retrying the reviewed plan",
      failure: true
    }),
    completed: (value) => Match.value(value.result).pipe(Match.discriminatorsExhaustive("type")({
      installed: (result) => ({
        text: `status: completed\nresult: installed\nplan ID: ${result.receipt.identity.plan}\nbundle digest: ${result.receipt.identity.bundle}`,
        failure: false
      }),
      removed: () => ({ text: "status: completed\nresult: removed", failure: false }),
      not_applied: () => ({
        text: "status: completed\nresult: not_applied\nrecovery: review the host result before creating a new plan",
        failure: true
      })
    }))
  }))

const planFlags = () => ({
  host: Flag.Literals("host", Host.literals).pipe(
    Flag.withDescription("Installation host")
  ),
  home: Flag.String("home").pipe(Flag.withDescription("Existing host configuration directory")),
  project: Flag.String("project").pipe(Flag.optional, Flag.withDescription("Project root for project scope")),
  out: Flag.String("out").pipe(Flag.withDescription("Planning JSON output path")),
  json: jsonFlag()
})

const planCommand = Command.make(
  "plan",
  {
    bundle: Argument.String("bundle.json"),
    ...planFlags()
  },
  Effect.fn("pluginsdk.cli.plan")(function*(input) {
    const bundle = yield* readBundle(input.bundle).pipe(Effect.mapError(toCliFailure))
    const destination = yield* makeDestination(input.host, input.home, input.project, input.bundle).pipe(
      Effect.mapError(toCliFailure)
    )
    const planning = yield* Installer.use((installer) => installer.plan({ destination, intent: { type: "present", bundle } })).pipe(Effect.mapError(toCliFailure))
    const encoded = encodedPlanning(planning)
    yield* writeJson(input.out, encoded).pipe(Effect.mapError(toCliFailure))
    const summary = planningText(planning)
    yield* Console.log(input.json ? canonicalJson(encoded) : summary.text)
    if (summary.recovery) yield* Effect.sync(() => { process.exitCode = 1 })
  })
).pipe(Command.withDescription("Plan installation of a plugin bundle"))

const removeCommand = Command.make(
  "remove",
  {
    plugin: Argument.String("PluginId"),
    ...planFlags()
  },
  Effect.fn("pluginsdk.cli.remove")(function*(input) {
    const destination = yield* makeDestination(input.host, input.home, input.project, input.plugin).pipe(
      Effect.mapError(toCliFailure)
    )
    const plugin = yield* Schema.decodeEffect(PluginId)(input.plugin).pipe(Effect.mapError(() => new CliFailure({ message: "Invalid plugin ID" })))
    const planning = yield* Installer.use((installer) => installer.plan({ destination, intent: { type: "absent", plugin } })).pipe(Effect.mapError(toCliFailure))
    const encoded = encodedPlanning(planning)
    yield* writeJson(input.out, encoded).pipe(Effect.mapError(toCliFailure))
    const summary = planningText(planning)
    yield* Console.log(input.json ? canonicalJson(encoded) : summary.text)
    if (summary.recovery) yield* Effect.sync(() => { process.exitCode = 1 })
  })
).pipe(Command.withDescription("Plan removal of a plugin"))

const repairCommand = Command.make(
  "repair",
  {
    plan: Argument.String("reviewed-plan.json"),
    out: Flag.String("out").pipe(Flag.withDescription("Cleanup planning JSON output path")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.repair")(function*(input) {
    const plan = yield* readPlan(input.plan).pipe(Effect.mapError(toCliFailure))
    const planning = yield* Installer.use((installer) => installer.plan({
      destination: plan.target.destination,
      intent: { type: "repair", plugin: plan.target.plugin, pending: plan.id }
    })).pipe(Effect.mapError(toCliFailure))
    const encoded = encodedPlanning(planning)
    yield* writeJson(input.out, encoded).pipe(Effect.mapError(toCliFailure))
    const summary = planningText(planning)
    yield* Console.log(input.json ? canonicalJson(encoded) : summary.text)
    if (summary.recovery) yield* Effect.sync(() => { process.exitCode = 1 })
  })
).pipe(Command.withDescription("Review cleanup for an interrupted plugin operation"))

const applyCommand = Command.make(
  "apply",
  {
    plan: Argument.String("reviewed-plan.json"),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.apply")(function*(input) {
    const plan = yield* readPlan(input.plan).pipe(Effect.mapError(toCliFailure))
    const outcome = yield* Installer.use((installer) => installer.apply(plan)).pipe(Effect.mapError(toCliFailure))
    if (input.json) {
      yield* Console.log(canonicalJson(encodedApply(outcome)))
      const summary = applyText(outcome)
      if (summary.failure) yield* Effect.sync(() => { process.exitCode = 1 })
      return
    }
    const summary = applyText(outcome)
    yield* Console.log(summary.text)
    if (summary.failure) yield* Effect.sync(() => { process.exitCode = 1 })
  })
).pipe(Command.withDescription("Apply a reviewed plan"))

const showCommand = Command.make(
  "show",
  {
    plan: Argument.String("reviewed-plan.json"),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.show")(function*(input) {
    const plan = yield* readPlan(input.plan).pipe(Effect.mapError(toCliFailure))
    yield* Console.log(input.json ? canonicalJson(encodedPlan(plan)) : reviewedPlanText(plan.type, plan))
  })
).pipe(Command.withDescription("Show a reviewed plan without printing package contents"))

const versionSchema = Schema.Struct({ version: Schema.NonEmptyString })
const packageMetadata: unknown = createRequire(import.meta.url)("pluginsdk/package.json")
const version = Schema.decodeUnknownSync(versionSchema)(packageMetadata).version

const rootCommand = Command.make("pluginsdk").pipe(
  Command.withDescription("Build, preview and publish plugins across agent clients"),
  Command.withSubcommands([buildCommand, previewCommand, publishCommand, planCommand, removeCommand, repairCommand, applyCommand, showCommand, catalogCommand, distributionCommand]),
  Command.run({ version }),
  Effect.provide(Layer.merge(PluginSdkLive, NodeServices.layer)),
  Effect.catchTag("CliFailure", (failure) => Effect.gen(function*() {
    yield* Console.error(failure.message)
    yield* Effect.sync(() => { process.exitCode = 1 })
  })),
  Effect.scoped
)

NodeRuntime.runMain(rootCommand)
