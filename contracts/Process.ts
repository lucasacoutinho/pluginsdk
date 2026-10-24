import { Schema } from "effect"
import { LocalMcpProblem } from "./Compiler.ts"
import { Asset } from "./CompilerModel.ts"
import { EnvironmentName, ExecutableName, PackagePath, ProcessText } from "./Plugin.ts"
import { PackageClient } from "./Clients.ts"

export const Program = Schema.Union([
  Schema.Struct({ type: Schema.Literal("external"), name: ExecutableName }),
  Schema.Struct({ type: Schema.Literal("file"), path: PackagePath })
]).pipe(Schema.toTaggedUnion("type"))
export type Program = typeof Program.Type

export const Argument = Schema.Union([
  Schema.Struct({ type: Schema.Literal("literal"), value: ProcessText }),
  Schema.Struct({ type: Schema.Literal("file"), path: PackagePath })
]).pipe(Schema.toTaggedUnion("type"))
export type Argument = typeof Argument.Type

export const EnvironmentValue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("literal"), value: ProcessText }),
  Schema.Struct({ type: Schema.Literal("reference"), name: EnvironmentName })
]).pipe(Schema.toTaggedUnion("type"))
export type EnvironmentValue = typeof EnvironmentValue.Type

export const Binding = Schema.Struct({ name: EnvironmentName, value: EnvironmentValue })
export type Binding = typeof Binding.Type

export const Definition = Schema.Struct({
  command: Program,
  args: Schema.Array(Argument),
  environment: Schema.Array(Binding),
  cwd: Schema.NullOr(PackagePath)
})
export type Definition = typeof Definition.Type

export const Word = Schema.Union([
  Schema.Struct({ type: Schema.Literal("literal"), value: ProcessText }),
  Schema.Struct({ type: Schema.Literal("root") }),
  Schema.Struct({ type: Schema.Literal("file"), path: PackagePath }),
  Schema.Struct({ type: Schema.Literal("environment"), name: EnvironmentName })
]).pipe(Schema.toTaggedUnion("type"))
export type Word = typeof Word.Type

export const ProcessPlan = Schema.Struct({
  command: Word,
  args: Schema.Array(Word),
  environment: Schema.Array(Schema.Struct({ name: EnvironmentName, value: Word })),
  cwd: Word
})
export type ProcessPlan = typeof ProcessPlan.Type

export const ProcessInput = Schema.Struct({
  host: PackageClient,
  definition: Definition,
  files: Schema.Array(Asset)
})
export type ProcessInput = typeof ProcessInput.Type

export const ProcessResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("planned"), plan: ProcessPlan }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(LocalMcpProblem) })
]).pipe(Schema.toTaggedUnion("type"))
export type ProcessResult = typeof ProcessResult.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("lower_process"),
  input: ProcessInput
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("lower_process"),
  output: ProcessResult
})
export type OracleResponse = typeof OracleResponse.Type

export const QuotingOracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("quote_process_text"),
  input: Schema.Struct({ text: ProcessText })
})
export type QuotingOracleRequest = typeof QuotingOracleRequest.Type

export const QuotingOracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("quote_process_text"),
  output: Schema.Struct({ quoted: Schema.String })
})
export type QuotingOracleResponse = typeof QuotingOracleResponse.Type

export { lowerProcess, quoteProcessText } from "../src/compiler/process/model.ts"
