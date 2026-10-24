import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Directory from "../contracts/ProcessDirectory.ts"
import { ExecutionInput } from "../contracts/ProcessRuntime.ts"
import { admitProcessDirectory } from "../src/installer/runtime/directory-policy.ts"
import { executeProcess } from "../src/runtime/model.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectors = fileURLToPath(new URL("../spec/vectors/process-directory.ndjson", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Directory.OracleRequest,
  expected: Directory.OracleResponse
})

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function runOracle(requests: ReadonlyArray<Directory.OracleRequest>): ReadonlyArray<Directory.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Directory.OracleRequest)(request))).join("\n") + "\n"
  const result = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Process directory oracle failed: ${result.stderr}`)
  return result.stdout.trimEnd().split("\n").map((line) => decode(Directory.OracleResponse, JSON.parse(line)))
}

function checkRuntimeDirectory(input: Directory.Input, admission: Directory.Admission): void {
  if (admission.type !== "accepted") return
  const invocation = executeProcess(decode(ExecutionInput, { ...input, captures: { PWD_SOURCE: "captured value" } }))
  if (invocation !== null) expect(invocation.cwd).toBe(admission.directory)
}

it("matches 25 authored directory and Unicode boundary cases against Lean and TypeScript", () => {
  const cases = readFileSync(vectors, "utf8").trimEnd().split("\n").map((line) => decode(Vector, JSON.parse(line)))
  expect(cases).toHaveLength(25)
  const replies = runOracle(cases.map(({ request }) => request))
  expect(replies).toHaveLength(cases.length)
  cases.forEach(({ name, request, expected }, index) => {
    expect(replies[index], `${name}: Lean`).toEqual(expected)
    const admission = admitProcessDirectory(request.input)
    expect(admission, `${name}: TypeScript`).toEqual(expected.output)
    checkRuntimeDirectory(request.input, admission)
  })
})

it("conforms across directory indices, Unicode roots and unused process words", () => {
  const capture = { source: "PWD_SOURCE", raw: "PSDK_A_PWD_SOURCE", check: "PSDK_B_PWD_SOURCE" }
  const snapshots = [
    [], [{ type: "root" }], [{ type: "file", path: "work 日本語 😀" }],
    [{ type: "literal", value: "C:\\short" }], [{ type: "captured", capture }],
    [{ type: "literal", value: "node" }, { type: "root" }, { type: "file", path: "cases/direct/work" }]
  ]
  const roots = ["", "C:\\short", ...[257, 258, 259, 317].map((units) => "C:\\" + "a".repeat(units - 3)),
    "C:\\" + "a".repeat(253) + "😀", "C:\\" + "a".repeat(254) + "😀"]
  const requests: Directory.OracleRequest[] = []
  for (const root of roots) {
    for (const snapshot of snapshots) {
      for (const cwd of [0, 1, 2, 3, 4, Number.MAX_SAFE_INTEGER]) {
        requests.push(decode(Directory.OracleRequest, {
          schema: 1, type: "admit_process_directory", input: {
            root, script: { names: [], captures: [], snapshot, command: 0, args: [], environment: [], cwd }
          }
        }))
      }
    }
  }
  expect(requests).toHaveLength(288)
  const replies = runOracle(requests)
  expect(replies).toHaveLength(requests.length)
  requests.forEach((request, index) => {
    const admission = admitProcessDirectory(request.input)
    expect(admission, JSON.stringify(request)).toEqual(replies[index]?.output)
    checkRuntimeDirectory(request.input, admission)
  })
})

it("refuses malformed external directory instructions in both schema and oracle", () => {
  const script = { names: [], captures: [], snapshot: [], command: 0, args: [], environment: [], cwd: 0 }
  const inputs: unknown[] = [
    ...["a\0b", "\ud800", null, 42].map((root) => ({ root, script })),
    ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, "0"].map((cwd) => ({ root: "C:\\short", script: { ...script, cwd } })),
    ...[
      { type: "other" }, { type: "root", value: "unexpected" },
      { type: "file", path: "../escape" }, { type: "literal", value: "\ud800" },
      { type: "captured", capture: { source: "BAD-NAME", raw: "RAW", check: "CHECK" } }
    ].map((word) => ({ root: "C:\\short", script: { ...script, snapshot: [word] } })),
    { root: "C:\\short", script, extra: true },
    { root: "C:\\short", script: { ...script, extra: true } }
  ]
  for (const input of inputs) {
    const request = { schema: 1, type: "admit_process_directory", input }
    expect(() => decode(Directory.OracleRequest, request)).toThrow()
    const result = spawnSync(oracle, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
  }
})
