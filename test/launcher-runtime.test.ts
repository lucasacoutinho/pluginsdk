import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Runtime from "../contracts/LauncherRuntime.ts"
import { acceptsNodeRuntime, launcherRuntimeChecks } from "../src/installer/runtime/launcher-policy.ts"

const oracle = process.env["PLUGINSDK_ORACLE"] ??
  fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectors = fileURLToPath(new URL("../spec/vectors/launcher-runtime.ndjson", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Runtime.OracleRequest,
  expected: Runtime.OracleResponse
})

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function evaluate(request: Runtime.OracleRequest): Runtime.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    launcher_runtime_checks: ({ input }): Runtime.OracleResponse => ({ schema: 1, type: "launcher_runtime_checks", output: launcherRuntimeChecks(input) }),
    accept_node_runtime: ({ input }): Runtime.OracleResponse => ({ schema: 1, type: "accept_node_runtime", output: acceptsNodeRuntime(input) })
  }))
}

function runOracle(requests: ReadonlyArray<Runtime.OracleRequest>): ReadonlyArray<Runtime.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Runtime.OracleRequest)(request))).join("\n") + "\n"
  const result = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Launcher runtime oracle failed: ${result.stderr}`)
  return result.stdout.trimEnd().split("\n").map((line) => decode(Runtime.OracleResponse, JSON.parse(line)))
}

it("matches authored current NR1, NR3, NR4 and NR5 cases against Lean and TypeScript", () => {
  const cases = readFileSync(vectors, "utf8").trimEnd().split("\n").map((line) => decode(Vector, JSON.parse(line)))
  expect(new Set(cases.flatMap(({ properties }) => properties))).toEqual(new Set(["NR1", "NR3", "NR4", "NR5"]))
  expect(new Set(cases.flatMap(({ request }) =>
    request.type === "launcher_runtime_checks" ? [request.input.kind.type] : []
  ))).toEqual(new Set(["absent", "portable"]))
  const replies = runOracle(cases.map(({ request }) => request))
  expect(replies).toHaveLength(cases.length)
  cases.forEach(({ name, request, expected }, index) => {
    expect(replies[index], `${name}: Lean`).toEqual(expected)
    expect(evaluate(request), `${name}: TypeScript`).toEqual(expected)
  })
})

it("conforms on platform, launcher-kind, Node version and capability boundaries", () => {
  const requests: Array<Runtime.OracleRequest> = []
  for (const platform of ["linux", "win32", "darwin", "freebsd", "Linux", "日本語"]) {
    for (const kind of [{ type: "absent" }, { type: "portable" }]) {
      requests.push(decode(Runtime.OracleRequest, { schema: 1, type: "launcher_runtime_checks", input: { platform, kind } }))
    }
    for (const major of [0, 18, 23, 24, 25, 26, Number.MAX_SAFE_INTEGER]) {
      for (const minor of [0, 17, 18, 19, Number.MAX_SAFE_INTEGER]) {
        for (const execve of [false, true]) {
          requests.push(decode(Runtime.OracleRequest, { schema: 1, type: "accept_node_runtime", input: { platform, major, minor, execve } }))
        }
      }
    }
  }
  expect(new Set(requests.flatMap((request) =>
    request.type === "launcher_runtime_checks" ? [request.input.kind.type] : []
  ))).toEqual(new Set(["absent", "portable"]))
  const replies = runOracle(requests)
  expect(replies).toHaveLength(requests.length)
  requests.forEach((request, index) => expect(evaluate(request), JSON.stringify(request)).toEqual(replies[index]))
})

it("refuses malformed Node observations and obsolete launcher wire shapes", () => {
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, true, "24", {}, []]) {
    for (const field of ["major", "minor"]) {
      const request = { schema: 1, type: "accept_node_runtime", input: { platform: "linux", major: 24, minor: 18, execve: true, [field]: value } }
      expect(() => decode(Runtime.OracleRequest, request)).toThrow()
      const result = spawnSync(oracle, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stdout).toBe("")
    }
  }
  for (const kind of [
    { type: "other" },
    { type: "posix", cwdRoot: false },
    { type: "posix", cwdRoot: true },
    { type: "posix" },
    { type: "portable", cwdRoot: false }
  ]) {
    const request = { schema: 1, type: "launcher_runtime_checks", input: { platform: "win32", kind } }
    expect(() => decode(Runtime.OracleRequest, request)).toThrow()
    const result = spawnSync(oracle, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
  }
  expect(() => decode(Runtime.Check, "pwd")).toThrow()
  expect(() => decode(Runtime.Requirements, ["pwd"])).toThrow()
  expect(() => decode(Runtime.OracleResponse, {
    schema: 1,
    type: "launcher_runtime_checks",
    output: ["pwd"]
  })).toThrow()
})
