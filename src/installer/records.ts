import { Schema } from "effect"
import { Bundle } from "../../contracts/Compiler.ts"
import { Identity, ReadyPlan, Target } from "../../contracts/Installer.ts"
import { Idle, Pending } from "../../contracts/Lifecycle.ts"

export const Execution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("prepared") }),
  Schema.Struct({ type: Schema.Literal("running"), group: Schema.Int.check(Schema.isGreaterThan(0)), boot: Schema.NonEmptyString })
]).pipe(Schema.toTaggedUnion("type"))
export type Execution = typeof Execution.Type

export const StoredState = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("idle"), journal: Idle }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("pending"), journal: Pending, plan: ReadyPlan, execution: Execution })
]).pipe(Schema.toTaggedUnion("type"))
export type StoredState = typeof StoredState.Type

export const Installed = Schema.Struct({ schema: Schema.Literal(1), target: Target, identity: Identity, bundle: Bundle })
export type Installed = typeof Installed.Type

export const ExecuteRequest = Schema.Struct({ plan: ReadyPlan })
