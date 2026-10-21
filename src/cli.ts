#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, FileSystem, Layer, Match, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { createRequire } from "node:module"
import {
  BuildRejected,
  Bundle,
  BundleRejected,
  Compiler,
  Format,
  SourceUnavailable,
  type BuildIssue,
  type BundleIssue
} from "../contracts/Compiler.ts"
import {
  ApplyOutcome,
  Destination,
  DestinationUnsupported,
  HostUnavailable,
  Installer,
  PlanRejected,
  Planning,
  ReadyPlan,
  StateUnavailable,
  type ApplyOutcome as ApplyOutcomeType,
  type Host as HostType,
  type Planning as PlanningType,
  type ReadyPlan as ReadyPlanType,
  type Target
} from "../contracts/Installer.ts"
import { Directory, Plugin, PluginId } from "../contracts/Plugin.ts"
import { canonicalJson, jsonBytes, parseJson, type Json } from "./internal/json.ts"
import { PluginSdkLive } from "./node.ts"
import { snapshotPlan } from "./installer/plan.ts"

export class InputRejected extends Schema.TaggedError<InputRejected, { readonly brand: unique symbol }>()("InputRejected", {
  path: Schema.String,
  detail: Schema.NonEmptyString
}) {}

export class OutputRejected extends Schema.TaggedError<OutputRejected, { readonly brand: unique symbol }>()("OutputRejected", {
  path: Schema.String,
  detail: Schema.NonEmptyString
}) {}

export class CliFailure extends Schema.TaggedError<CliFailure, { readonly brand: unique symbol }>()("CliFailure", {
  message: Schema.NonEmptyString
}) {}

type CommandFailure =
  | InputRejected
  | OutputRejected
  | BuildRejected
  | SourceUnavailable
  | BundleRejected
  | DestinationUnsupported
  | HostUnavailable
  | StateUnavailable
  | PlanRejected

const buildIssueText = (issue: BuildIssue): string => Match.value(issue).pipe(
  Match.discriminatorsExhaustive("type")({
    invalid_metadata: (value) => `invalid ${value.field} metadata`,
    invalid_skill: (value) => `invalid skill at ${value.path}`,
    invalid_asset: (value) => `invalid asset at ${value.path}`,
    path_collision: (value) => `path collision at ${value.path}`,
    reserved_asset: (value) => `asset uses a native component path at ${value.path}`,
    unsupported_feature: (value) => `${value.format} cannot preserve ${value.feature}`,
    source_escape: (value) => `source path escapes at ${value.path}`,
    unsupported_mcp: (value) => `unsupported MCP configuration for ${value.server}: ${value.reason.type}`
  })
)

const bundleIssueText = (issue: BundleIssue): string => Match.value(issue).pipe(
  Match.discriminatorsExhaustive("type")({
    digest_mismatch: () => "bundle digest mismatch",
    noncanonical_order: () => "bundle files are not in canonical order",
    path_collision: (value) => `path collision at ${value.path}`,
    invalid_native_package: () => "invalid native package"
  })
)

const toCliFailure = (failure: CommandFailure): CliFailure => Match.value(failure).pipe(
  Match.tagsExhaustive({
    InputRejected: (value) => new CliFailure({ message: `${value.path}: ${value.detail}` }),
    OutputRejected: (value) => new CliFailure({ message: `${value.path}: ${value.detail}` }),
    BuildRejected: (value) => new CliFailure({ message: `Build rejected: ${value.issues.map(buildIssueText).join("; ")}` }),
    SourceUnavailable: (value) => new CliFailure({ message: `Source unavailable under ${value.root}` }),
    BundleRejected: (value) => new CliFailure({ message: `Bundle rejected: ${value.issues.map(bundleIssueText).join("; ")}` }),
    DestinationUnsupported: (value) => new CliFailure({
      message: `Destination is unsupported for ${value.destination.host}: ${value.detail}`
    }),
    HostUnavailable: (value) => new CliFailure({ message: `Host unavailable: ${value.host}` }),
    StateUnavailable: () => new CliFailure({ message: "Installation state is unavailable; inspect the host state before retrying" }),
    PlanRejected: (value) => new CliFailure({ message: `Plan rejected: ${value.reason}` })
  })
)

const readJson = Effect.fn("pluginsdk.cli.readJson")(function*(path: string): Effect.fn.Return<Json, InputRejected, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const bytes = yield* fs.readFile(path).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Cannot read input file" }))
  )
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: () => new InputRejected({ path, detail: "Input file is not valid UTF-8" })
  })
  return yield* Effect.try({
    try: () => parseJson(text),
    catch: () => new InputRejected({ path, detail: "Input is not valid JSON" })
  })
})

const readPlugin = Effect.fn("pluginsdk.cli.readPlugin")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Plugin, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Plugin definition does not match the Plugin schema" }))
  )
})

const readBundle = Effect.fn("pluginsdk.cli.readBundle")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Bundle, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Bundle does not match the Bundle schema" }))
  )
})

