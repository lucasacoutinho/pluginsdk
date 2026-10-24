import { Schema } from "effect"
import { Format } from "./Compiler.ts"
import { PackageClient } from "./Clients.ts"

export const Input = Schema.Struct({
  client: PackageClient,
  hasAgents: Schema.Boolean,
  hasHooks: Schema.Boolean,
  hasStdio: Schema.Boolean
})
export type Input = typeof Input.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("select_build_format"), input: Input })
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("select_build_format"), output: Format })
export type OracleResponse = typeof OracleResponse.Type
