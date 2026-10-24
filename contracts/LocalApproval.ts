import { Schema } from "effect"
import { RetainedFile } from "./ExecutableIntent.ts"
import * as Files from "./FileRead.ts"
import { Approval } from "./LocalPackage.ts"
import { Claim, Owner } from "./LocalSlot.ts"

export const Record = Schema.Struct({ schema: Schema.Literal(1), ...Claim.fields, root: Files.Identity })
export type Record = typeof Record.Type

export const Retained = Schema.Struct({ ...Claim.fields, files: Schema.NonEmptyArray(RetainedFile) })
export type Retained = typeof Retained.Type

export const Input = Schema.Struct({ owner: Owner, root: Files.Identity, record: Record, retained: Retained })
export type Input = typeof Input.Type

export const Output = Schema.NullOr(Approval)
export type Output = typeof Output.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("bind_local_approval"), input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("bind_local_approval"), output: Output
})
export type OracleResponse = typeof OracleResponse.Type
