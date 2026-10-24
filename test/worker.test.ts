import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Worker from "../contracts/Worker.ts"
import { parseJson } from "../src/internal/json.ts"
import { admitWorkerRequest } from "../src/installer/execution/admission.ts"

const Vector = Schema.Struct({ name: Schema.NonEmptyString, request: Worker.OracleRequest, expected: Worker.OracleResponse })
const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(Worker.OracleResponse, { onExcessProperty: "error" })
const same = Schema.toEquivalence(Worker.OracleResponse)

it("conforms to all nine worker admission cases", () => {
  const vectors = readFileSync(new URL("../spec/vectors/worker.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeVector(parseJson(line)))
  expect(new Set(vectors.map(({ request }) => `${request.input.state}/${request.input.signal}`)).size).toBe(9)
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const input = vectors.map(({ request }) => JSON.stringify(Schema.encodeSync(Worker.OracleRequest)(request))).join("\n")
  const result = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const responses = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(vectors.length)
  for (const [index, vector] of vectors.entries()) {
    const before = structuredClone(vector.request.input)
    const actual = decodeResponse({ schema: 1, type: "admit_worker_request", output: admitWorkerRequest(vector.request.input) })
    expect(vector.request.input).toEqual(before)
    const expected = responses[index]
    if (expected === undefined) throw new Error("Missing worker oracle response")
    expect(same(actual, expected), vector.name).toBe(true)
    expect(same(actual, vector.expected), vector.name).toBe(true)
  }
})

it("rejects unknown states, signals and excess fields", () => {
  const decode = Schema.decodeUnknownSync(Worker.OracleRequest, { onExcessProperty: "error" })
  for (const input of [
    {}, { state: "waiting" }, { signal: "request" }, { state: "other", signal: "request" },
    { state: "waiting", signal: "other" }, { state: null, signal: "request" },
    { state: "waiting", signal: true }, { state: "waiting", signal: "request", extra: true }
  ]) expect(() => decode({ schema: 1, type: "admit_worker_request", input })).toThrow()
})
