import { Schema } from "effect"
import { FileObservation } from "./Companions.ts"
import { PosixFileBasis, WindowsFileBasis } from "./ProjectConfig.ts"
import * as Metadata from "./ProjectFile.ts"

export const Basis = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ ...PosixFileBasis.fields, mode: Schema.Literal(0o600) }),
  WindowsFileBasis
]).pipe(Schema.toTaggedUnion("type"))
export type Basis = typeof Basis.Type

export const Input = Metadata.Input
export type Input = typeof Input.Type

export const ReviewInput = Metadata.ReviewInput
export type ReviewInput = typeof ReviewInput.Type

export const Reason = Schema.Literals([...Metadata.Reason.literals, "mode"])
export type Reason = typeof Reason.Type

export const Decision = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), basis: Basis }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Reason })
]).pipe(Schema.toTaggedUnion("type"))
export type Decision = typeof Decision.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("admit_companion_file"), input: Input }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_companion_file"), input: ReviewInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("observe_companion_file"), input: Input })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("admit_companion_file"), output: Decision }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_companion_file"), output: Decision }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("observe_companion_file"), output: FileObservation })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
