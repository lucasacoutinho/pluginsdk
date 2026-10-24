import { Array as EffectArray, Effect, FileSystem, Layer, Match, Schema } from "effect"
import { BuildRejected, BuildRequest, Compiler, SourceUnavailable, type BuildIssue, type Bundle, type PackageFile } from "../../contracts/Compiler.ts"
import { EnvironmentName, HookTimeout, PackagePath, RemoteMcp, type StdioMcp } from "../../contracts/Plugin.ts"
import type { Asset, RenderInput } from "../../contracts/CompilerModel.ts"
import type { Definition, ProcessInput, ProcessPlan } from "../../contracts/Process.ts"
import type { PlannedHook } from "../../contracts/Hooks.ts"
import { bundleDigest, fileDigest } from "../internal/identity.ts"
import { jsonBytes } from "../internal/json.ts"
import { compareUtf8 } from "../internal/paths.ts"
import { render } from "./package/model.ts"
import { assemble } from "./package/assembly.ts"
import { lowerProcess } from "./process/model.ts"
import { renderAgents } from "./agents/model.ts"
import { capture } from "./source/capture.ts"
import { isNativeVersion, nativeLocations, validateBundle } from "./package/native.ts"
import { materializeAgentEntry } from "./agents/native.ts"
import { materializeProcesses } from "./process/materialize.ts"

const checkedMetadata = (request: BuildRequest): void => {
  const issues: BuildIssue[] = []
  for (const field of ["id", "version", "description"] satisfies Array<"id" | "version" | "description">) {
    const value = request.plugin[field]
    if (!value.isWellFormed()) issues.push({ type: "invalid_metadata", field, detail: "Metadata must contain valid Unicode" })
  }
  if (!isNativeVersion(request.plugin.version)) issues.push({ type: "invalid_metadata", field: "version", detail: "Version must be a single native cache path component" })
  if (!nativeLocations(request.format).assets && (request.plugin.assets?.length ?? 0) > 0) {
    issues.push({ type: "unsupported_feature", feature: "assets", format: request.format })
  }
  const hasProcesses = Object.values(request.plugin.mcp).some((server) => Match.value(server).pipe(
    Match.when({ type: "stdio" }, () => true),
    Match.when({ url: Match.defined }, () => false),
    Match.exhaustive
  ))
  if (!nativeLocations(request.format).processes && hasProcesses) issues.push({ type: "unsupported_feature", feature: "stdio", format: request.format })
  if (!nativeLocations(request.format).hooks && Object.keys(request.plugin.hooks ?? {}).length > 0) {
    issues.push({ type: "unsupported_feature", feature: "hooks", format: request.format })
  }
  if (!nativeLocations(request.format).agents && Object.keys(request.plugin.agents ?? {}).length > 0) {
    issues.push({ type: "unsupported_feature", feature: "agents", format: request.format })
  }
  const [head, ...tail] = issues
  if (head !== undefined) throw new BuildRejected({ issues: [head, ...tail] })
}

const encodeRequest = Schema.encodeSync(BuildRequest, { onExcessProperty: "error" })
const decodeRequest = Schema.decodeSync(BuildRequest)
const encodeRemote = Schema.encodeSync(RemoteMcp)

const processDefinition = (source: Pick<StdioMcp, "command" | "args" | "cwd" | "env">): Definition => ({
  command: Match.value(source.command).pipe(
    Match.when(Match.string, (name): Definition["command"] => ({ type: "external", name })),
    Match.when({ file: Match.string }, ({ file }): Definition["command"] => ({ type: "file", path: file })),
    Match.exhaustive
  ),
  args: (source.args ?? []).map((argument) => Match.value(argument).pipe(
    Match.when(Match.string, (value): Definition["args"][number] => ({ type: "literal", value })),
    Match.when({ file: Match.string }, ({ file }): Definition["args"][number] => ({ type: "file", path: file })),
    Match.exhaustive
  )),
  environment: Object.entries(source.env ?? {}).map(([name, value]) => ({
    name: EnvironmentName.make(name),
    value: Match.value(value).pipe(
      Match.when(Match.string, (value): Definition["environment"][number]["value"] => ({ type: "literal", value })),
      Match.when({ type: "environment" }, ({ name }): Definition["environment"][number]["value"] => ({ type: "reference", name })),
      Match.exhaustive
    )
  })),
  cwd: source.cwd ?? null
})

