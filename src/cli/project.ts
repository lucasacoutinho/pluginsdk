import { Console, Effect, FileSystem, Match, Option, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import { Argument, Command, Flag } from "effect/cli"
import { dirname, join, resolve } from "node:path"
import { Bundle } from "../../contracts/Compiler.ts"
import { Directory } from "../../contracts/Plugin.ts"
import { LocalPreviewStatus, PreviewResult, ProjectError, type LocalClient, type PreviewClient } from "../../contracts/Project.ts"
import { LocalClient as ManagedClient, PackageClient } from "../../contracts/Clients.ts"
import { canonicalJson } from "../internal/json.ts"
import { compileProject, readBuild, readDefinition, writeBuild } from "../project/build.ts"
import { publishGit } from "../project/git.ts"
import { capturedPublication, preparePublication } from "../project/marketplace.ts"
import { previewProject } from "../project/preview/index.ts"
import { CliFailure, jsonFlag, toCliFailure, writeJson } from "./shared.ts"

const definitionArgument = () => Argument.String("definition.json").pipe(
  Argument.withDefault("definition.json"),
  Argument.withDescription("Definition; defaults to definition.json in the current directory")
)
const targetFlag = (description: string) => Flag.Literals("target", ManagedClient.literals).pipe(
  Flag.optional, Flag.withDescription(description)
)
const selectedClients = (target: Option.Option<LocalClient>, defaults: NonEmptyReadonlyArray<LocalClient>): NonEmptyReadonlyArray<LocalClient> => Option.match(target, {
  onNone: () => defaults, onSome: (client) => [client]
})
const sourceRoot = (path: string) => Schema.decodeEffect(Directory)(resolve(path)).pipe(
  Effect.mapError(() => new CliFailure({ message: "Source root must be a directory path" }))
)
const encodedBundle = Schema.encodeSync(Bundle)
const previewFailed = (status: PreviewClient["status"]): boolean => Match.value(status).pipe(
  Match.when("missing", () => false), Match.when("unchanged", () => false),
  Match.when("installed", () => false), Match.when("removed", () => false),
  Match.when("inherited", () => false),
  Match.when("not_applied", () => true), Match.when("uncertain", () => true), Match.exhaustive
)

const previewLine = (result: PreviewClient): string => Match.value(result).pipe(
  Match.when({ status: "inherited" }, ({ client, provider }) => `${client}: inherited from ${provider.client} (${provider.home})`),
  Match.when({ status: Match.is(...LocalPreviewStatus.literals) }, ({ client, status, home }) => `${client}: ${status} (${home})`),
  Match.exhaustive
)

export const buildCommand = Command.make("build", {
  definition: definitionArgument(),
  root: Flag.String("root").pipe(Flag.optional, Flag.withDescription("Source directory; defaults to the definition's directory")),
  target: targetFlag("Select one client package; defaults to Claude Code and Codex"),
  out: Flag.String("out").pipe(Flag.optional, Flag.withDescription("Build directory; defaults to .pluginsdk/build")),
  json: jsonFlag()
}, Effect.fn("pluginsdk.cli.build")(function*(input) {
  const definition = yield* readDefinition(input.definition).pipe(Effect.mapError(toCliFailure))
  const root = yield* sourceRoot(Option.getOrElse(input.root, () => dirname(resolve(input.definition))))
  const output = Option.getOrElse(input.out, () => join(".pluginsdk", "build"))
  const bundles = yield* compileProject(definition, root, selectedClients(input.target, PackageClient.literals)).pipe(Effect.mapError(toCliFailure))
  const fs = yield* FileSystem.FileSystem
  const files = bundles.map((bundle) => ({
    bundle,
    path: join(output, `${bundle.format}.bundle.json`)
  }))
  for (const { bundle, path } of files) {
    yield* fs.makeDirectory(dirname(path), { recursive: true }).pipe(Effect.mapError(() => new CliFailure({ message: `Cannot create output directory for ${path}` })))
    yield* writeJson(path, encodedBundle(bundle)).pipe(Effect.mapError(toCliFailure))
  }
  yield* writeBuild(output, definition, bundles).pipe(Effect.mapError(toCliFailure))
  for (const { bundle, path } of files) yield* Console.log(input.json ? canonicalJson(encodedBundle(bundle)) : [
    `Built ${bundle.plugin} (${bundle.format})`, `bundle digest: ${bundle.digest}`, `files: ${bundle.files.length}`, `output: ${path}`
  ].join("\n"))
})).pipe(Command.withDescription("Build Claude Code and Codex packages from one definition"))

export const previewCommand = Command.make("preview", {
  definition: definitionArgument(),
  target: targetFlag("Select one client; defaults to supported local clients"),
  root: Flag.String("root").pipe(Flag.optional, Flag.withDescription("Source directory; defaults to the definition's directory")),
  remove: Flag.Boolean("remove").pipe(Flag.withDefault(false), Flag.withDescription("Remove this project's local development plugin")),
  json: jsonFlag()
}, Effect.fn("pluginsdk.cli.preview")(function*(input) {
  const definition = yield* readDefinition(input.definition).pipe(Effect.mapError(toCliFailure))
  const root = yield* sourceRoot(Option.getOrElse(input.root, () => dirname(resolve(input.definition))))
  const defaults = process.platform === "win32" && process.arch === "x64" ? ManagedClient.literals : PackageClient.literals
  const result = yield* previewProject(definition, root, selectedClients(input.target, defaults), input.remove).pipe(Effect.mapError(toCliFailure))
  const encoded = yield* Schema.encodeEffect(PreviewResult)(result).pipe(Effect.mapError(() => new CliFailure({ message: "Invalid preview result" })))
  yield* Console.log(input.json ? canonicalJson(encoded) : [
    `Local preview: ${result.plugin}`, ...result.clients.map(previewLine),
    ...(input.remove ? [] : ["Open a fresh client session to use the preview."])
  ].join("\n"))
  if (result.clients.some(({ status }) => previewFailed(status))) yield* Effect.sync(() => { process.exitCode = 1 })
})).pipe(Command.withDescription("Install a development copy in your local clients"))

export const publishCommand = Command.make("publish", {
  definition: definitionArgument(),
  build: Flag.String("build").pipe(Flag.withDefault(join(".pluginsdk", "build")), Flag.withDescription("Captured build directory")),
  json: jsonFlag()
}, Effect.fn("pluginsdk.cli.publish")(function*(input) {
  const definition = yield* readDefinition(input.definition).pipe(Effect.mapError(toCliFailure))
  if (definition.publish === undefined) return yield* toCliFailure(new ProjectError({ detail: "Add a publish destination to the definition, then run pluginsdk build" }))
  const build = yield* readBuild(input.build, definition).pipe(Effect.mapError(toCliFailure))
  const release = capturedPublication(build)
  const outcome = yield* publishGit(definition.publish, preparePublication(definition.publish, build)).pipe(Effect.mapError(toCliFailure))
  const uncertain = Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
    published: () => false, unchanged: () => false, uncertain: () => true
  }))
  const result = {
    type: outcome.type,
    plugin: release.plugin, version: release.version, digest: release.digest,
    marketplace: definition.publish.marketplace, branch: definition.publish.branch, commit: outcome.commit
  }
  yield* Console.log(input.json ? canonicalJson(result) : [
    `${outcome.type}: ${release.plugin}@${release.version}`,
    `marketplace: ${definition.publish.marketplace} (${definition.publish.branch})`,
    `commit: ${outcome.commit ?? "unconfirmed"}`,
    ...(uncertain ? ["Publication could not be confirmed. Run publish again to inspect the destination before retrying."] : [])
  ].join("\n"))
  if (uncertain) yield* Effect.sync(() => { process.exitCode = 1 })
})).pipe(Command.withDescription("Publish the captured build to the destination in the definition"))
