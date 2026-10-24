import { Schema } from "effect"
import { ObservedFile, RetainedFile } from "./ExecutableIntent.ts"
import * as Files from "./FileRead.ts"
import { Fingerprint } from "./Installer.ts"
import { Claim, Observation as SlotObservation } from "./LocalSlot.ts"
import { PackagePath } from "./Plugin.ts"

export const Approval = Schema.Struct({
  ...Claim.fields,
  root: Files.Identity,
  files: Schema.NonEmptyArray(RetainedFile)
})
export type Approval = typeof Approval.Type

export const Tree = Schema.Struct({
  root: Files.Identity,
  basis: Fingerprint,
  directories: Schema.Array(PackagePath),
  files: Schema.Array(ObservedFile)
})
export type Tree = typeof Tree.Type

export const Observation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("unknown") }),
  Schema.Struct({ type: Schema.Literal("tree"), ...Tree.fields })
]).pipe(Schema.toTaggedUnion("type"))
export type Observation = typeof Observation.Type

export const Input = Schema.Struct({ approval: Schema.NullOr(Approval), observed: Observation })
export type Input = typeof Input.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("classify_local_package"), input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("classify_local_package"), output: SlotObservation
})
export type OracleResponse = typeof OracleResponse.Type
