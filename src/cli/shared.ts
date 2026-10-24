import { Effect, FileSystem, Match, Schema } from "effect"
import { Flag } from "effect/cli"
import { BuildRejected, Bundle, BundleRejected, SourceUnavailable, type BuildIssue, type BundleIssue, type LocalMcpProblem } from "../../contracts/Compiler.ts"
import { DistributionInputRejected, DistributionRejected, DistributionUnavailable } from "../../contracts/Distribution.ts"
import { DestinationUnsupported, HostUnavailable, PlanRejected, ReviewedPlan, StateUnavailable } from "../../contracts/Installer.ts"
import { Plugin } from "../../contracts/Plugin.ts"
import { ProjectError } from "../../contracts/Project.ts"
import { ArtifactRejected, ArtifactUnavailable, CatalogInputRejected, CatalogUnavailable, ContractRejected, PackageSetRejected } from "../../contracts/Registry.ts"
import { McpContract } from "../../contracts/ToolContract.ts"
import type { ContractRejection } from "../../contracts/ToolContract.ts"
import { jsonBytes, parseJson, type Json } from "../internal/json.ts"
import { snapshotPlan } from "../installer/lifecycle/plans.ts"

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
  | ProjectError
  | InputRejected
  | OutputRejected
  | BuildRejected
  | SourceUnavailable
  | BundleRejected
  | DestinationUnsupported
  | HostUnavailable
  | StateUnavailable
  | PlanRejected
  | CatalogUnavailable
  | CatalogInputRejected
  | PackageSetRejected
  | ContractRejected
  | ArtifactUnavailable
  | ArtifactRejected
  | DistributionInputRejected
  | DistributionRejected
  | DistributionUnavailable

const processProblemText = (problem: LocalMcpProblem): string => Match.value(problem).pipe(
  Match.discriminatorsExhaustive("type")({
    missing_file: ({ path }) => `file is not captured: ${path}`,
    not_executable: ({ path }) => `packaged command is not executable: ${path}`,
    missing_directory: ({ path }) => `directory is not captured: ${path}`,
    environment_reference_unsupported: ({ name }) => `client cannot supply environment source: ${name}`,
    environment_collision: ({ name }) => `duplicate environment binding: ${name}`
  })
)

const buildIssueText = (issue: BuildIssue): string => Match.value(issue).pipe(
  Match.discriminatorsExhaustive("type")({
    invalid_metadata: (value) => `invalid ${value.field} metadata`,
    invalid_skill: (value) => `invalid skill at ${value.path}`,
    invalid_asset: (value) => `invalid asset at ${value.path}`,
    invalid_agent: (value) => `invalid agent prompt at ${value.path}`,
    invalid_executable: (value) => `invalid executable declaration at ${value.path}: ${value.detail}`,
    path_collision: (value) => `path collision at ${value.path}`,
    reserved_asset: (value) => `asset uses a native component path at ${value.path}`,
    unsupported_feature: (value) => `${value.format} cannot preserve ${value.feature}`,
    source_escape: (value) => `source path escapes at ${value.path}`,
    invalid_process: (value) => `invalid MCP process for ${value.server}: ${processProblemText(value.reason)}`,
    invalid_hook_process: (value) => `invalid hook process for ${value.hook}: ${processProblemText(value.reason)}`,
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

const contractRejectionText = (reason: ContractRejection): string => Match.value(reason).pipe(
  Match.discriminatorsExhaustive("type")({
    duplicate_tools: ({ tools }) => `duplicate tools: ${tools.join(", ")}`,
    binding: ({ issues }) => `contract binding mismatch: ${issues.join(", ")}`
  })
)

export const toCliFailure = (failure: CommandFailure): CliFailure => Match.value(failure).pipe(
  Match.tagsExhaustive({
    ProjectError: (value) => new CliFailure({ message: value.detail }),
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
    PlanRejected: (value) => new CliFailure({ message: `Plan rejected: ${value.reason}` }),
    CatalogUnavailable: () => new CliFailure({ message: "Catalog state is unavailable; inspect the catalog before retrying" }),
    CatalogInputRejected: () => new CliFailure({ message: "Catalog input is invalid" }),
    PackageSetRejected: (value) => new CliFailure({ message: `Package set rejected: ${value.issues.map((issue) => `${issue.format}: ${issue.type}`).join("; ")}` }),
    ContractRejected: (value) => new CliFailure({ message: `Contract rejected: ${contractRejectionText(value.reason)}` }),
    ArtifactUnavailable: () => new CliFailure({ message: "Artifact source is unavailable" }),
    ArtifactRejected: (value) => new CliFailure({ message: Match.value(value.reason).pipe(
      Match.when("digest_mismatch", () => "Artifact rejected: digest mismatch"),
      Match.when("invalid_archive", () => "Artifact rejected: invalid archive"),
      Match.when("too_large", () => "Artifact rejected: exceeds 64 MiB"),
      Match.exhaustive
    ) }),
    DistributionInputRejected: () => new CliFailure({ message: "Distribution input is invalid" }),
    DistributionRejected: (value) => new CliFailure({ message: `Distribution rejected: ${value.reason}` }),
    DistributionUnavailable: () => new CliFailure({ message: "Distribution state is unavailable; inspect it before retrying" })
  })
)

export const readJson = Effect.fn("pluginsdk.cli.readJson")(function*(path: string): Effect.fn.Return<Json, InputRejected, FileSystem.FileSystem> {
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

export const readPlugin = Effect.fn("pluginsdk.cli.readPlugin")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Plugin, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Plugin definition does not match the Plugin schema" }))
  )
})

export const readBundle = Effect.fn("pluginsdk.cli.readBundle")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(Bundle, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Bundle does not match the Bundle schema" }))
  )
})

export const readMcpContract = Effect.fn("pluginsdk.cli.readMcpContract")(function*(path: string) {
  const json = yield* readJson(path)
  return yield* Schema.decodeUnknownEffect(McpContract, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Contract does not match the McpContract schema" }))
  )
})

export const readPlan = Effect.fn("pluginsdk.cli.readPlan")(function*(path: string) {
  const json = yield* readJson(path)
  const plan = yield* Schema.decodeUnknownEffect(ReviewedPlan, { onExcessProperty: "error" })(json).pipe(
    Effect.mapError(() => new InputRejected({ path, detail: "Plan does not match the ReviewedPlan schema" }))
  )
  return yield* Effect.try({ try: () => snapshotPlan(plan), catch: () => new InputRejected({ path, detail: "Plan commitment or bundle is invalid" }) })
})

export const writeJson = Effect.fn("pluginsdk.cli.writeJson")(function*(path: string, value: Json) {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFile(path, jsonBytes(value)).pipe(
    Effect.mapError(() => new OutputRejected({ path, detail: "Cannot write output file" }))
  )
})

export const jsonFlag = () => Flag.Boolean("json").pipe(
  Flag.withDescription("Print the encoded schema value as JSON"),
  Flag.withDefault(false)
)
