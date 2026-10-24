import { Schema } from "effect"
import { EnvironmentName, PackagePath, ProcessText } from "./Plugin.ts"
import { ProcessInput, ProcessPlan } from "./Process.ts"

export const LauncherPath = PackagePath.check(Schema.makeFilter(
  (path) => !path.includes("$"),
  { expected: "a contained launcher path without expansion syntax" }
)).pipe(Schema.brand("pluginsdk/LauncherPath"))
export type LauncherPath = typeof LauncherPath.Type

export const CaptureKind = Schema.Literals(["raw", "check"])
export type CaptureKind = typeof CaptureKind.Type

export const Capture = Schema.Struct({
  source: EnvironmentName,
  raw: EnvironmentName,
  check: EnvironmentName
})
export type Capture = typeof Capture.Type

export const SnapshotWord = Schema.Union([
  Schema.Struct({ type: Schema.Literal("literal"), value: ProcessText }),
  Schema.Struct({ type: Schema.Literal("root") }),
  Schema.Struct({ type: Schema.Literal("file"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("captured"), capture: Capture })
]).pipe(Schema.toTaggedUnion("type"))
export type SnapshotWord = typeof SnapshotWord.Type

const ParameterIndex = Schema.Natural.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))

export const Script = Schema.Struct({
  names: Schema.Array(EnvironmentName),
  captures: Schema.Array(Capture),
  snapshot: Schema.Array(SnapshotWord),
  command: ParameterIndex,
  args: Schema.Array(ParameterIndex),
  environment: Schema.Array(Schema.Struct({ name: EnvironmentName, index: ParameterIndex })),
  cwd: ParameterIndex
})
export type Script = typeof Script.Type

export const Native = Schema.Struct({
  command: ProcessText,
  args: Schema.Array(ProcessText),
  env: Schema.Record(EnvironmentName, ProcessText),
  cwd: Schema.NullOr(ProcessText)
})
export type Native = typeof Native.Type

export const LauncherInput = Schema.Struct({
  host: ProcessInput.fields.host,
  path: LauncherPath,
  plan: ProcessPlan
})
export type LauncherInput = typeof LauncherInput.Type

export const LauncherOutput = Schema.Struct({
  script: ProcessText,
  native: Schema.NullOr(Native)
})
export type LauncherOutput = typeof LauncherOutput.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_launcher"),
  input: LauncherInput
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("render_launcher"),
  output: LauncherOutput
})
export type OracleResponse = typeof OracleResponse.Type

export { renderLauncher } from "../src/compiler/process/posix.ts"
