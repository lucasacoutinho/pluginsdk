import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Launcher from "../contracts/Launcher.ts"
import { renderLauncher } from "../src/compiler/process/posix.ts"

type LauncherVector = {
  readonly name: string
  readonly request: Launcher.OracleRequest
  readonly expected: Launcher.OracleResponse
}

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/launcher.ndjson", import.meta.url))
const equivalentResponse = Schema.toEquivalence(Launcher.OracleResponse)

const VectorRow = Schema.Struct({
  name: Schema.String,
  request: Launcher.OracleRequest,
  expected: Launcher.OracleResponse
})

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<LauncherVector> {
  const cases: Array<LauncherVector> = []
  for (const line of readFileSync(vectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const row = decodeStrict(VectorRow, JSON.parse(line))
    cases.push({ name: row.name, request: row.request, expected: row.expected })
  }
  return cases
}

function runOracle(requests: ReadonlyArray<Launcher.OracleRequest>): ReadonlyArray<Launcher.OracleResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(Launcher.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("launcher oracle request could not be encoded as JSON")
    lines.push(line)
  }
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean launcher oracle exited with status ${String(result.status)}: ${result.stderr}`)

  const responses: Array<Launcher.OracleResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(Launcher.OracleResponse, raw))
  }
  return responses
}

function evaluate(request: Launcher.OracleRequest): Launcher.OracleResponse {
  const decoded = decodeStrict(Launcher.OracleResponse, {
    schema: 1,
    type: "render_launcher",
    output: renderLauncher(request.input)
  })
  const encoded: unknown = Schema.encodeSync(Launcher.OracleResponse)(decoded)
  return decodeStrict(Launcher.OracleResponse, encoded)
}

function compareCases(cases: ReadonlyArray<LauncherVector>): void {
  const roundTripped = cases.map(({ request }) => {
    const encoded: unknown = Schema.encodeSync(Launcher.OracleRequest)(request)
    return decodeStrict(Launcher.OracleRequest, encoded)
  })
  const oracle = runOracle(roundTripped)
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = oracle[index]
    if (response === undefined) throw new Error(`Lean launcher oracle response ${index} is missing`)
    expect(equivalentResponse(response, current.expected), `${current.name}: Lean matches the committed expected output`).toBe(true)
    expect(equivalentResponse(evaluate(current.request), current.expected), `${current.name}: TypeScript matches the committed expected output`).toBe(true)
    expect(equivalentResponse(evaluate(current.request), response), `${current.name}: TypeScript matches Lean`).toBe(true)
  }
}

function generatedRequests(): ReadonlyArray<Launcher.OracleRequest> {
  const requests: Array<Launcher.OracleRequest> = []
  const alpha = "ALPHA_" + "A".repeat(27)
  const zed = "ZED_" + "Z".repeat(28)
  const sourceOrders = [{ first: alpha, second: zed }, { first: zed, second: alpha }]
  for (const host of ["claude_code", "codex"]) {
    for (const sources of sourceOrders) {
      for (const captureArguments of [false, true]) {
        for (const changeDirectory of [false, true]) {
          for (const referenceEnvironment of [false, true]) {
            requests.push(decodeStrict(Launcher.OracleRequest, {
              schema: 1,
              type: "render_launcher",
              input: {
                host,
                path: ".psdk/mcp/0.sh",
                plan: {
                  command: { type: "file", path: "bin/server'\n雪" },
                  cwd: changeDirectory ? { type: "file", path: "work dir'\n雪" } : { type: "root" },
                  args: captureArguments
                    ? [{ type: "environment", name: sources.first }, { type: "environment", name: sources.second }]
                    : [{ type: "file", path: "data/arg'\nλ" }, { type: "literal", value: "literal\u2028\n'雪" }],
                  environment: [{
                    name: "PSDK_____A_A",
                    value: referenceEnvironment
                      ? { type: "environment", name: sources.second }
                      : { type: "literal", value: "" }
                  }]
                }
              }
            }))
          }
        }
      }
    }
  }
  return requests
}

const vectors = readVectors()

it("matches all eight independently authored launcher vectors against their expected output and Lean", () => {
  expect(vectors).toHaveLength(8)
  compareCases(vectors)
})

it("matches Lean across bounded source orders, namespaces, paths and environment choices", () => {
  const requests = generatedRequests()
  expect(requests).toHaveLength(32)
  const responses = runOracle(requests)
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing generated launcher response " + index)
    expect(equivalentResponse(evaluate(request), response), "generated launcher " + index).toBe(true)
  }
})

it("strictly rejects malformed launcher wire values, including nested excess fields", () => {
  const request = vectors[2]?.request
  if (request === undefined) throw new Error("The packaged path launcher vector is missing")

  expect(() => decodeStrict(Launcher.OracleRequest, {
    ...request,
    input: {
      ...request.input,
      plan: {
        ...request.input.plan,
        command: { ...request.input.plan.command, unexpected: true }
      }
    }
  })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, {
    ...request,
    input: { ...request.input, host: "unknown_host" }
  })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, {
    ...request,
    input: {
      ...request.input,
      plan: {
        ...request.input.plan,
        args: [{ type: "unknown_word" }]
      }
    }
  })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, {
    ...request,
    input: {
      ...request.input,
      plan: {
        ...request.input.plan,
        args: [{ type: "literal", value: "before\0after" }]
      }
    }
  })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, {
    ...request,
    input: { ...request.input, path: ".psdk/mcp/${EXPANSION}.sh" }
  })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, { ...request, extra: true })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, { ...request, schema: 2 })).toThrow()
  expect(() => decodeStrict(Launcher.OracleRequest, {
    ...request,
    input: {
      ...request.input,
      plan: {
        ...request.input.plan,
        args: [{ type: "literal", value: "\ud800" }]
      }
    }
  })).toThrow()
  expect(() => decodeStrict(Launcher.OracleResponse, {
    schema: 1,
    type: "render_launcher",
    output: {
      script: "#!/bin/sh\n",
      native: {
        command: "./launcher.sh",
        args: [],
        env: {},
        cwd: null,
        unexpected: true
      }
    }
  })).toThrow()
})
