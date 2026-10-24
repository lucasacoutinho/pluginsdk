import { Schema } from "effect"
import { Script } from "./Launcher.ts"
import { ProcessText } from "./Plugin.ts"

export const Input = Schema.Struct({ root: ProcessText, script: Script })
export type Input = typeof Input.Type

export const Admission = Schema.Union([
  Schema.Struct({ type: Schema.Literal("accepted"), directory: Schema.String }),
  Schema.Struct({ type: Schema.Literal("unresolved") }),
  Schema.Struct({ type: Schema.Literal("too_long"), units: Schema.Natural })
]).pipe(Schema.toTaggedUnion("type"))
export type Admission = typeof Admission.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("admit_process_directory"), input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("admit_process_directory"), output: Admission
})
export type OracleResponse = typeof OracleResponse.Type
