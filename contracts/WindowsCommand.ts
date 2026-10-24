import { Schema } from "effect"
import { ProcessText } from "./Plugin.ts"

export const QuotingOracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("quote_windows_argument"),
  input: Schema.Struct({ text: ProcessText })
})
export type QuotingOracleRequest = typeof QuotingOracleRequest.Type

export const QuotingOracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("quote_windows_argument"),
  output: Schema.Struct({ quoted: Schema.String })
})
export type QuotingOracleResponse = typeof QuotingOracleResponse.Type

export const ByteCount = Schema.Natural.check(
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)
).pipe(Schema.brand("pluginsdk/WindowsCommandBytes"))
export type ByteCount = typeof ByteCount.Type

export const InputState = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open"), remaining: ByteCount }),
  Schema.Struct({ type: Schema.Literal("closed"), remaining: ByteCount })
]).pipe(Schema.toTaggedUnion("type"))
export type InputState = typeof InputState.Type

export const StreamState = Schema.Struct({ input: InputState, outputRemaining: ByteCount })
export type StreamState = typeof StreamState.Type
export const StreamSignal = Schema.Union([
  Schema.Struct({ type: Schema.Literal("input"), bytes: ByteCount }),
  Schema.Struct({ type: Schema.Literal("output"), bytes: ByteCount }),
  Schema.Struct({ type: Schema.Literal("end_input") })
]).pipe(Schema.toTaggedUnion("type"))
export type StreamSignal = typeof StreamSignal.Type

export const BlockedReason = Schema.Literals(["input_closed", "input_limit", "output_limit"])
export type BlockedReason = typeof BlockedReason.Type
export const StreamAction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("accepted") }),
  Schema.Struct({ type: Schema.Literal("close_input") }),
  Schema.Struct({ type: Schema.Literal("ignore") }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: BlockedReason })
]).pipe(Schema.toTaggedUnion("type"))
export type StreamAction = typeof StreamAction.Type
export const StreamInput = Schema.Struct({ state: StreamState, signal: StreamSignal })
export type StreamInput = typeof StreamInput.Type
export const StreamStep = Schema.Struct({ state: StreamState, action: StreamAction })
export type StreamStep = typeof StreamStep.Type

export const IoPhase = Schema.Literals(["pending", "cancelling", "terminal", "released"])
export type IoPhase = typeof IoPhase.Type
export const IoSignal = Schema.Literals(["cancel", "completed", "release"])
export type IoSignal = typeof IoSignal.Type
export const IoAction = Schema.Literals(["cancel", "wait", "release", "ignore"])
export type IoAction = typeof IoAction.Type
export const IoInput = Schema.Struct({ phase: IoPhase, signal: IoSignal })
export type IoInput = typeof IoInput.Type
export const IoStep = Schema.Struct({ phase: IoPhase, action: IoAction })
export type IoStep = typeof IoStep.Type

export const StreamOracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("windows_stream_step"), input: StreamInput
})
export type StreamOracleRequest = typeof StreamOracleRequest.Type
export const StreamOracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("windows_stream_step"), output: StreamStep
})
export type StreamOracleResponse = typeof StreamOracleResponse.Type
export const IoOracleRequest = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("windows_io_step"), input: IoInput
})
export type IoOracleRequest = typeof IoOracleRequest.Type
export const IoOracleResponse = Schema.Struct({
  schema: Schema.Literal(1), type: Schema.Literal("windows_io_step"), output: IoStep
})
export type IoOracleResponse = typeof IoOracleResponse.Type
