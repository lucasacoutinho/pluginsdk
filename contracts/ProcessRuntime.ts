import { Schema } from "effect"
import { Script } from "./Launcher.ts"
import { EnvironmentName, ProcessText } from "./Plugin.ts"

export const CaptureInput = Schema.Struct({
  source: EnvironmentName,
  raw: Schema.NullOr(ProcessText),
  check: Schema.NullOr(ProcessText)
})
export type CaptureInput = typeof CaptureInput.Type

export const ExecutionInput = Schema.Struct({
  script: Script,
  root: ProcessText,
  captures: Schema.Record(EnvironmentName, Schema.NullOr(ProcessText))
})
export type ExecutionInput = typeof ExecutionInput.Type

export const Invocation = Schema.Struct({
  command: ProcessText,
  args: Schema.Array(ProcessText),
  environment: Schema.Array(Schema.Struct({ name: EnvironmentName, value: ProcessText })),
  cwd: ProcessText
})
export type Invocation = typeof Invocation.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("read_process_capture"), input: CaptureInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("execute_process"), input: ExecutionInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("read_process_capture"), output: Schema.NullOr(ProcessText) }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("execute_process"), output: Schema.NullOr(Invocation) })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type

export { executeProcess, readProcessCapture } from "../src/runtime/model.ts"
