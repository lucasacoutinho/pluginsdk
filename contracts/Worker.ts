import { Schema } from "effect"

export const WorkerState = Schema.Literals(["waiting", "accepted", "stopped"])
export type WorkerState = typeof WorkerState.Type
export const WorkerSignal = Schema.Literals(["request", "invalid", "disconnect"])
export type WorkerSignal = typeof WorkerSignal.Type
export const WorkerAction = Schema.Literals(["start", "stop", "ignore"])
export type WorkerAction = typeof WorkerAction.Type
export const WorkerInput = Schema.Struct({ state: WorkerState, signal: WorkerSignal })
export type WorkerInput = typeof WorkerInput.Type
export const WorkerStep = Schema.Struct({ state: WorkerState, action: WorkerAction })
export type WorkerStep = typeof WorkerStep.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("admit_worker_request"), input: WorkerInput })
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("admit_worker_request"), output: WorkerStep })
