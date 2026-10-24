import { Schema } from "effect"
import { ProcessId } from "./Execution.ts"

export const CreationTime = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{16}(?![\s\S])/)
).pipe(Schema.brand("pluginsdk/WindowsCreationTime"))
export type CreationTime = typeof CreationTime.Type

export const Writer = Schema.Struct({ pid: ProcessId, creation: CreationTime })
export type Writer = typeof Writer.Type

export const ProcessState = Schema.Literals(["terminated", "active", "unknown"])
export type ProcessState = typeof ProcessState.Type
export const Observation = Schema.Struct({ writer: Writer, state: ProcessState })
export type Observation = typeof Observation.Type
export const Lookup = Schema.Union([
  Schema.Struct({ type: Schema.Literal("opened"), writer: Writer, state: ProcessState }),
  Schema.Struct({ type: Schema.Literal("missing"), pid: ProcessId }),
  Schema.Struct({ type: Schema.Literal("unavailable") })
]).pipe(Schema.toTaggedUnion("type"))
export type Lookup = typeof Lookup.Type
export const ObservationInput = Schema.Struct({ writer: Writer, lookup: Lookup })
export type ObservationInput = typeof ObservationInput.Type
export const CompletionInput = Schema.Struct({ writers: Schema.Array(Writer), observed: Schema.Array(Observation) })
export type CompletionInput = typeof CompletionInput.Type
export const PriorOwnersInput = Schema.Struct({
  current: Writer,
  owners: Schema.Array(Writer),
  observed: Schema.Array(Observation)
})
export type PriorOwnersInput = typeof PriorOwnersInput.Type
export const Completion = Schema.Literals(["complete", "active", "unknown"])
export type Completion = typeof Completion.Type

export const GateState = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open"), writers: Schema.Array(Writer) }),
  Schema.Struct({ type: Schema.Literal("retaining"), writers: Schema.Array(Writer), writer: Writer }),
  Schema.Struct({ type: Schema.Literal("closed"), writers: Schema.Array(Writer) }),
  Schema.Struct({ type: Schema.Literal("stopped"), writers: Schema.Array(Writer) })
]).pipe(Schema.toTaggedUnion("type"))
export type GateState = typeof GateState.Type

export const GateSignal = Schema.Union([
  Schema.Struct({ type: Schema.Literal("birth"), writer: Writer }),
  Schema.Struct({ type: Schema.Literal("retained"), writers: Schema.Array(Writer) }),
  Schema.Struct({ type: Schema.Literal("failed") }),
  Schema.Struct({ type: Schema.Literal("close"), observed: Schema.Array(Observation) }),
  Schema.Struct({ type: Schema.Literal("stop") })
]).pipe(Schema.toTaggedUnion("type"))
export type GateSignal = typeof GateSignal.Type

export const WaitReason = Schema.Literals(["active", "unknown"])
export type WaitReason = typeof WaitReason.Type
export const GateAction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("retain"), writers: Schema.Array(Writer) }),
  Schema.Struct({ type: Schema.Literal("resume"), writer: Writer }),
  Schema.Struct({ type: Schema.Literal("wait"), reason: WaitReason }),
  Schema.Struct({ type: Schema.Literal("complete") }),
  Schema.Struct({ type: Schema.Literal("stop") })
]).pipe(Schema.toTaggedUnion("type"))
export type GateAction = typeof GateAction.Type

export const GateInput = Schema.Struct({ state: GateState, signal: GateSignal })
export type GateInput = typeof GateInput.Type
export const GateStep = Schema.Struct({ state: GateState, action: GateAction })
export type GateStep = typeof GateStep.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_observation"), input: ObservationInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_step"), input: GateInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_completion"), input: CompletionInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_prior_owners"), input: PriorOwnersInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_observation"), output: Observation }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_step"), output: GateStep }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_completion"), output: Completion }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("writer_prior_owners"), output: Completion })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
