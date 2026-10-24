import { fileURLToPath } from "node:url"
import { Array as EffectArray, Effect, FileSystem, Match } from "effect"
import { BuildRejected, SourceUnavailable, type BuildIssue, type BuildRequest, type PackageFile } from "../../../contracts/Compiler.ts"
import type { Input, Result } from "../../../contracts/PortableFeatures.ts"
import type { FilePlan } from "../../../contracts/PortableProcess.ts"
import { jsonBytes } from "../../internal/json.ts"
import { renderHooks } from "../hooks/model.ts"
import { hostFor, renderMcp } from "../mcp/model.ts"
import { renderPortableFeatures } from "./features.ts"
import { renderPortableMcp } from "../mcp/portable.ts"

export type ProcessEncoding = false | "posix" | "portable" | "portable_features"

type Materialized = Pick<Extract<Result, { type: "rendered" }>, "mcpDocument" | "hooksDocument"> & {
  readonly files: PackageFile[]
}
type MaterializedMcp = { readonly document: Materialized["mcpDocument"]; readonly files: PackageFile[] }

const runtimeAsset = fileURLToPath(new URL("./runtime/process.mjs", import.meta.resolve("pluginsdk/package.json")))
const textFile = (file: { readonly path: PackageFile["path"]; readonly content: string; readonly executable: boolean }): PackageFile => ({
  path: file.path, content: new TextEncoder().encode(file.content), executable: file.executable
})

const materializePortableFiles = Effect.fn("Compiler.materializePortableFiles")(function*(
  files: ReadonlyArray<FilePlan>,
  root: BuildRequest["root"]
) {
  const fs = yield* FileSystem.FileSystem
  const materialized: PackageFile[] = []
  for (const file of files) {
    const output = yield* Match.value(file).pipe(Match.discriminatorsExhaustive("type")({
      runtime: ({ path }) => fs.readFile(runtimeAsset).pipe(
        Effect.mapError((cause) => new SourceUnavailable({ root, cause })),
        Effect.map((content): PackageFile => ({ path, content, executable: false }))
      ),
      process: ({ path, data }) => Effect.succeed<PackageFile>({ path, content: jsonBytes(data), executable: false }),
      posix: ({ path, content }) => Effect.succeed<PackageFile>(textFile({ path, content, executable: true }))
    }))
    materialized.push(output)
  }
  return materialized
})

export const materializeProcesses = Effect.fn("Compiler.materializeProcesses")(function*(
  input: Input,
  encoding: ProcessEncoding,
  request: Pick<BuildRequest, "root" | "format">
): Effect.fn.Return<Materialized, BuildRejected | SourceUnavailable, FileSystem.FileSystem> {
  const legacyMcp = () => Match.value(renderMcp(input.mcp)).pipe(Match.discriminatorsExhaustive("type")({
    rendered: ({ document, files }): Effect.Effect<MaterializedMcp> => Effect.succeed({ document, files: files.map(textFile) }),
    rejected: (): Effect.Effect<MaterializedMcp, BuildRejected> => Effect.fail(new BuildRejected({
      issues: [{ type: "unsupported_feature", feature: "stdio", format: request.format }]
    }))
  }))
  const portableMcp = () => Match.value(renderPortableMcp(input.mcp)).pipe(Match.discriminatorsExhaustive("type")({
    rejected: ({ issues }): Effect.Effect<MaterializedMcp, BuildRejected> => Effect.fail(new BuildRejected({
      issues: EffectArray.map(issues, ({ server, reason }): BuildIssue => ({ type: "invalid_process", server, reason }))
    })),
    rendered: ({ document, files }) => materializePortableFiles(files, request.root).pipe(
      Effect.map((files): MaterializedMcp => ({ document, files }))
    )
  }))
  const withLegacyHooks = (mcp: MaterializedMcp) => Match.value(renderHooks({
    host: hostFor(input.mcp.format), hooks: input.hooks
  })).pipe(Match.discriminatorsExhaustive("type")({
    rendered: ({ document, files }): Effect.Effect<Materialized> => Effect.succeed({
      mcpDocument: mcp.document, hooksDocument: document, files: [...mcp.files, ...files.map(textFile)]
    }),
    rejected: ({ issues }): Effect.Effect<Materialized, BuildRejected> => Effect.fail(new BuildRejected({
      issues: EffectArray.map(issues, ({ hook, name }): BuildIssue => ({
        type: "invalid_hook_process", hook, reason: { type: "environment_reference_unsupported", name }
      }))
    }))
  }))
  const portableFeatures = () => Match.value(renderPortableFeatures(input)).pipe(Match.discriminatorsExhaustive("type")({
    rejected: ({ issues }): Effect.Effect<Materialized, BuildRejected> => Effect.fail(new BuildRejected({
      issues: EffectArray.map(issues, (issue): BuildIssue => Match.value(issue).pipe(Match.discriminatorsExhaustive("type")({
        mcp: ({ issue: { server, reason } }): BuildIssue => ({ type: "invalid_process", server, reason }),
        hook: ({ issue: { hook, reason } }): BuildIssue => ({ type: "invalid_hook_process", hook, reason })
      })))
    })),
    rendered: ({ mcpDocument, hooksDocument, files }) => materializePortableFiles(files, request.root).pipe(
      Effect.map((files): Materialized => ({ mcpDocument, hooksDocument, files }))
    )
  }))
  return yield* Match.value(encoding).pipe(
    Match.whenOr(false, "posix", () => legacyMcp().pipe(Effect.flatMap(withLegacyHooks))),
    Match.when("portable", () => portableMcp().pipe(Effect.flatMap(withLegacyHooks))),
    Match.when("portable_features", portableFeatures),
    Match.exhaustive
  )
})