const readPlan = Effect.fn("pluginsdk.cli.readPlan")(function*(path: string) {
  const json = yield* readJson(path)
  const plan = yield* Schema.decodeUnknownEffect(ReadyPlan, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Plan does not match the ReadyPlan schema" }))
  )
  return yield* Effect.try({ try: () => snapshotPlan(plan), catch: () => new InputRejected({ path, detail: "Plan commitment or bundle is invalid" }) })
})

const writeJson = Effect.fn("pluginsdk.cli.writeJson")(function*(path: string, value: Json) {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFile(path, jsonBytes(value)).pipe(
    Effect.mapError(() => new OutputRejected({ path, detail: "Cannot write output file" }))
  )
})

const encodedBundle = Schema.encodeSync(Bundle)
const encodedPlanning = Schema.encodeSync(Planning)
const encodedPlan = Schema.encodeSync(ReadyPlan)
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

const readyPlanText = (status: string, plan: ReadyPlanType): string => {
  const summary = planChangeSummary(plan)
  const fileLines = summary.bundle === null
    ? []
    : summary.bundle.files.map((file) => `file: ${file.path} executable=${file.executable}`)
  const executableCount = summary.bundle === null
    ? 0
    : summary.bundle.files.filter((file) => file.executable).length
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
    ...fileLines
  ].join("\n")
}

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
        readyPlanText("pending", result.plan),
        "recovery: inspect host state and the pending plan before retrying; do not create a new plan"
      ].join("\n"),
      recovery: true
    })
  }))

const applyText = (outcome: ApplyOutcomeType): { readonly text: string; readonly failure: boolean } =>
  Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
    uncertain: () => ({
      text: "status: uncertain\nrecovery: inspect the host state before retrying the original ready plan",
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

const jsonFlag = () => Flag.Boolean("json").pipe(
  Flag.withDescription("Print the encoded schema value as JSON"),
  Flag.withDefault(false)
)

const buildCommand = Command.make(
  "build",
  {
    definition: Argument.String("definition.json"),
    root: Flag.String("root").pipe(Flag.withDefault("."), Flag.withDescription("Source root directory")),
    format: Flag.Literals("format", Format.literals).pipe(
      Flag.withDefault("agent_plugins_v1"),
      Flag.withDescription("Native package format")
    ),
    out: Flag.String("out").pipe(Flag.withDescription("Bundle JSON output path")),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.build")(function*(input) {
    const plugin = yield* readPlugin(input.definition).pipe(Effect.mapError(toCliFailure))
    const root = yield* Schema.decodeEffect(Directory)(input.root).pipe(Effect.mapError(() => new CliFailure({ message: "Source root must be non-empty" })))
    const bundle = yield* Compiler.use((compiler) => compiler.build({ root, plugin, format: input.format })).pipe(Effect.mapError(toCliFailure))
    yield* writeJson(input.out, encodedBundle(bundle)).pipe(Effect.mapError(toCliFailure))
    if (input.json) {
      yield* Console.log(canonicalJson(encodedBundle(bundle)))
      return
    }
    yield* Console.log([
      `Built ${bundle.plugin}`,
      `bundle digest: ${bundle.digest}`,
      `files: ${bundle.files.length}`,
      `output: ${input.out}`
    ].join("\n"))
  })
).pipe(Command.withDescription("Build a byte-complete plugin bundle"))

const planFlags = () => ({
  host: Flag.Literals("host", ["claude_code", "codex", "grok_bot", "muse"]).pipe(
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

const applyCommand = Command.make(
  "apply",
  {
    plan: Argument.String("ready-plan.json"),
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
).pipe(Command.withDescription("Apply a reviewed ready plan"))

const showCommand = Command.make(
  "show",
  {
    plan: Argument.String("ready-plan.json"),
    json: jsonFlag()
  },
  Effect.fn("pluginsdk.cli.show")(function*(input) {
    const plan = yield* readPlan(input.plan).pipe(Effect.mapError(toCliFailure))
    yield* Console.log(input.json ? canonicalJson(encodedPlan(plan)) : readyPlanText("ready", plan))
  })
).pipe(Command.withDescription("Show a ready plan without printing package contents"))

const versionSchema = Schema.Struct({ version: Schema.NonEmptyString })
const packageMetadata: unknown = createRequire(import.meta.url)("pluginsdk/package.json")
const version = Schema.decodeUnknownSync(versionSchema)(packageMetadata).version

const rootCommand = Command.make("pluginsdk").pipe(
  Command.withDescription("Build reproducible agent plugins and apply reviewed plans"),
  Command.withSubcommands([buildCommand, planCommand, removeCommand, applyCommand, showCommand]),
  Command.run({ version }),
  Effect.provide(Layer.merge(PluginSdkLive, NodeServices.layer)),
  Effect.catchTag("CliFailure", (failure) => Effect.gen(function*() {
    yield* Console.error(failure.message)
    yield* Effect.sync(() => { process.exitCode = 1 })
  })),
  Effect.scoped
)

NodeRuntime.runMain(rootCommand)