export const CompilerLive = Layer.effect(Compiler, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const build = Effect.fn("Compiler.build")(function*(input: BuildRequest) {
    const request = yield* Effect.try({
      try: () => {
        const snapshot = decodeRequest(structuredClone(encodeRequest(input)), { onExcessProperty: "error" })
        checkedMetadata(snapshot)
        return snapshot
      },
      catch: (cause) => cause instanceof BuildRejected ? cause : new SourceUnavailable({ root: input.root, cause })
    })
    const locations = nativeLocations(request.format)
    const captured = yield* capture(request, locations.host).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.catchTag("PlatformError", (cause) => new SourceUnavailable({ root: request.root, cause }))
    )
    const remoteRows: Array<readonly [string, RenderInput["mcp"][string]]> = []
    const localRows: Array<readonly [string, StdioMcp]> = []
    for (const [name, server] of Object.entries(request.plugin.mcp)) {
      Match.value(server).pipe(
        Match.when({ type: "stdio" }, (source) => { localRows.push([name, source]) }),
        Match.when({ url: Match.defined }, (source) => { remoteRows.push([name, encodeRemote(source)]) }),
        Match.exhaustive
      )
    }
    const remote = Object.fromEntries(remoteRows)
    const rendered = yield* Match.value(render({
      format: locations.base,
      metadata: { id: request.plugin.id, version: request.plugin.version, description: request.plugin.description },
      skills: captured.skills,
      mcp: remote
    })).pipe(Match.discriminatorsExhaustive("type")({
      rendered: (result) => Effect.succeed(result),
      rejected: (result) => Effect.fail(new BuildRejected({ issues: result.issues }))
    }))
    const sourceFiles: Asset[] = [...captured.assets, ...rendered.files.flatMap((file) => Match.value(file).pipe(
      Match.discriminatorsExhaustive("type")({
        json: (): Asset[] => [],
        copy: ({ path, digest, executable }): Asset[] => [{ path, digest, executable }]
      })
    ))]
    const plans: Array<readonly [string, ProcessPlan]> = []
    const processIssues: BuildIssue[] = []
    const host: ProcessInput["host"] = locations.host
    for (const [server, source] of localRows.sort(([left], [right]) => compareUtf8(left, right))) {
      Match.value(lowerProcess({ host, definition: processDefinition(source), files: sourceFiles })).pipe(
        Match.discriminatorsExhaustive("type")({
          planned: ({ plan }) => { plans.push([server, plan]) },
          rejected: ({ issues }) => { processIssues.push(...issues.map((reason): BuildIssue => ({ type: "invalid_process", server, reason }))) }
        })
      )
    }
    const hooks: Array<readonly [string, PlannedHook]> = []
    for (const [hook, source] of Object.entries(request.plugin.hooks ?? {}).sort(([left], [right]) => compareUtf8(left, right))) {
      Match.value(lowerProcess({ host, definition: processDefinition(source), files: sourceFiles })).pipe(
        Match.discriminatorsExhaustive("type")({
          planned: ({ plan }) => { hooks.push([hook, { plan, event: source.event, timeout: source.timeout ?? HookTimeout.make(30) }]) },
          rejected: ({ issues }) => { processIssues.push(...issues.map((reason): BuildIssue => ({ type: "invalid_hook_process", hook, reason }))) }
        })
      )
    }
    const [firstProcessIssue, ...otherProcessIssues] = processIssues
    if (firstProcessIssue !== undefined) return yield* new BuildRejected({ issues: [firstProcessIssue, ...otherProcessIssues] })
    const processes = yield* materializeProcesses({
      mcp: { format: locations.base, remote, local: Object.fromEntries(plans) }, hooks: Object.fromEntries(hooks)
    }, locations.processes, request).pipe(
      Effect.provideService(FileSystem.FileSystem, fs)
    )
    const renderedAgents = yield* Match.value(renderAgents({
      host: locations.host,
      plugin: request.plugin.id,
      agents: captured.agents
    })).pipe(Match.discriminatorsExhaustive("type")({
      rendered: (result) => Effect.succeed(result),
      rejected: ({ issues }) => {
        const extension = Match.value(locations.host).pipe(
          Match.when("claude_code", () => ".md"),
          Match.when("codex", () => ".toml"),
          Match.exhaustive
        )
        return Effect.fail(new BuildRejected({
          issues: EffectArray.map(issues, ({ name }): BuildIssue => ({
            type: "invalid_agent",
            path: PackagePath.make(`agents/${name}${extension}`),
            detail: "Duplicate agent declaration"
          }))
        }))
      }
    }))
    const materialize = (file: typeof rendered.files[number]): PackageFile => Match.value(file).pipe(
      Match.discriminatorsExhaustive("type")({
        json: (file) => ({ path: file.path, content: jsonBytes(file.path === locations.mcp && processes.mcpDocument !== null ? processes.mcpDocument : file.value), executable: false }),
        copy: (file) => {
          const content = captured.contents.get(file.digest)
          if (content === undefined) throw new Error("Captured content table is inconsistent")
          return { path: file.path, content, executable: file.executable }
        }
      })
    )
    const [head, ...tail] = rendered.files
    let files: [PackageFile, ...PackageFile[]] = [materialize(head), ...tail.map(materialize)]
    if (processes.mcpDocument !== null && !files.some((file) => file.path === locations.mcp)) {
      files.push({ path: PackagePath.make(locations.mcp), content: jsonBytes(processes.mcpDocument), executable: false })
    }
    files.push(...processes.files)
    if (processes.hooksDocument !== null) {
      files.push({ path: PackagePath.make("hooks/hooks.json"), content: jsonBytes(processes.hooksDocument), executable: false })
    }
    files.push(...renderedAgents.entries.map((entry) => materializeAgentEntry(locations.host, entry)))
    if (locations.assets) {
      const identify = (file: PackageFile) => {
        const digest = fileDigest(file.content)
        captured.contents.set(digest, file.content)
        return { path: file.path, digest, executable: file.executable }
      }
      const [first, ...rest] = files
      const assembled = yield* Match.value(assemble({ base: [identify(first), ...rest.map(identify)], assets: captured.assets })).pipe(
        Match.discriminatorsExhaustive("type")({
          rejected: (result) => Effect.fail(new BuildRejected({ issues: result.issues })),
          assembled: (result) => Effect.succeed(result.files)
        })
      )
      const resolveCopy = (file: typeof assembled[number]): PackageFile => {
        const content = captured.contents.get(file.digest)
        if (content === undefined) throw new Error("Assembled content table is inconsistent")
        return { path: file.path, content, executable: file.executable }
      }
      const [assembledHead, ...assembledTail] = assembled
      files = [resolveCopy(assembledHead), ...assembledTail.map(resolveCopy)]
    }
    const body = { schema: 1, plugin: request.plugin.id, format: request.format, files } satisfies Omit<Bundle, "digest">
    const bundle: Bundle = { ...body, digest: bundleDigest(body) }
    yield* Effect.try({
      try: () => validateBundle(bundle),
      catch: (cause) => new BuildRejected({ issues: [{ type: "invalid_metadata", field: "id", detail: cause instanceof Error ? cause.message : "Native format rejected package" }] })
    })
    return bundle
  })
  return Compiler.of({ build })
}))
