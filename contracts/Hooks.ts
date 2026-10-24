import { Schema } from "effect"
import { HookEvent, HookName, HookTimeout } from "./Plugin.ts"
import { ProcessInput, ProcessPlan } from "./Process.ts"
export { HookEvent, HookName, HookTimeout } from "./Plugin.ts"

const invocationFields = {
  session_id: Schema.NonEmptyString,
  transcript_path: Schema.NullOr(Schema.NonEmptyString),
  cwd: Schema.NonEmptyString,
  permission_mode: Schema.optionalKey(Schema.String)
}

export const HookInvocation = Schema.Union([
  Schema.Struct({
    ...invocationFields,
    hook_event_name: Schema.Literal("SessionStart"),
    source: Schema.Literals(["startup", "resume", "clear", "compact", "fork"])
  }),
  Schema.Struct({ ...invocationFields, hook_event_name: Schema.Literal("UserPromptSubmit"), prompt: Schema.String })
]).pipe(Schema.toTaggedUnion("hook_event_name"))
export type HookInvocation = typeof HookInvocation.Type

export const SessionStartOutput = Schema.Struct({
  hookSpecificOutput: Schema.Struct({ hookEventName: Schema.Literal("SessionStart"), additionalContext: Schema.String })
})
export type SessionStartOutput = typeof SessionStartOutput.Type

export const UserPromptSubmitOutput = Schema.Union([
  Schema.Struct({ hookSpecificOutput: Schema.Struct({ hookEventName: Schema.Literal("UserPromptSubmit"), additionalContext: Schema.String }) }),
  Schema.Struct({ decision: Schema.Literal("block"), reason: Schema.NonEmptyString })
])
export type UserPromptSubmitOutput = typeof UserPromptSubmitOutput.Type

export const PlannedHook = Schema.Struct({ event: HookEvent, plan: ProcessPlan, timeout: HookTimeout })
export type PlannedHook = typeof PlannedHook.Type

export const HooksInput = Schema.Struct({
  host: ProcessInput.fields.host,
  hooks: Schema.Record(HookName, PlannedHook)
})
export type HooksInput = typeof HooksInput.Type
