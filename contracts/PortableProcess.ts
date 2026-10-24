import { Schema } from "effect"
import { LauncherPath, Script } from "./Launcher.ts"
import { PackagePath, ProcessText } from "./Plugin.ts"

export const ProcessData = Schema.Struct({
  schema: Schema.Literal(1),
  posix: LauncherPath,
  script: Script
})
export type ProcessData = typeof ProcessData.Type

export const FilePlan = Schema.Union([
  Schema.Struct({ type: Schema.Literal("runtime"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("process"), path: LauncherPath, data: ProcessData }),
  Schema.Struct({ type: Schema.Literal("posix"), path: LauncherPath, content: ProcessText })
]).pipe(Schema.toTaggedUnion("type"))
export type FilePlan = typeof FilePlan.Type
