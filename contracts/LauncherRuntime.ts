import { Schema } from "effect"
import { RuntimePlatform } from "./Compatibility.ts"

export const Kind = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("portable") })
]).pipe(Schema.toTaggedUnion("type"))
export type Kind = typeof Kind.Type

export const Input = Schema.Struct({ platform: RuntimePlatform, kind: Kind })
export type Input = typeof Input.Type

export const Check = Schema.Literals(["node", "shell", "env"])
export type Check = typeof Check.Type
export const Requirements = Schema.NullOr(Schema.Array(Check))
export type Requirements = typeof Requirements.Type

export const NodeObservation = Schema.Struct({
  platform: RuntimePlatform,
  major: Schema.Natural,
  minor: Schema.Natural,
  execve: Schema.Boolean
})
export type NodeObservation = typeof NodeObservation.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("launcher_runtime_checks"), input: Input }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("accept_node_runtime"), input: NodeObservation })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("launcher_runtime_checks"), output: Requirements }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("accept_node_runtime"), output: Schema.Boolean })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
