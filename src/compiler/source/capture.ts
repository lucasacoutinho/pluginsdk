import { Effect, Match } from "effect"
import { BuildRejected, type BuildRequest } from "../../../contracts/Compiler.ts"
import { AgentName, AgentText, PackagePath } from "../../../contracts/Plugin.ts"
import type { AgentsInput } from "../../../contracts/Agents.ts"
import type { ObservedFile, SourceInput, SourceReason } from "../../../contracts/ExecutableIntent.ts"
import type { CapturedFile, FileDigest, Skill } from "../../../contracts/CompilerModel.ts"
import { fileDigest } from "../../internal/identity.ts"
import { SourceFiles, type NativeContent, type SourceReadRejected } from "../../internal/source-files.ts"
import { resolveSourceIntent } from "../../internal/files/executable.ts"
import { skillName } from "./skill.ts"
import { SourceFilesLive } from "./files.ts"

type SourceKind = "skill" | "asset" | "agent"

const invalidSource = (kind: SourceKind, path: PackagePath, detail: string): BuildRejected =>
  Match.value(kind).pipe(
    Match.when("skill", () => new BuildRejected({ issues: [{ type: "invalid_skill", path, detail }] })),
    Match.when("asset", () => new BuildRejected({ issues: [{ type: "invalid_asset", path, detail }] })),
    Match.when("agent", () => new BuildRejected({ issues: [{ type: "invalid_agent", path, detail }] })),
    Match.exhaustive
  )

const sourceRejection = (kind: SourceKind, error: SourceReadRejected): BuildRejected =>
  Match.value(error.reason).pipe(
    Match.when("outside", () => new BuildRejected({ issues: [{ type: "source_escape", path: error.path }] })),
    Match.when("cycle", () => invalidSource(kind, error.path, "Cyclic source directory")),
    Match.when("not_regular", () => invalidSource(kind, error.path, "Only regular files can be captured")),
    Match.when("not_directory", () => invalidSource(kind, error.path, "Source path is not a directory")),
    Match.when("name", () => invalidSource(kind, error.path, "Source path does not match the stored filename")),
    Match.when("path", () => invalidSource(kind, error.path, "A source filename cannot be represented on this filesystem")),
    Match.when("reparse", () => invalidSource(kind, error.path, "Unsupported source reparse point")),
    Match.exhaustive
  )

const intentProblem = (reason: SourceReason): string => Match.value(reason).pipe(
  Match.when("duplicate_file", () => "The source inventory contains a duplicate path"),
  Match.when("duplicate_declaration", () => "The executable path is declared more than once"),
  Match.when("missing_file", () => "The executable path is not among the captured source files"),
  Match.when("unrepresented", () => "This filesystem requires an explicit executables declaration"),
  Match.when("unavailable", () => "Executable permission evidence is unavailable"),
  Match.when("changed", () => "Executable permissions changed during capture"),
  Match.exhaustive
)

