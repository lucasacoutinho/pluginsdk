import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { BuildRejected, BuildRequest, Compiler, SourceUnavailable, type BuildIssue, type Bundle, type PackageFile } from "../../contracts/Compiler.ts"
import { Plugin } from "../../contracts/Plugin.ts"
import { bundleDigest, fileDigest } from "../internal/identity.ts"
import { jsonBytes } from "../internal/json.ts"
import { render } from "../model/compiler.ts"
import { assemble } from "../model/assembly.ts"
import { capture } from "./capture.ts"
import { isNativeVersion, nativeLocations, validateBundle } from "./native.ts"

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
  const [head, ...tail] = issues
  if (head !== undefined) throw new BuildRejected({ issues: [head, ...tail] })
}

const encodeRequest = Schema.encodeSync(BuildRequest)
const decodeRequest = Schema.decodeSync(BuildRequest)

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
    const captured = yield* capture(request).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.catchTag("PlatformError", (cause) => new SourceUnavailable({ root: request.root, cause }))
    )
    const encoded = yield* Schema.encodeEffect(Plugin)(request.plugin).pipe(Effect.orDie)
    const rendered = render({
      format: nativeLocations(request.format).base,
      metadata: { id: request.plugin.id, version: request.plugin.version, description: request.plugin.description },
      skills: captured.skills,
      mcp: encoded.mcp
    })
    if (rendered.type === "rejected") return yield* new BuildRejected({ issues: rendered.issues })
    const materialize = (file: typeof rendered.files[number]): PackageFile => Match.value(file).pipe(
      Match.discriminatorsExhaustive("type")({
        json: (file) => ({ path: file.path, content: jsonBytes(file.value), executable: false }),
        copy: (file) => {
          const content = captured.contents.get(file.digest)
          if (content === undefined) throw new Error("Captured content table is inconsistent")
          return { path: file.path, content, executable: file.executable }
        }
      })
    )
    const [head, ...tail] = rendered.files
    let files: [PackageFile, ...PackageFile[]] = [materialize(head), ...tail.map(materialize)]
    if (nativeLocations(request.format).assets) {
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
