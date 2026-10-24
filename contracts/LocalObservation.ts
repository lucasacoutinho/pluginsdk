import { Schema } from "effect"
import { Observation } from "./Installer.ts"
import { Owner, Slots } from "./LocalSlot.ts"

export const Input = Schema.Struct({ owner: Owner, slots: Slots })
export type Input = typeof Input.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("observe_local_slots"), input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("observe_local_slots"), output: Observation
})
export type OracleResponse = typeof OracleResponse.Type
