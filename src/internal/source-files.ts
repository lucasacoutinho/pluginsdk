import { Context, Effect, Schema } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { NativeFile } from "../../contracts/ExecutableIntent.ts"
import { SourceUnavailable } from "../../contracts/Compiler.ts"
import { PackagePath } from "../../contracts/Plugin.ts"

export const NativeContent = Schema.Struct({ ...NativeFile.fields, content: Schema.Uint8Array })
export type NativeContent = typeof NativeContent.Type

export const SourceSelectionMode = Schema.Literals(["directory", "either"])
export type SourceSelectionMode = typeof SourceSelectionMode.Type

export class SourceReadRejected extends Schema.TaggedError<SourceReadRejected, { readonly brand: unique symbol }>()(
  "SourceReadRejected", {
    path: PackagePath,
    reason: Schema.Literals(["outside", "cycle", "not_regular", "not_directory", "name", "path", "reparse"])
  }
) {}

export type SourceReadError = SourceReadRejected | SourceUnavailable | PlatformError

export class SourceFiles extends Context.Service<SourceFiles, {
  readonly file: (path: PackagePath) => Effect.Effect<NativeContent, SourceReadError>
  readonly select: (path: PackagePath, mode: SourceSelectionMode) => Effect.Effect<ReadonlyArray<NativeContent>, SourceReadError>
}>()("pluginsdk/SourceFiles") {}
