import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Hooks from "../contracts/Hooks.ts"

const strict = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)

it("rejects unsupported events, invalid timeouts and malformed process inputs at the schema boundary", () => {
  const input = { host: "codex", hooks: { app: {
    event: "SessionStart", timeout: 30,
    plan: { command: { type: "literal", value: "node" }, args: [], environment: [], cwd: { type: "root" } }
  } } }
  const hook = input.hooks.app
  for (const value of [
    { ...input, hooks: { "": hook } },
    { ...input, hooks: { "\ud800": hook } },
    ...[0, -1, 601, 1.5, null, "30"].map((timeout) => ({ ...input, hooks: { app: { ...hook, timeout } } })),
    { ...input, hooks: { app: { ...hook, event: "PostToolUse" } } },
    { ...input, hooks: { app: { ...hook, matcher: "startup" } } },
    { ...input, hooks: { app: { ...hook, plan: { ...hook.plan, args: [{ type: "literal", value: "a\0b" }] } } } },
    { ...input, hooks: { app: { ...hook, plan: { ...hook.plan, command: { type: "file", path: "../escape" } } } } }
  ]) expect(() => strict(Hooks.HooksInput, value)).toThrow()
})

it("keeps native invocation projections and event-specific output protocols distinct", () => {
  const fields = { session_id: "local-session", transcript_path: null, cwd: "/workspace" }
  expect(strict(Hooks.HookInvocation, { ...fields, hook_event_name: "SessionStart", source: "startup" }).hook_event_name).toBe("SessionStart")
  expect(strict(Hooks.HookInvocation, { ...fields, transcript_path: "/transcript.jsonl", hook_event_name: "UserPromptSubmit", prompt: "" }).hook_event_name).toBe("UserPromptSubmit")
  expect(strict(Hooks.UserPromptSubmitOutput, { decision: "block", reason: "Team policy" })).toEqual({ decision: "block", reason: "Team policy" })
  expect(strict(Hooks.SessionStartOutput, { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "Team context" } })).toEqual({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "Team context" } })
  for (const output of [
    { decision: "block", reason: "Startup cannot block" },
    { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "Wrong event" } }
  ]) expect(() => strict(Hooks.SessionStartOutput, output)).toThrow()
  expect(() => strict(Hooks.UserPromptSubmitOutput, { decision: "block" })).toThrow()
  expect(() => strict(Hooks.HookInvocation, { ...fields, hook_event_name: "SessionStart", source: "unknown" })).toThrow()
})