const captureSources = Effect.fn("Compiler.captureSources")(function*(request: BuildRequest, host: AgentsInput["host"]) {
  const source = yield* SourceFiles
  const contents = new Map<FileDigest, Uint8Array>()
  const observed = new Map<PackagePath, ObservedFile>()
  const skills: Array<{ directory: PackagePath; name: Skill["name"]; entry: ObservedFile; assets: ObservedFile[] }> = []
  const agents: AgentsInput["agents"][number][] = []
  const observe = (file: NativeContent): ObservedFile => {
    const cached = observed.get(file.path)
    if (cached !== undefined) return cached
    const digest = fileDigest(file.content)
    contents.set(digest, file.content)
    const fact: ObservedFile = { path: file.path, digest, mode: file.mode }
    observed.set(file.path, fact)
    return fact
  }
  const read = Effect.fnUntraced(function*(path: PackagePath, kind: SourceKind) {
    const cached = observed.get(path)
    if (cached !== undefined) return cached
    return observe(yield* source.file(path).pipe(Effect.catchTag("SourceReadRejected", (error) => sourceRejection(kind, error))))
  })
  const select = Effect.fnUntraced(function*(path: PackagePath, kind: SourceKind, mode: "directory" | "either") {
    return yield* source.select(path, mode).pipe(Effect.catchTag("SourceReadRejected", (error) => sourceRejection(kind, error)))
  })

  for (const directory of request.plugin.skills) {
    const entryPath = PackagePath.make(`${directory}/SKILL.md`)
    const entry = yield* read(entryPath, "skill")
    const entryBytes = contents.get(entry.digest)
    if (entryBytes === undefined) return yield* Effect.die(new Error("Captured entry missing from content table"))
    const name = yield* Effect.try({
      try: () => skillName(directory, entryBytes),
      catch: (cause) => new BuildRejected({ issues: [{ type: "invalid_skill", path: entryPath, detail: cause instanceof Error ? cause.message : "Invalid skill frontmatter" }] })
    })
    const files = yield* select(directory, "skill", "directory")
    skills.push({ directory, name, entry, assets: files.filter((file) => file.path !== entryPath).map(observe) })
  }
  for (const [name, definition] of Object.entries(request.plugin.agents ?? {})) {
    const promptPath = definition.prompt
    const source = yield* read(promptPath, "agent")
    const promptBytes = contents.get(source.digest)
    if (promptBytes === undefined) return yield* Effect.die(new Error("Captured agent prompt missing from content table"))
    const prompt = yield* Effect.try({
      try: () => {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(promptBytes)
        if (!text.isWellFormed()) throw new Error("Invalid prompt Unicode")
        return AgentText.make(text.trim())
      },
      catch: () => invalidSource("agent", promptPath, "Prompt must be nonempty valid UTF-8 text without NUL")
    })
    const model = Match.value(host).pipe(
      Match.when("claude_code", () => definition.models?.claude_code ?? null),
      Match.when("codex", () => definition.models?.codex ?? null),
      Match.exhaustive
    )
    agents.push({ name: AgentName.make(name), description: definition.description, prompt, model, shell: definition.shell ?? "host_default" })
  }
  const assets: ObservedFile[] = []
  for (const path of request.plugin.assets ?? []) assets.push(...(yield* select(path, "asset", "either")).map(observe))
  const sources = [...observed.values()]
  const input: SourceInput = request.plugin.executables === undefined
    ? { type: "filesystem", files: sources.map(({ path, mode }) => ({ path, mode })) }
    : { type: "declared", files: sources.map(({ path }) => path), executables: request.plugin.executables }
  const resolved = yield* Match.value(resolveSourceIntent(input)).pipe(Match.discriminatorsExhaustive("type")({
    resolved: ({ files }) => Effect.succeed(files),
    refused: ({ reason, path }) => Effect.fail(new BuildRejected({ issues: [{ type: "invalid_executable", path, detail: intentProblem(reason) }] }))
  }))
  const flags = new Map(resolved.map(({ path, executable }) => [path, executable]))
  const materialize = (source: ObservedFile): CapturedFile => {
    const executable = flags.get(source.path)
    if (executable === undefined) throw new Error("Captured source missing resolved executable intent")
    return { digest: source.digest, executable }
  }
  return {
    skills: skills.map(({ directory, name, entry, assets }) => ({ name, entry: materialize(entry),
      assets: assets.map((file) => ({ ...materialize(file), path: PackagePath.make(file.path.slice(directory.length + 1)) })) })),
    agents,
    assets: assets.map((file) => ({ path: file.path, ...materialize(file) })),
    contents
  }
})

export const capture = Effect.fn("Compiler.capture")(function*(request: BuildRequest, host: AgentsInput["host"]) {
  return yield* captureSources(request, host).pipe(Effect.provide(SourceFilesLive(request.root)))
})
