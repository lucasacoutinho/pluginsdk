import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Hooks from "../contracts/Hooks.ts"
import { parseJson } from "../src/internal/json.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ name: Schema.String, properties: Schema.Array(Schema.String), request: Hooks.OracleRequest, expected: Hooks.OracleResponse })
const equivalent = Schema.toEquivalence(Hooks.OracleResponse)
const strict = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
const vectors = readFileSync(new URL("../spec/vectors/hooks.ndjson", import.meta.url), "utf8").split("\n").filter(Boolean).map(
  (line) => strict(Vector, parseJson(line))
)

function compare(requests: ReadonlyArray<Hooks.OracleRequest>): ReadonlyArray<Hooks.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Hooks.OracleRequest)(request))).join("\n") + "\n"
  const result = spawnSync(oraclePath, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean hook oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split("\n").filter(Boolean).map((line) => strict(Hooks.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing hook response ${index}`)
    const actual: Hooks.OracleResponse = { schema: 1, type: "render_hooks", output: Hooks.renderHooks(request.input) }
    expect(equivalent(strict(Hooks.OracleResponse, actual), response), `hook case ${index}`).toBe(true)
  }
  return responses
}

it("H1-H8: matches authored hook documents, complete executable files and atomic reference failures", () => {
  const responses = compare(vectors.map((row) => row.request))
  for (const [index, row] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored hook response ${index}`)
    expect(equivalent(response, row.expected), row.name).toBe(true)
  }
})

it("matches Lean for both events, timeouts, Unicode declaration order, 11 ordinals and repeated references", () => {
  const requests: Hooks.OracleRequest[] = []
  const names = ["😀", "\ue000", "Zulu", "alpha", "five", "six", "seven", "eight", "nine", "ten", "eleven"]
  for (const host of ["claude_code", "codex"]) {
    for (const count of [0, 1, 2, 11]) {
      for (const references of [false, true]) {
        for (const reverse of [false, true]) {
          for (const mixedEvents of [false, true]) {
            const entries = names.slice(0, count).map((name, ordinal) => [name, {
              event: mixedEvents && ordinal % 2 === 0 ? "SessionStart" : "UserPromptSubmit",
              timeout: ordinal % 2 === 0 ? 1 : 600,
              plan: {
                command: { type: "file", path: "automation/job'\n雪" },
                args: Array.from({ length: 11 }, (_, index) => references && index % 2 === 0
                  ? { type: "environment", name: "SOURCE" }
                  : { type: "literal", value: index === 0 ? "" : `literal ${index} \u2028 ` + "${SOURCE}" }),
                environment: [
                  { name: "OPTIND", value: references ? { type: "environment", name: "ALTERNATE" } : { type: "literal", value: "0" } },
                  { name: "EMPTY", value: references ? { type: "environment", name: "SOURCE" } : { type: "literal", value: "" } }
                ],
                cwd: { type: "file", path: "work space" }
              }
            }])
            requests.push(strict(Hooks.OracleRequest, {
              schema: 1, type: "render_hooks", input: {
                host, hooks: Object.fromEntries(reverse ? entries.reverse() : entries)
              }
            }))
          }
        }
      }
    }
  }
  expect(requests).toHaveLength(64)
  compare(requests)
})

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
