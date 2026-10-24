import { Schema } from "effect"
import { Bundle } from "../../../contracts/Compiler.ts"
import { Identity, ReadyPlan, RepairPlan, ReviewedPlan, Target } from "../../../contracts/Installer.ts"
import { Idle, Pending } from "../../../contracts/Lifecycle.ts"
import { JobName } from "../../../contracts/Execution.ts"
import { Writer } from "../../../contracts/Writers.ts"

export const Execution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("prepared") }),
  Schema.Struct({ type: Schema.Literal("running"), group: Schema.Int.check(Schema.isGreaterThan(0)), boot: Schema.NonEmptyString }),
  Schema.Struct({ type: Schema.Literal("windows_running"), name: JobName }),
  Schema.Struct({ type: Schema.Literal("windows_writers"), writers: Schema.Array(Writer) })
]).pipe(Schema.toTaggedUnion("type"))
export type Execution = typeof Execution.Type

export const StoredState = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("idle"), journal: Idle }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("pending"), journal: Pending, plan: ReadyPlan, execution: Execution }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("repair_pending"), original: ReadyPlan, plan: RepairPlan, execution: Execution })
]).pipe(Schema.toTaggedUnion("type"))
export type StoredState = typeof StoredState.Type

export const Installed = Schema.Struct({ schema: Schema.Literal(1), target: Target, identity: Identity, bundle: Bundle })
export type Installed = typeof Installed.Type

export const ExecuteRequest = Schema.Struct({ plan: ReviewedPlan })
