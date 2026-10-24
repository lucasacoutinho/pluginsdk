import { Schema } from "effect"
import { LauncherInput, Native, Script } from "./Launcher.ts"
import { EnvironmentName, ProcessText } from "./Plugin.ts"

export const Input = LauncherInput
export type Input = typeof Input.Type

export const Issue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("environment_collision"), name: EnvironmentName }),
  Schema.Struct({ type: Schema.Literal("environment_reference_unsupported"), name: EnvironmentName })
]).pipe(Schema.toTaggedUnion("type"))
export type Issue = typeof Issue.Type

export const Result = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("rendered"),
    script: Script,
    native: Native,
    posix: ProcessText
  }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(Issue) })
]).pipe(Schema.toTaggedUnion("type"))
export type Result = typeof Result.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("compile_portable_launcher"),
  input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("compile_portable_launcher"),
  output: Result
})
export type OracleResponse = typeof OracleResponse.Type

export { compilePortableLauncher } from "../src/compiler/process/portable.ts"
